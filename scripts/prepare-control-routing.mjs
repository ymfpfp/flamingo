import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {buildControlRoutingJobs, checkControlPreservation} from '../lib/control-routing.mjs';
import {controlNets, controlProfiles, controlRoutingPolicy} from '../lib/control-routing-config.mjs';
import {createHash} from 'node:crypto';
import {layoutDigest} from '../lib/layout-geometry.mjs';

const file = process.argv[2] ?? 'dist/board.circuit.json';
const raw = readFileSync(file), board = JSON.parse(raw), json = board.circuitJson ?? board;
const out = 'dist/control-routing/';
mkdirSync(out + 'jobs', {recursive: true});
const baseline = JSON.parse(readFileSync('manufacturing/control-routing/preserved-layout.json'));
const preservation = checkControlPreservation(json, baseline);
if (!preservation.passed) throw Error(preservation.failures.join('\n'));
writeFileSync(out + 'input.json', raw);
const python = process.env.PCIE_SI_PYTHON ?? 'python3';
const pythonCheck = spawnSync(python, ['-c', 'import shapely'], {stdio: 'ignore'});
if (pythonCheck.error) throw pythonCheck.error;
if (pythonCheck.status !== 0) throw Error('Control launch checks require Shapely. Set PCIE_SI_PYTHON to the existing SI Python environment, then rerun setup:controls.');
const coverResult = spawnSync(python, ['simulations/control-routing/prepare_obstacles.py', out + 'input.json', out + 'pour-obstacles.json'], {stdio: 'inherit'});
if (coverResult.error) throw coverResult.error;
if (coverResult.status !== 0) throw Error('Surface copper obstacle conversion failed');
const pourCover = JSON.parse(readFileSync(out + 'pour-obstacles.json'));
pourCover.pourGeometrySha256 = layoutDigest(json.filter(e => e.type === 'pcb_copper_pour' && ['top', 'bottom'].includes(e.layer)));
pourCover.isolationGeometrySha256 = layoutDigest(json.filter(e => e.type === 'pcb_trace'));
writeFileSync(out + 'pour-obstacles.json', JSON.stringify(pourCover));
const jobs = buildControlRoutingJobs(json, {pourCover});
writeFileSync(out + 'jobs.json', JSON.stringify(jobs.map(({simpleRouteJson, ...job}) => job), null, 2) + '\n');
for (const job of jobs) writeFileSync(out + `jobs/${job.name}.srj.json`, JSON.stringify(job.simpleRouteJson, null, 2) + '\n');
const result = spawnSync(python,
  ['simulations/control-routing/check_launches.py', out + 'input.json', out + 'jobs.json', out + 'launch-audit.json'], {stdio: 'inherit'});
if (result.error) throw result.error;
if (result.status !== 0) throw Error('Launch feasibility screen failed to execute');
const launches = JSON.parse(readFileSync(out + 'launch-audit.json'));
const policySha256 = createHash('sha256').update(JSON.stringify({controlNets, controlProfiles, controlRoutingPolicy})).digest('hex');
const openItems = [
  'Direct-top launch warnings are advisory. Every net is sent to the native multilayer solver, which selects escape paths and vias automatically. No narrow-trace or reduced-clearance exceptions are enabled.',
  'SPI clock/data/chip-select nets include the programming header and pull-up taps. Review the shared-bus topology against the ASMedia point-to-point guideline.',
  'SBU width/spacing is an explicit project target; the supplied ASMedia layout guide has no separate SBU routing table.',
  '50 ohm +/-15% is a target for SPI/GPIO/UART. Routing widths alone do not verify impedance on the selected stackup.',
];
const summary = {status: 'configured; routing-not-complete',
  sourceFile: file, sourceSha256: createHash('sha256').update(raw).digest('hex'),
  policySha256,
  validationPython: String(spawnSync(python, ['-c', 'import sys; print(sys.executable)'], {encoding: 'utf8'}).stdout).trim(),
  netCount: jobs.length, branchCount: jobs.reduce((n, j) => n + j.branches.length, 0),
  preservation, policy: controlRoutingPolicy, profiles: controlProfiles,
  directTopLaunchWarnings: launches.blockedDirectTopLaunches,
  obstacleConversion: {surfacePours: pourCover.checks.length, rectangles: pourCover.obstacles.length, gridMm: pourCover.gridMm, missedCopperAreaMm2: pourCover.missedCopperAreaMm2},
  openItems, intentionallyUnused: ['ATX 5VSB', 'PCIe V3V3_AUX', 'Unused PCIe data lanes and optional NC sideband pins'],
  acceptance: ['All requested physical terminals connected', 'ASMedia width, spacing and length limits',
    'Unchanged baseline traces, existing vias and assembled geometry', 'Top-only assembly',
    'Preserved pour outlines/connectivity; only independently checked new-via clearance cutouts may change',
    'Full-stack via/drill and fabrication DRC', 'Shorts and trace-style checks',
    'Ground-reference continuity', 'Single-ended impedance screen', 'Reviewed SPI programming-header topology and SBU rule source'],
};
writeFileSync(out + 'setup.json', JSON.stringify(summary, null, 2) + '\n');
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const rows = jobs.map(j => {
  const screened = launches.nets.find(n => n.name === j.name);
  const blocked = screened.terminals.filter(t => !t.topLaunchClear);
  return `<tr><td>${esc(j.name)}</td><td>${esc(j.terminals.map(t => t.selector).join(' → '))}</td><td>${j.rule.widthMm}</td><td>${j.rule.clearanceMm}</td><td>${blocked.length ? blocked.map(t => `${esc(t.selector)}: ${t.availableGapMm.toFixed(4)} mm available; ${t.requiredGapMm} mm required`).join('<br>') : 'Direct top launch screen clear; route search still required'}</td></tr>`;
}).join('');
writeFileSync(out + 'report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Control and support autorouter setup</title><style>body{font:16px system-ui;max-width:1450px;margin:35px auto;padding:0 24px;color:#162332}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:9px;border:1px solid #cbd3dd;text-align:left;vertical-align:top}th{background:#eaf0f5}code{background:#eef2f5;padding:3px}li{margin:8px 0}.status{padding:14px;background:#fff0cf;border-left:5px solid #bd7900}p{max-width:1100px}</style><h1>Control and support autorouter setup</h1><p class="status"><strong>Configured; routing is not complete.</strong> ${summary.netCount} nets / ${summary.branchCount} explicit branches. ${launches.blockedDirectTopLaunches} advisory full-width top launch warnings. The native multilayer solver chooses escape paths and vias automatically. No new copper has been applied to the board.</p><p>Locked baseline: ${preservation.preservedTraceCount} traces, ${preservation.preservedViaCount} vias, ${preservation.preservedPourCount} pours, and ${preservation.topComponentCount} components on top. Native automatic routing uses top/bottom signals referenced to L2/L5; L3/L4 remain power layers. No launch-clearance exceptions are enabled.</p><p>Source SHA-256: <code>${summary.sourceSha256}</code></p><p>Prepare: <code>bun run setup:controls</code>. Native search trials: <code>bun run route:controls</code>. Trials write separate artifacts and never update the live preview or saved circuit routes.</p><h2>Open checks</h2><ul>${openItems.map(s => `<li>${esc(s)}</li>`).join('')}</ul><h2>Routing jobs</h2><p>Width and spacing are in millimeters. Spacing is edge to edge to foreign copper. Launch diagnostics never exclude a net from automatic routing. A clear launch is not a completed route.</p><table><thead><tr><th>Net</th><th>Required terminals</th><th>Width</th><th>Spacing</th><th>Advisory top launch screen</th></tr></thead><tbody>${rows}</tbody></table><h2>Sources and targets</h2><ul>${Object.entries(controlProfiles).map(([name,p]) => `<li><strong>${name}</strong>: ${esc(p.source)}${p.lengthSource ? '; ' + esc(p.lengthSource) : ''}.</li>`).join('')}</ul><p>Required final checks: ${summary.acceptance.map(esc).join('; ')}. Existing power-load and high-speed SI qualifications remain separate.</p></html>`);
console.log(`Configured ${summary.netCount} control nets / ${summary.branchCount} branches; preserved ${preservation.preservedTraceCount} traces, ${preservation.preservedViaCount} vias and ${preservation.preservedPourCount} pours.`);
console.log('Setup report: ' + out + 'report.html');
