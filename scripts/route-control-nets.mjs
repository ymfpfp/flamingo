// Batch orchestration of installed native solvers; no geometric search here.
// A failed net never stops the other requested nets. REXT is opt-in so the
// original 21-net pass remains reproducible.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildControlRoutingJobs, solveControlNet, controlPreservationManifest} from '../lib/control-routing.mjs';
import {layoutDigest} from '../lib/layout-geometry.mjs';
import {controlProfiles, controlRoutingPolicy} from '../lib/control-routing-config.mjs';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const input = arg('input', 'dist/control-routing/controls21-baseline.circuit.json');
const out = arg('out', 'dist/control-routing/controls21') + '/';
const timeoutMs = Number(arg('timeout-ms', 10000));
const solverArg=arg('solver','9');
const solverVersion = ['fanout','fanout-pipeline','boundary'].includes(solverArg) ? solverArg : Number(solverArg);
const selected = arg('net', null);
const includeRext = process.argv.includes('--include-rext');
const selectedNets = arg('nets', null)?.split(',');
const contactsFile=arg('planned-vias',null);
const contacts=contactsFile ? JSON.parse(readFileSync(contactsFile)).contacts : [];
const launchesFile=arg('authored-launches',null);
const launches=launchesFile ? JSON.parse(readFileSync(launchesFile)).launches : [];
const python = process.env.PCIE_SI_PYTHON ?? 'python3';
if (![3,4,7,9,'fanout','fanout-pipeline','boundary'].includes(solverVersion) || !(timeoutMs >= 100 && timeoutMs <= 600000)) throw Error('Invalid solver/time budget');
if ((selected === 'REXT' || selectedNets?.includes('REXT')) && !includeRext) throw Error('Use --include-rext for REXT');
mkdirSync(out + 'trials', {recursive: true});
const bytes = readFileSync(input), raw = JSON.parse(bytes), json = raw.circuitJson ?? raw;
const hash = v => createHash('sha256').update(v).digest('hex');
const sourceSha256 = hash(bytes), policySha256 = hash(JSON.stringify({controlProfiles, controlRoutingPolicy}));
if(contactsFile&&JSON.parse(readFileSync(contactsFile)).sourceSha256!==sourceSha256)throw Error('Planned via contacts belong to another board');
if(launchesFile&&JSON.parse(readFileSync(launchesFile)).sourceSha256!==sourceSha256)throw Error('Authored launches belong to another board');
writeFileSync(out + 'baseline.circuit.json', bytes);
writeFileSync(out + 'preserved-layout.json', JSON.stringify(controlPreservationManifest(json)));
const py = (...args) => {
  const r = spawnSync(python, args, {encoding:'utf8'});
  if (r.error || r.status !== 0) throw r.error ?? Error(r.stderr || r.stdout);
  if (r.stdout) console.log(r.stdout.trim());
};
const isolationReference=arg('isolation-reference',null);
py('simulations/control-routing/prepare_obstacles.py', out + 'baseline.circuit.json', out + 'obstacles.json',
  ...(isolationReference ? ['--isolation-reference='+isolationReference] : []));
const cover = JSON.parse(readFileSync(out + 'obstacles.json'));
cover.pourGeometrySha256 = layoutDigest(json.filter(e => e.type === 'pcb_copper_pour' && ['top','bottom'].includes(e.layer)));
cover.isolationGeometrySha256 = layoutDigest(json.filter(e => e.type === 'pcb_trace'));
writeFileSync(out + 'obstacles.json', JSON.stringify(cover));
const jobs = buildControlRoutingJobs(json, {pourCover: cover}).filter(j => includeRext || j.name !== 'REXT');
if (jobs.length !== (includeRext ? 22 : 21) ||
    (selected && !jobs.some(j=>j.name === selected)) ||
    selectedNets?.some(name=>!jobs.some(j=>j.name === name))) throw Error('Control-net selection mismatch');
writeFileSync(out + 'jobs.json', JSON.stringify(jobs.map(({simpleRouteJson,...j})=>j)));
let results = [];
if (process.argv.includes('--resume') && existsSync(out + 'results.json')) {
  const previous = JSON.parse(readFileSync(out + 'results.json'));
  if (previous.sourceSha256 !== sourceSha256 || previous.policySha256 !== policySha256) throw Error('Cannot resume stale geometry or rules');
  results = previous.results;
}
const staged = () => results.filter(r=>r.acceptedForStaging);
const screen = proposed => {
  writeFileSync(out + 'candidates.json', JSON.stringify({results:proposed}));
  py('simulations/control-routing/check_acceptance.py', out + 'baseline.circuit.json', out + 'jobs.json',
    out + 'candidates.json', out + 'physical-audit.json', out + 'obstacles.json');
  return JSON.parse(readFileSync(out + 'physical-audit.json'));
};
const esc = v => String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const save = () => {
  const summary = {sourceSha256, policySha256, excludedNets:includeRext?[]:['REXT'], configuredNets:jobs.length,
    attemptedNets:results.length, nativeSolvedNets:results.filter(r=>r.solved).length,
    physicallyScreenedNets:staged().length, appliedToSource:false, finalized:false, results};
  writeFileSync(out + 'results.json', JSON.stringify(summary,null,2)+'\n');
  const rows = jobs.map(job=>{
    const r=results.find(r=>r.net === job.name);
    const failures=r?.physicalCheck?.failures ?? [];
    return `<tr><td>${esc(job.name)}</td><td>${!r?'Pending':r.acceptedForStaging?'Physical screen passed':r.solved?'Rejected':'Unresolved'}</td><td>${esc(r?.reason ?? [...new Set(failures.map(f=>f.rule+': '+f.detail))].join('; '))}</td></tr>`;
  }).join('');
  writeFileSync(out+'report.html',`<!doctype html><html lang="en"><meta charset="utf-8"><title>Control-net autorouting pass</title><style>body{font:16px system-ui;max-width:1300px;margin:32px auto;padding:0 24px;color:#162332}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cbd3dd;padding:8px;text-align:left}th{background:#eaf0f5}</style><h1>Control-net autorouting pass</h1><p>${summary.attemptedNets}/${jobs.length} nets attempted; ${summary.nativeSolvedNets} produced native paths; ${summary.physicallyScreenedNets} passed physical screening. ${includeRext?'REXT is included.':'REXT is deferred.'} No new copper has been applied to the source.</p><p>Existing routes and component positions remain fixed. New signals use top/bottom, literal profile widths and edge clearances. Actual copper, full-stack via/drill clearance, physical connectivity, length and ground reference are screened separately. A successful screen still requires source integration, native pour refill, prior-route continuity, shorts, placement, style and the impedance/topology review.</p><table><thead><tr><th>Net</th><th>Result</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table><p><a href="results.json">Detailed results</a></p></html>`);
};
save();
const requestedJobs=jobs.filter(j=>(!selected || j.name === selected) && (!selectedNets || selectedNets.includes(j.name)));
if(selectedNets)requestedJobs.sort((a,b)=>selectedNets.indexOf(a.name)-selectedNets.indexOf(b.name));
for (const original of requestedJobs) {
  if (results.some(r=>r.net === original.name && r.acceptedForStaging)) continue;
  const job={...original,routingPaddingMm:Number(arg('padding',6)), nativeExtraClearanceMm:Number(arg('extra-clearance',0)),
    nativeComponentTopology:arg('native-components',null),
    nativeClearanceGeometry:process.argv.includes('--encode-clearance'),
    exactObstacleGridMm:Number(arg('exact-grid',.1)),
    plannedTerminalVias:contacts.filter(c=>c.net===original.name&&c.passed&&!c.selector.startsWith('PCIe.')),
    authoredLaunches:launches.filter(l=>l.net===original.name&&l.physicalCheck?.passed),
    forcePlannedViaBottom:process.argv.includes('--force-planned-bottom'),
    pruneObstacles:process.argv.includes('--prune-obstacles')};
  console.log(`Routing ${job.name}: native Pipeline ${solverVersion}, ${timeoutMs/1000}s`);
  const old = results.find(r=>r.net === job.name);
  const preceding=staged().flatMap(r=>r.traces.map(trace=>({net:r.net,clearanceMm:jobs.find(j=>j.name === r.net).rule.clearanceMm,trace})));
  if(process.argv.includes('--exact-obstacles')) {
    writeFileSync(out+'exact-job.json',JSON.stringify({...job,simpleRouteJson:undefined}));
    writeFileSync(out+'exact-staged.json',JSON.stringify(staged().map(r=>({...r,
      sourcePortId:jobs.find(j=>j.name===r.net).terminals[0].sourcePortId,clearanceMm:jobs.find(j=>j.name===r.net).rule.clearanceMm}))));
    py('simulations/control-routing/prepare_exact_obstacles.py',out+'baseline.circuit.json',out+'exact-job.json',out+'exact-staged.json',out+'obstacles.json',out+'exact-cover.json');
    job.exactObstacleCover=JSON.parse(readFileSync(out+'exact-cover.json'));
  }
  let result;
  try {result=process.argv.includes('--force-branches')&&job.terminals.length>2
    ? {solved:false,reason:'Explicit native branch pass requested'}
    : await solveControlNet(job,preceding,{timeoutMs,solverVersion,
    onProgress:phase=>console.log(`${job.name}: ${phase}`)});}
  catch(error){result={solved:false,reason:error.message};}
  if (!result.solved && (process.argv.includes('--branch-retry')||process.argv.includes('--force-branches')) && job.terminals.length > 2) {
    const traces=[];let reason;
    for (const branch of job.branches) {
      console.log(`${job.name}: native branch ${branch.from} -> ${branch.to}`);
      const pair={...job,terminals:[branch.from,branch.to].map(s=>job.terminals.find(t=>t.selector===s)),
        authoredLaunches:job.authoredLaunches.filter(p=>[branch.from,branch.to].includes(p.selector)),
        plannedTerminalVias:job.plannedTerminalVias.filter(p=>[branch.from,branch.to].includes(p.selector))};
      let retry;
      try {retry=await solveControlNet(pair,preceding,{timeoutMs:Math.min(timeoutMs,30000),solverVersion,effort:1});}
      catch(error){retry={solved:false,reason:error.message};}
      if (!retry.solved){reason=retry.reason;result={...retry,stage:'native-explicit-branch'};break;}
      traces.push(...retry.traces.map((t,i)=>({...t,pcb_trace_id:`${job.name}_branch_${traces.length+i}`})));
    }
    if (!reason) result={solved:true,stage:'native-explicit-branch-retry',traces,
      viaCount:traces.flatMap(t=>t.route).filter(p=>p.route_type==='via').length};
  }
  if (result.solved) {
    const audit=screen([...staged(),{net:job.name,...result}]);
    const names=new Set([...staged().map(r=>r.net),job.name]);
    result.physicalCheck=audit.nets.find(n=>n.net === job.name);
    result.acceptedForStaging=audit.nets.filter(n=>names.has(n.net)).every(n=>n.passed);
    if (!result.acceptedForStaging && result.physicalCheck.passed) {
      result.physicalCheck.passed=false;
      result.physicalCheck.failures.push({rule:'previous-control-reference',detail:'Candidate invalidates a previously screened net'});
    }
  }
  const row={net:job.name,solverVersion,timeoutMs,...result,
    attempts:[...(old?.attempts??[]),{solverVersion,timeoutMs,solved:result.solved,accepted:result.acceptedForStaging??false,reason:result.reason}]};
  results=results.filter(r=>r.net !== job.name);results.push(row);
  writeFileSync(out+`trials/${job.name}.json`,JSON.stringify(row,null,2));save();
  console.log(`${job.name}: ${row.acceptedForStaging?'PHYSICAL SCREEN PASS':row.solved?'PHYSICAL SCREEN REJECTED':row.reason}`);
}
if(hash(readFileSync(input))!==sourceSha256)throw Error('Routing baseline changed during search');
screen(staged());save();
console.log(`Completed native pass: ${staged().length}/${jobs.length} pass physical screening; no new copper applied.`);
