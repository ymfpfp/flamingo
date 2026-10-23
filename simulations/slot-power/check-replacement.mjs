import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createEngine} from '../power-reset/engine.mjs';
import {circuitGraph} from '../../lib/circuit-graph.mjs';

// Candidate evaluation from either the original board or the installed rc10k setup.
// This runner does not edit the board or the BOM.
const out=process.env.SLOT_REPLACEMENT_OUT??'dist/slot-mosfet-replacement-2026-10-22';
await mkdir(out,{recursive:true});
const runnerRaw=await readFile(new URL(import.meta.url));
await writeFile(`${out}/runner.mjs`,runnerRaw);
const boardFile=process.env.SLOT_BOARD_FILE??'dist/board.circuit.json';
const boardRaw=await readFile(boardFile),g=circuitGraph(JSON.parse(boardRaw));
const installed=g.component('Q_SLOT_12V').manufacturer_part_number==='SI4497DY-T1-GE3';
for(const [name,field,value] of [['Q_SLOT_12V','manufacturer_part_number',installed?'SI4497DY-T1-GE3':'AO4407A'],['R_SLOT_GATE_12V','resistance',installed?10000:510],['R_SLOT_OFF_12V','resistance',installed?10000:100000],['C_SLOT_GATE_12V','capacitance',10e-6],['C134','capacitance',470e-6],['R_SLOT_DISCHARGE_12V','resistance',1000],['Q_SLOT_DRV_12V','manufacturer_part_number','NX3008NBK,215']]){
  if(g.component(name)[field]!==value)throw Error(`Board assumptions changed: ${name}.${field}`);
}
const modelPath='datasheets/research/slot-mosfet-startup-2026-10-22/Si4497DY-Si4497DY_PS.txt';
const modelRaw=await readFile(modelPath,'utf8');
// PSpice's T_MEASURED is ngspice's TNOM for the body diode. TRS1 is supported.
const vendor=modelRaw.replace(/\r/g,'').replace('T_MEASURED = 25','TNOM = 25');
const engine=await createEngine();
const configs={
  dropin:{rg:510,roff:100000,cap:10e-6,capNode:'source'},
  rc2k:{rg:2000,roff:2000,cap:10e-6,capNode:'source'},
  rc5k:{rg:5100,roff:5100,cap:10e-6,capNode:'source'},
  rc10k:{rg:10000,roff:10000,cap:10e-6,capNode:'source'},
  rc22k:{rg:22000,roff:22000,cap:10e-6,capNode:'source'},
  dual100:{rg:10000,roff:10000,cap:1e-6,capNode:'source',miller:100e-9},
  dual220:{rg:10000,roff:10000,cap:1e-6,capNode:'source',miller:220e-9},
  dual330:{rg:10000,roff:10000,cap:1e-6,capNode:'source',miller:330e-9},
  dual470:{rg:10000,roff:10000,cap:1e-6,capNode:'source',miller:470e-9},
  dual220old:{rg:10000,roff:10000,cap:10e-6,capNode:'source',miller:220e-9},
  miller100:{rg:10000,roff:10000,cap:100e-9,capNode:'out'},
  miller220:{rg:10000,roff:10000,cap:220e-9,capNode:'out'},
  miller330:{rg:10000,roff:10000,cap:330e-9,capNode:'out'},
  miller470:{rg:10000,roff:10000,cap:470e-9,capNode:'out'},
};
const detailed=process.argv.includes('--full');
const focused=process.argv.includes('--focus');
const sourceStudy=process.argv.includes('--source-study');
const configsWanted=(process.env.SLOT_CONFIGS??Object.keys(configs).join(',')).split(',');
const cases=[];
for(const config of configsWanted){
  if(!configs[config])throw Error('Unknown config '+config);
  const add=x=>cases.push({config,temp:125,supply:12.6,gateFactor:1,cardUF:1000,load:'resistive',offMs:1000,kind:'control',sourceR:.025,...x});
  if(sourceStudy){
    for(const temp of [85,125])for(const riseMs of [.1,1,10])for(const offMs of [1,10,100])
    add({kind:'source',temp,riseMs,offMs,sourceControl:'high',sourceMode:'blocking',fallMs:Math.min(1,offMs/2)});
    continue;
  }
  if(focused){
    for(const temp of [25,85,125])for(const gateFactor of [.5,1.1])for(const load of ['resistive','uvlo'])add({temp,gateFactor,load});
    for(const offMs of [1,10,100])for(const temp of [85,125])for(const load of ['resistive','uvlo'])add({offMs,temp,load});
    for(const offMs of [1,10,100])for(const temp of [85,125])for(const sourceControl of ['high','low'])add({kind:'source',offMs,temp,sourceControl});
    for(const temp of [25,85,125])for(const gateFactor of [.5,1.1])add({temp,gateFactor,cardUF:2000});
    for(const supply of [11.4])for(const temp of [85,125])for(const gateFactor of [.5,1.1])add({supply,temp,gateFactor});
    continue;
  }
  if(!detailed){for(const temp of [25,125])for(const gateFactor of [.5,1.1])add({temp,gateFactor});continue;}
  for(const temp of [25,85,125])for(const supply of [11.4,12.6])
  for(const gateFactor of [.5,1.1])for(const cardUF of [0,1000])
  for(const load of ['idle','resistive','uvlo'])add({temp,supply,gateFactor,cardUF,load});
  for(const offMs of [1,10,100,3000])for(const gateFactor of [.5,1.1])
  for(const load of ['resistive','uvlo'])add({offMs,gateFactor,load});
  for(const offMs of [1,10,100])for(const sourceControl of ['high','low'])
  for(const load of ['resistive','uvlo'])add({kind:'source',offMs,sourceControl,load});
  for(const cardUF of [2000])for(const temp of [25,125])for(const gateFactor of [.5,1.1])add({cardUF,temp,gateFactor});
  for(const sourceR of [.005,.1])for(const kind of ['control','source'])add({sourceR,kind,sourceControl:'high',offMs:100});
}
const rows=[];
const pulse=([t,v])=>`${t}m ${v}`;
for(let index=0;index<cases.length;index++){
  const q=cases[index],c=configs[q.config],off=q.config==='dropin'?500:150,re=off+q.offMs,end=re+(q.config==='dropin'?500:150);
  const control=q.kind==='source'&&q.sourceControl==='high'?[[0,0],[2,0],[2.001,2.4],[end,2.4]]
    :[[0,0],[2,0],[2.001,2.4],[off,2.4],[off+.001,0],[re,0],[re+.001,2.4],[end,2.4]];
  const rise=q.riseMs??.1,fall=q.fallMs??.1;
  const vin=q.kind==='source'?[[0,0],[rise,q.supply],[off,q.supply],[off+fall,0],[re,0],[re+rise,q.supply],[end,q.supply]]
    :[[0,0],[rise,q.supply],[end,q.supply]];
  const load=q.load==='idle'?'R_LOAD out 0 1e9':q.load==='resistive'?'R_LOAD out 0 2.181818181818'
    :'B_LOAD out 0 I={5.5*min(max((V(out)-8)/2,0),1)}';
  const deck=`Si4497DY candidate ${JSON.stringify(q)}
.temp ${q.temp}
.options reltol=1e-5 abstol=1e-9 vntol=1e-7 method=gear
V_SUPPLY vin 0 PWL(${vin.map(pulse).join(' ')})
${q.sourceMode==='blocking'?'D_SUPPLY vin feed DSUPPLY\n.model DSUPPLY D(IS=1e-6 N=1 RS=.0001 CJO=100p TT=10n)\nR_SUPPLY_LEAK feed 0 1e9':''}
R_SOURCE ${q.sourceMode==='blocking'?'feed':'vin'} lin ${q.sourceR}
L_SOURCE lin source 200n
V_CONTROL control 0 PWL(${control.map(pulse).join(' ')})
B_DRIVER sink 0 I={min(max(V(control)/1.8,0),1)*min(max(V(sink),0)/2.8,.01)}
D_DRIVER 0 sink DCLAMP
.model DCLAMP D(IS=1e-12 RS=1 CJO=20p TT=10n)
R_GATE sink gate ${c.rg}
R_PULLUP source gate ${c.roff}
C_GATE ${c.capNode} gate ${c.cap*q.gateFactor} IC=0
${c.miller?`C_MILLER out gate ${c.miller*q.gateFactor} IC=0`:''}
X_POWER drain gate source Si4497DY
V_DRAIN drain out 0
R_ESR out bulk .015
C_BULK bulk 0 ${470e-6*1.44} IC=0
${q.cardUF?`R_CARD out card .02\nC_CARD card 0 ${q.cardUF*1e-6} IC=0`:''}
C_CERAMIC out 0 .2u IC=0
R_BLEED out 0 1000
${load}
B_IMON imon 0 V={I(V_DRAIN)}
B_PMON pmon 0 V={max(V(source,drain)*I(V_DRAIN),0)}
B_VDS vds 0 V={V(source,drain)}
B_VGS vgs 0 V={V(source,gate)}
B_IDRIVER idriver 0 V={I(R_GATE)}
${vendor}
.tran ${process.env.SLOT_STEP_US??10}u ${end}m 0 ${process.env.SLOT_MAXSTEP_US??20}u
.save v(out) v(imon) v(pmon) v(vds) v(vgs) v(source) v(bulk) ${q.cardUF?'v(card) ':''}v(idriver)
.end
`;
  let graphs,usedDeck,attempt;
  for(attempt=0;attempt<3;attempt++){
    usedDeck=attempt===0?deck:deck.replace('method=gear',attempt===1?'method=trap itl4=500 trtol=1':'method=gear itl4=1000 trtol=1')
      .replace(/\.tran .*\n/,`.tran 2u ${end}m 0 2u\n`);
    const sim=await engine.simulate(usedDeck);
    graphs=sim.simulationResultCircuitJson;
    const w=graphs?.find(x=>x.name==='out');
    if(w?.timestamps_ms.at(-1)>=end-.01&&w.voltage_levels.every(Number.isFinite))break;
    if(index===0)await writeFile(`${out}/solver-debug.json`,JSON.stringify(sim));
  }
  const wave=n=>{const w=graphs?.find(x=>x.name===n);if(!w||w.timestamps_ms.at(-1)<end-.01||!w.voltage_levels.every(Number.isFinite))throw Error(`Invalid ${index} ${n}`);return w.voltage_levels;};
  const ts=graphs.find(x=>x.name==='out').timestamps_ms;
  const vout=wave('out'),is=wave('imon'),ps=wave('pmon'),vs=wave('vds'),vg=wave('vgs'),vb=wave('bulk'),sourceV=wave('source');
  if(vout.some(v=>v< -2||v>q.supply*1.3))throw Error(`Nonphysical output voltage, case ${index}`);
  const vc=q.cardUF?wave('card'):null,idriver=wave('idriver');
  const events={};
  for(const [name,lo,hi]of[['startup',0,off],['shutdown',off,re],['restart',re,end]]){
    const ids=ts.flatMap((t,i)=>t>=lo&&t<=hi?[i]:[]);
    const linear=ids.filter(i=>vs[i]>.36&&is[i]>.05);
    const peak=ids.reduce((a,b)=>ps[b]>ps[a]?b:a,ids[0]);
    let totalEnergy=0,energy=0;
    for(let i=1;i<ids.length;i++){const a=ids[i-1],b=ids[i];energy+=(ts[b]-ts[a])/2000*(ps[a]+ps[b]);}
    totalEnergy=energy;energy=0;
    if(linear.length)for(let i=linear[0]+1;i<=linear.at(-1);i++)energy+=(ts[i]-ts[i-1])/2000*(ps[i]+ps[i-1]);
    events[name]={peakPowerW:ps[peak],peakCurrentA:ids.reduce((a,i)=>Math.max(a,is[i]),0),energyJ:energy,totalEnergyJ:totalEnergy,
      linearPeakPowerW:linear.reduce((a,i)=>Math.max(a,vs[i]*is[i]),0),
      linearDurationMs:linear.length?ts[linear.at(-1)]-ts[linear[0]]:0,
      largestVdsV:linear.reduce((a,i)=>Math.max(a,vs[i]),0),equivalentWidthMs:1000*energy/Math.max(ps[peak],1e-20),
      reversePeakA:ids.reduce((a,i)=>Math.max(a,-is[i]),0),peak:{timeMs:ts[peak],vds:vs[peak],id:is[peak]},
      points:linear.filter((_,i)=>i%10===0).map(i=>[ts[i],vs[i],is[i]])};
  }
  let charge=0;const loadAt=v=>q.load==='idle'?v/1e9:q.load==='resistive'?v/2.181818181818:5.5*Math.min(Math.max((v-8)/2,0),1);
  for(let i=1;i<ts.length;i++)charge+=(ts[i]-ts[i-1])/2000*((is[i]-loadAt(vout[i])-vout[i]/1000)+(is[i-1]-loadAt(vout[i-1])-vout[i-1]/1000));
  const expected=470e-6*1.44*(vb.at(-1)-vb[0])+.2e-6*(vout.at(-1)-vout[0])+(vc?q.cardUF*1e-6*(vc.at(-1)-vc[0]):0)
    +((c.capNode==='out'?c.cap:0)+(c.miller??0))*q.gateFactor*((vout.at(-1)-sourceV.at(-1)+vg.at(-1))-(vout[0]-sourceV[0]+vg[0]));
  const at=time=>ts.findIndex(t=>t>=time);
  const row={index,...q,...c,attempt,events,finalOutputV:vout.at(-1),finalGateV:vg.at(-1),
    minimumGateV:vg.reduce((a,v)=>Math.min(a,v),Infinity),maximumGateV:vg.reduce((a,v)=>Math.max(a,v),-Infinity),peakDriverA:idriver.reduce((a,v)=>Math.max(a,Math.abs(v)),0),
    outputBeforeRestartV:vout[at(re)-1],gateBeforeRestartV:vg[at(re)-1],
    maximumOutputBeforeEnableV:ts.reduce((a,t,i)=>t<2?Math.max(a,vout[i]):a,0),
    chargeResidual:Math.abs(charge-expected)/Math.max(Math.abs(expected),1e-9)};
  rows.push(row);
  await writeFile(`${out}/case-${String(index).padStart(3,'0')}.json`,JSON.stringify(row));
  // Keep all exact input decks; plotted waveform samples do not drive the calculations.
  await writeFile(`${out}/case-${String(index).padStart(3,'0')}.cir`,usedDeck);
  const keep=ts.map((_,i)=>i).filter(i=>i%5===0);
  await writeFile(`${out}/wave-${String(index).padStart(3,'0')}.json`,JSON.stringify({timeMs:keep.map(i=>ts[i]),outputV:keep.map(i=>vout[i]),currentA:keep.map(i=>is[i]),powerW:keep.map(i=>ps[i]),vdsV:keep.map(i=>vs[i]),vgsV:keep.map(i=>vg[i])}));
  console.log(`${index+1}/${cases.length} ${q.config} ${q.kind} ${q.temp}C: start ${events.startup.peakPowerW.toFixed(1)} W, off ${events.shutdown.peakPowerW.toFixed(1)} W/${events.shutdown.energyJ.toFixed(3)} J, final ${row.finalOutputV.toFixed(2)} V, charge ${(row.chargeResidual*100).toFixed(3)}%`);
}
const sha=x=>createHash('sha256').update(x).digest('hex');
await writeFile(`${out}/results.json`,JSON.stringify({date:'2026-10-23',boardFile,boardConfiguration:installed?'installed-rc10k':'original-ao4407a',configs,modelPath,modelSha256:sha(modelRaw),runnerSha256:sha(runnerRaw),boardSha256:sha(boardRaw),modelAdaptations:['Normalize CRLF','Rename PSpice diode T_MEASURED to ngspice TNOM'],rows},null,2));
