// Native source-phase entry point. Default: capture actual phase/solver input.
// --route also searches, but rejected/partial copper never updates the source.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {RootCircuit} from 'tscircuit';
import Board from '../index.circuit';
import {loadBoard} from './build-board.mjs';
import {buildControlRoutingJobs} from '../lib/control-routing.mjs';
import {nativeControlRouting} from '../lib/control-native-autorouter.mjs';
import {assembledPlacements, layoutDigest, routeDigest} from '../lib/layout-geometry.mjs';
import {controlNets, controlProfiles, controlRoutingPolicy} from '../lib/control-routing-config.mjs';

const out = 'dist/control-routing/native/';
mkdirSync(out, {recursive: true});
const route = process.argv.includes('--route');
const python = process.env.PCIE_SI_PYTHON ?? 'python3';
const inputFile = process.argv.find(arg => arg.startsWith('--input='))?.slice(8);
const sourceAtStart = readFileSync('index.circuit.tsx');
const baseline = await loadBoard(inputFile);
const baselineFile = out + 'baseline.circuit.json';
writeFileSync(baselineFile, JSON.stringify(baseline));
const coverFile = out + 'obstacles.json';
const py = (...args) => {
  const result = spawnSync(python, args, {stdio: 'inherit'});
  if (result.error || result.status !== 0) throw result.error ?? Error(`Validation failed: ${args[0]}`);
};
py('simulations/control-routing/prepare_obstacles.py', baselineFile, coverFile);
const pourCover = JSON.parse(readFileSync(coverFile));
pourCover.pourGeometrySha256 = layoutDigest(baseline.filter(e => e.type === 'pcb_copper_pour' && ['top','bottom'].includes(e.layer)));
pourCover.isolationGeometrySha256 = layoutDigest(baseline.filter(e => e.type === 'pcb_trace'));
writeFileSync(coverFile, JSON.stringify(pourCover));
const jobs = buildControlRoutingJobs(baseline, {pourCover});
writeFileSync(out + 'jobs.json', JSON.stringify(jobs.map(({simpleRouteJson, ...job}) => job)));
py('simulations/control-routing/check_feasibility.py', baselineFile, coverFile, out + 'rext-feasibility.json');
const captures = [], accepted = [];
const routing = nativeControlRouting({jobs, captureOnly: !route,
  onInput: ({name, phaseInput, solverInput, acceptance}) => {
    writeFileSync(out + name + '.phase.srj.json', JSON.stringify(phaseInput));
    if (solverInput) writeFileSync(out + name + '.solver.srj.json', JSON.stringify(solverInput));
    captures.push({name, connections: phaseInput.connections.length,
      editableOldTraces: phaseInput.traces?.length ?? 0,
      widthMm: solverInput?.minTraceWidth, edgeClearanceMm: solverInput?.defaultObstacleMargin,
      signalLayers: solverInput ? ['top', 'bottom'] : undefined,
      maximumLengthMm: acceptance?.maxLengthMm,
      impedanceTargetOhms: acceptance?.impedanceOhms,
      lengthPlaneImpedanceAndFullStackVias: 'mandatory post-route checks'});
    console.log(`Native phase input: ${name}`);
  },
  accept: async (job, result) => {
    const proposed = [...accepted, {net: job.name, ...result}];
    writeFileSync(out + 'candidates.json', JSON.stringify({results: proposed}));
    py('simulations/control-routing/check_acceptance.py', baselineFile, out + 'jobs.json',
      out + 'candidates.json', out + 'acceptance.json', coverFile);
    const audit = JSON.parse(readFileSync(out + 'acceptance.json'));
    const names = new Set(proposed.map(r => r.net));
    if (!audit.nets.filter(n => names.has(n.net)).every(n => n.passed))
      throw Error('Independent physical checks rejected this candidate');
    accepted.push({net: job.name, ...result, acceptedForStaging: true});
  },
});
const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDrcChecksDisabled: true}});
circuit.schematicDisabled = true; // Source connectivity remains; no schematic drawing is needed for the input probe.
circuit.add(Board({controlAutorouting: routing}));
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const copper = j => j.filter(e => e.type === 'pcb_trace').map(t => routeDigest(t.route)).sort();
const vias = j => j.filter(e => e.type === 'pcb_via').map(v => layoutDigest({x:v.x,y:v.y,layers:v.layers,outer:v.outer_diameter,hole:v.hole_diameter})).sort();
const errors = json.filter(e => e.type === 'pcb_autorouting_error').map(e => e.message);
const capturedNets = new Set(captures.map(c => c.name));
const summary = {mode: route ? 'native search with physical acceptance' : 'input capture only; no routes generated',
  routeRemaining: true, sourceSha256: createHash('sha256').update(sourceAtStart).digest('hex'),
  sourceIndexUnchangedDuringRun: sourceAtStart.equals(readFileSync('index.circuit.tsx')),
  policy: {controlProfiles, controlRoutingPolicy},
  all22PoliciesReachedNativePhases: controlNets.every(n => capturedNets.has(n.name)),
  allExistingTracesFixed: captures.every(c => c.editableOldTraces === 0),
  existingTraceGeometryPreserved: !route && layoutDigest(copper(json)) === layoutDigest(copper(baseline)),
  existingViaGeometryPreserved: !route && layoutDigest(vias(json)) === layoutDigest(vias(baseline)),
  assembledPlacementPreserved: layoutDigest(assembledPlacements(json)) === layoutDigest(assembledPlacements(baseline)),
  allAssembledComponentsOnTop: assembledPlacements(json).every(p => p.layer === 'top'),
  captures, errors, appliedToSource: false, finalized: false};
writeFileSync(out + 'summary.json', JSON.stringify(summary, null, 2) + '\n');
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const rows = controlNets.map(net => {
  const p = controlProfiles[net.profile], captured = captures.find(c => c.name === net.name);
  return `<tr><td>${esc(net.name)}</td><td>${p.widthMm}</td><td>${p.clearanceMm}</td><td>${p.maxLengthMm}</td><td>${p.impedanceOhms ? `${p.impedanceOhms} ±${p.impedanceTolerancePercent}%` : '—'}</td><td>${captured ? 'Captured' : 'Missing'}</td></tr>`;
}).join('');
writeFileSync(out + 'report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Native control autorouter rules</title><style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 24px;color:#162332}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #cbd3dd;padding:8px;text-align:left}th{background:#eaf0f5}.status{background:#fff0cf;padding:16px}code{overflow-wrap:anywhere}</style>
<h1>Native control autorouter rules</h1><p class="status"><strong>${esc(summary.mode)}.</strong> ${captures.filter(c => c.name !== 'UNASSIGNED').length}/22 control phases captured. Routing is not finalized and no control copper has been applied to the source.</p>
<p>The source pass enables <code>routeRemaining=true</code>. Each control net has an explicit native routing phase. The adapter passes its width and edge clearance to native Pipeline 9, restricts signals to top and bottom, and fixes existing copper as obstacles. Unknown remaining nets require an explicit policy.</p>
<p>Existing trace geometry preserved: ${summary.existingTraceGeometryPreserved}; existing vias preserved: ${summary.existingViaGeometryPreserved}; all assembly on top: ${summary.allAssembledComponentsOnTop}. <a href="summary.json">Full capture summary</a>.</p>
<p><strong>Blocked launch:</strong> REXT cannot meet the literal width and spacing while the nearby clock and PCIe copper remain fixed. <a href="rext-feasibility.json">Geometric check</a>. No narrow escape or reduced-clearance exception is enabled.</p>
<p>Lengths, actual copper/drill clearance, physical connectivity, ground-reference continuity and full-stack via clearance are measured after routing. The impedance targets require a separate stackup/SI check. SPI programming-header branches still require topology review. SBU spacing and the 10 mm REXT ceiling are project targets, as described in the rule sources.</p>
<table><thead><tr><th>Net</th><th>Width mm</th><th>Edge gap mm</th><th>Length ceiling mm</th><th>Impedance target Ω</th><th>Native input</th></tr></thead><tbody>${rows}</tbody></table>
<p>${errors.map(esc).join('<br>')}</p></html>`);
console.log(JSON.stringify({...summary, captures: captures.length, policy: undefined}, null, 2));
if (!summary.sourceIndexUnchangedDuringRun || !summary.all22PoliciesReachedNativePhases || !summary.allExistingTracesFixed ||
    !summary.assembledPlacementPreserved || !summary.allAssembledComponentsOnTop || errors.length ||
    (!route && (!summary.existingTraceGeometryPreserved || !summary.existingViaGeometryPreserved))) process.exitCode = 2;
