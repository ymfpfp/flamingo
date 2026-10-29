// Rebuild once, retain exact inputs, and run the electrical review campaign.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const args=process.argv.slice(2);
if(args.some(a=>!a.startsWith('--board=')&&!a.startsWith('--out=')))throw Error('Use --board=PATH or --out=PATH');
const out=args.find(a=>a.startsWith('--out='))?.slice(6)??'dist/reliability-2026-10-23';
const supplied=args.find(a=>a.startsWith('--board='))?.slice(8);
const board=`${out}/board.circuit.json`,python=process.env.PCIE_SI_PYTHON??'python3';
mkdirSync(`${out}/logs`,{recursive:true});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(p=>existsSync(p));
const inputs=Object.fromEntries(files.map(p=>[p,sha(p)]));
const record={startedAt:new Date().toISOString(),sourceSha256:null,inputSha256:inputs,stages:[],hardwareQualified:false};
function save(){writeFileSync(`${out}/execution.json`,JSON.stringify(record,null,2)+'\n');}
async function run(name,command,argv,{env={},artifacts=[]}={}){
  console.log(`Starting ${name}`);
  const start=Date.now(),log=`${out}/logs/${name}.log`;
  const entry={name,command,argv,log,status:'running',artifacts:[]};record.stages.push(entry);save();
  const chunks=[];
  const status=await new Promise(done=>{
    const p=spawn(command,argv,{env:{...process.env,MPLCONFIGDIR:resolve(`${out}/matplotlib`),...env},stdio:['ignore','pipe','pipe']});
    p.stdout.on('data',b=>chunks.push(b));p.stderr.on('data',b=>chunks.push(b));
    p.on('error',e=>{chunks.push(Buffer.from(String(e)));done(-1);});p.on('close',code=>done(code??-1));
  });
  writeFileSync(log,Buffer.concat(chunks));
  entry.status=status===0?'completed':'failed';entry.exitCode=status;entry.seconds=(Date.now()-start)/1000;
  for(const [source,target] of artifacts)if(existsSync(source)){
    const dest=`${out}/${target}`;mkdirSync(resolve(dest,'..'),{recursive:true});copyFileSync(source,dest);
    entry.artifacts.push({path:dest,sha256:sha(dest)});
  }
  save();console.log(`${name}: ${entry.status} (${entry.seconds.toFixed(1)} s)`);
  return status;
}
if(supplied)copyFileSync(supplied,board);
else if(await run('build','bun',['scripts/build-board.mjs',board]))throw Error('Fresh board build failed');
record.sourceSha256=sha(board);save();
const stage=(name,script,argv=[],options={})=>run(name,'bun',[script,...argv],options);
const py=(name,script,argv=[],options={})=>run(name,python,[script,...argv],options);
await run('typecheck','bun',['run','typecheck']);
await run('regression','bun',['test','./tests','--timeout','120000'],{env:{BOARD_TEST_FIXTURE:board}});
await stage('board','scripts/validate-board.mjs',[board,'--require-routed'],{env:{PCIE_SI_PYTHON:python},artifacts:[['dist/validation/board.json','validation.json'],['dist/power-distribution/dc-audit.json','pdn-dc.json'],['dist/slot-power-routing/dc-audit.json','slot-dc.json'],['dist/atx5v-routing/dc-audit.json','atx5v-dc.json']]});
await stage('schematic','scripts/audit-schematic.mjs',[board],{artifacts:[['dist/schematic-review/connectivity.json','schematic.json'],['dist/schematic-review/margins.json','margins.json'],['dist/schematic-review/datasheet-check.json','datasheets.json']]});
await stage('reset','scripts/simulate-power-reset.jsx',[],{artifacts:[['dist/power-reset/report.json','reset.json']]});
await stage('driver','scripts/simulate-slot-driver.jsx',[board],{artifacts:[['dist/slot-power/driver/report.json','driver.json']]});
await stage('slot3v3-startup','simulations/slot-power/check-capacitor-startup.mjs',[board],{artifacts:[['dist/slot-power/capacitor-startup/report.json','slot3v3-startup.json']]});
await stage('slot3v3-numerics','simulations/slot-power/validate-capacitor-model.mjs',[],{artifacts:[['dist/slot-power/capacitor-startup/model-validation.json','slot3v3-numerics.json']]});
await stage('slot12v','simulations/slot-power/check-replacement.mjs',['--full'],{env:{SLOT_BOARD_FILE:board,SLOT_REPLACEMENT_OUT:`${out}/slot12v`,SLOT_CONFIGS:'rc10k'}});
await stage('slot12v-numerics','simulations/reliability/check-slot12.mjs',[`${out}/slot12v`]);
await stage('slot12v-blocking','simulations/slot-power/check-replacement.mjs',['--source-study'],{env:{SLOT_BOARD_FILE:board,SLOT_REPLACEMENT_OUT:`${out}/slot12v-blocking`,SLOT_CONFIGS:'rc10k'}});
await stage('slot3v3-soa','simulations/slot-power/check-startup-soa.mjs',[board,`${out}/slot3v3`,'--rail=3V3']);
await stage('passive','simulations/reliability/passive-corners.mjs',[board,`${out}/passive`]);
await py('3v3-dc','simulations/power-distribution/check_provisional_3v3.py',[board,'--out',`${out}/3v3-dc.json`]);
await py('pth-regression','simulations/reliability/test_plated_barrels.py',[],{env:{BOARD_TEST_FIXTURE:board}});
await stage('power-input','simulations/power-dynamics/prepare_current.mjs',[board,`${out}/pdn-dc.json`,`${out}/power`]);
await py('power','simulations/power-dynamics/run_review.py',['--review',`${out}/power/review-input.json`,'--out',`${out}/power`,'--loads','simulations/power-dynamics/provisional-loads.json']);
await stage('power-numerics','simulations/power-dynamics/check_spice.mjs',[`${out}/power`]);
await py('power-options','simulations/power-dynamics/run_improvement_sweep.py',['--review',`${out}/power/review-input.json`,'--out',`${out}/power`,'--loads','simulations/power-dynamics/provisional-loads.json']);
await py('pcie-si','simulations/pcie-tx/run_review.py',[board],{artifacts:[['dist/pcie-si/report.json','pcie-si.json']]});
await py('usb-si','simulations/usb4/review_impedance.py',[board],{artifacts:[['dist/usb4-si/report.json','usb-si.json']]});
await stage('channel-input','scripts/prepare-channel-review.mjs',[board]);
await py('channel','simulations/channel-si/run_review.py',[],{artifacts:[['dist/si-channel-review/results.json','channel.json'],['dist/si-channel-review/channel-loss-sensitivity.png','channel-loss.png']]});
await py('heatsink','simulations/mechanical/check_heatsink_fit.py',[board],{artifacts:[['dist/heatsink-fit/results.json','heatsink.json']]});
record.inputChanges=files.filter(p=>!existsSync(p)||sha(p)!==inputs[p]);
record.boardUnchanged=sha(board)===record.sourceSha256;
record.completedAt=new Date().toISOString();save();
await py('report','simulations/reliability/render_report.py',[out]);
if(record.stages.some(s=>s.exitCode!==0)||record.inputChanges.length||!record.boardUnchanged)process.exitCode=1;
console.log(`Report: ${out}/report.html. Command completion does not establish electrical qualification.`);
