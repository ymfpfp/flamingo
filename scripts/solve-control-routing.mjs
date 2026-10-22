// Native automatic multilayer routing. Candidate output stays separate until
// the physical six-layer board passes the acceptance checks in setup.json.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildControlRoutingJobs, solveControlNet, checkControlPreservation} from '../lib/control-routing.mjs';
import {controlNets, controlProfiles, controlRoutingPolicy} from '../lib/control-routing-config.mjs';

const out = 'dist/control-routing/', setup = JSON.parse(readFileSync(out + 'setup.json'));
const inputBytes = readFileSync(out + 'input.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const policySha256 = hash(JSON.stringify({controlNets, controlProfiles, controlRoutingPolicy}));
if (setup.policySha256 !== policySha256) throw Error('Routing policy changed since setup. Run bun run setup:controls again.');
if (hash(inputBytes) !== setup.sourceSha256 || hash(readFileSync(setup.sourceFile)) !== setup.sourceSha256)
  throw Error('Board changed since setup. Run bun run setup:controls again.');
const raw = JSON.parse(inputBytes), json = raw.circuitJson ?? raw;
const baseline = JSON.parse(readFileSync('manufacturing/control-routing/preserved-layout.json'));
const preservation = checkControlPreservation(json, baseline);
if (!preservation.passed) throw Error(preservation.failures.join('\n'));
const jobs = buildControlRoutingJobs(json);
const selected = process.argv.find(a => a.startsWith('--net='))?.slice(6);
const timeoutMs = Number(process.argv.find(a => a.startsWith('--timeout-ms='))?.slice(13) ?? 60000);
if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) throw Error('Search timeout must be between 100 and 60000 ms');
if (selected && !jobs.some(j => j.name === selected)) throw Error(`Unknown control net: ${selected}`);
const routed = [], results = [];
const python = process.env.PCIE_SI_PYTHON ?? setup.validationPython ?? 'python3';
const screen = proposed => {
  const file = out + 'staging-trials.json';
  writeFileSync(file, JSON.stringify({results: proposed}));
  const check = spawnSync(python, ['simulations/control-routing/check_acceptance.py',
    out + 'input.json', out + 'jobs.json', file, out + 'staging-audit.json'], {stdio: 'pipe', encoding: 'utf8'});
  if (check.error || check.status !== 0) throw check.error ?? Error(check.stderr);
  return JSON.parse(readFileSync(out + 'staging-audit.json'));
};
mkdirSync(out + 'trials', {recursive: true});
for (const job of jobs.filter(j => !selected || j.name === selected)) {
  console.log(`Native multilayer search: ${job.name} (${job.terminals.length} terminals)`);
  let result;
  try {
    result = await solveControlNet(job, routed, {timeoutMs,
      onProgress: phase => console.log(`${job.name}: ${phase}`)});
  } catch (error) {result = {solved: false, stage: 'native-multilayer', reason: error.message};}
  if (!result.solved && /time budget/.test(result.reason ?? '') && job.terminals.length > 2) {
    // Retry the explicitly inventoried joins as native two-terminal jobs.
    // Each escape, via and geometric path is still chosen by Pipeline 9.
    const traces = []; let reason;
    for (const branch of job.branches) {
      console.log(`${job.name}: native branch retry ${branch.from} -> ${branch.to}`);
      const pair = {...job, terminals: [branch.from, branch.to].map(s => job.terminals.find(t => t.selector === s))};
      let retry;
      try {retry = await solveControlNet(pair, routed, {timeoutMs: Math.min(timeoutMs, 30000), effort: 1});}
      catch (error) {retry = {solved: false, reason: error.message};}
      if (!retry.solved) {reason = retry.reason; break;}
      traces.push(...retry.traces.map((t, i) => ({...t, pcb_trace_id: `${job.name}_branch_${traces.length+i}`})));
    }
    if (!reason) result = {solved: true, stage: 'native-explicit-branch-retry', traces,
      viaCount: traces.flatMap(t => t.route).filter(p => p.route_type === 'via').length, finalAcceptancePending: true};
  }
  if (result.solved) {
    console.log(`${job.name}: independent full-stack candidate screen`);
    const audit = screen([...results.filter(r => r.acceptedForStaging), {net: job.name, ...result}]);
    const affected = audit.nets.filter(n => [job.name, ...results.filter(r => r.acceptedForStaging).map(r => r.net)].includes(n.net));
    result.physicalCheck = audit.nets.find(n => n.net === job.name);
    result.acceptedForStaging = affected.every(n => n.passed);
    if (!result.acceptedForStaging && result.physicalCheck.passed) {
      result.physicalCheck.passed = false;
      result.physicalCheck.failures.push({rule: 'prior-control-preservation',
        detail: 'New candidate would invalidate a previously screened control route'});
    }
    if (!result.acceptedForStaging) console.log(`${job.name}: rejected by physical checks; it will not obstruct later searches`);
  }
  results.push({net: job.name, ...result});
  if (result.acceptedForStaging) for (const trace of result.traces)
    routed.push({net: job.name, clearanceMm: job.rule.clearanceMm, trace});
  writeFileSync(out + `trials/${job.name}.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(job.name + ': ' + (result.solved ? `paths found with ${result.viaCount} automatically placed vias; final acceptance pending` : result.reason));
}
if (hash(readFileSync(setup.sourceFile)) !== setup.sourceSha256) throw Error('Board changed during native routing trials');
const summary = {status: 'native candidates; not applied or qualified', solver: controlRoutingPolicy.router,
  sourceSha256: setup.sourceSha256, selectedNet: selected ?? null, policySha256,
  searchBudgetPerNetMs: timeoutMs, automaticFanoutAndVias: true,
  routingSurfaceModelLayers: 2, physicalBoardLayers: 6,
  attemptedNets: results.length, routedNets: results.filter(r => r.solved).length,
  unsolvedNets: results.filter(r => !r.solved).length,
  physicallyScreenedNets: results.filter(r => r.acceptedForStaging).length,
  allNetsFound: !selected && results.length === setup.netCount && results.every(r => r.solved),
  appliedToBoard: false, preservation, results, remainingAcceptanceChecks: setup.acceptance};
writeFileSync(out + 'native-trials.json', JSON.stringify(summary, null, 2) + '\n');
const wireCheck = spawnSync(process.env.PCIE_SI_PYTHON ?? setup.validationPython ?? 'python3',
  ['simulations/control-routing/check_candidates.py', out + 'input.json', out + 'jobs.json', out + 'native-trials.json', out + 'candidate-wire-audit.json'], {stdio: 'inherit'});
if (wireCheck.error) throw wireCheck.error;
if (wireCheck.status !== 0) throw Error('Independent candidate wire check failed to execute');
const wireAudit = JSON.parse(readFileSync(out + 'candidate-wire-audit.json'));
summary.surfaceWireAudit = wireAudit;
for (const result of results) if (result.solved)
  result.surfaceWireCheck = wireAudit.nets.find(n => n.net === result.net);
writeFileSync(out + 'native-trials.json', JSON.stringify(summary, null, 2) + '\n');
const reportPath = out + 'report.html';
const html = readFileSync(reportPath, 'utf8').replace(/<section id="native-trials">[\s\S]*?<\/section>/, '');
writeFileSync(reportPath, html.replace('</html>', `<section id="native-trials"><h2>Native automatic multilayer results</h2><p>${selected ? `Selected-net verification: ${selected}. ` : "Full configured-net pass. "}${summary.routedNets}/${summary.attemptedNets} attempted nets produced candidate paths; ${summary.unsolvedNets} remain unresolved. Escape paths, via locations, surface changes and net topology are chosen by the native multilayer solver. The physical board remains six layers; the routing model exposes only its two signal surfaces. Candidates are not applied until physical full-stack checks pass.</p><table><thead><tr><th>Net</th><th>Result</th></tr></thead><tbody>${results.map(r => `<tr><td>${r.net}</td><td>${r.solved ? `${r.viaCount} automatically placed vias; surface wire check ${r.surfaceWireCheck?.passed ? 'PASS' : 'FAIL'}; full-stack checks pending` : String(r.reason).replaceAll('&','&amp;').replaceAll('<','&lt;')}</td></tr>`).join('')}</tbody></table></section></html>`));
console.log(`Native automatic routing: ${summary.routedNets}/${summary.attemptedNets} nets found. No board or preview files changed.`);
process.exitCode = 2; // Candidate search is not final board qualification.
