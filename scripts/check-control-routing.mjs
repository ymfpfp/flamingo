// Validate native candidates against the saved physical board. This command
// cannot apply copper or declare an unbuilt source layout finalized.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {controlNets, controlProfiles, controlRoutingPolicy} from '../lib/control-routing-config.mjs';

const out = 'dist/control-routing/';
const read = name => JSON.parse(readFileSync(out + name));
const hash = value => createHash('sha256').update(value).digest('hex');
const setup = read('setup.json'), native = read('native-trials.json');
const source = readFileSync(out + 'input.json');
const policy = hash(JSON.stringify({controlNets, controlProfiles, controlRoutingPolicy}));
if (hash(source) !== setup.sourceSha256 || native.sourceSha256 !== setup.sourceSha256)
  throw Error('Candidate board snapshot does not match the configured source');
if (policy !== setup.policySha256 || native.policySha256 !== policy)
  throw Error('Candidate routing rules are stale; rerun setup and routing');
const python = process.env.PCIE_SI_PYTHON ?? setup.validationPython ?? 'python3';
const check = spawnSync(python, ['simulations/control-routing/check_acceptance.py',
  out + 'input.json', out + 'jobs.json', out + 'native-trials.json', out + 'physical-audit.json'], {stdio: 'inherit'});
if (check.error || check.status !== 0) throw check.error ?? Error('Physical candidate check failed to execute');
const physical = read('physical-audit.json');
const fullSearch = native.selectedNet === null && native.attemptedNets === setup.netCount;
const report = {
  status: fullSearch && physical.passed ? 'candidate physical screen passed; source integration pending' : 'routing incomplete or rejected; not finalized',
  finalized: false, appliedToBoard: false, sourceSha256: setup.sourceSha256,
  fullSearch, preservation: native.preservation, physical,
  remainingIntegrationChecks: physical.remainingIntegrationChecks,
};
writeFileSync(out + 'validation.json', JSON.stringify(report, null, 2) + '\n');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const fmt = value => typeof value === 'number' ? value.toFixed(4) : '—';
const rows = physical.nets.map(n => `<tr><td>${esc(n.net)}</td><td>${n.nativeSolved ? 'Found' : 'Unresolved'}</td><td>${n.passed ? 'PASS' : 'FAIL'}</td><td>${fmt(n.minimumForeignCopperGapMm)} / ${fmt(n.requiredGapMm)}</td><td>${n.viaCount ?? '—'}</td><td>${esc([...new Set(n.failures.map(f => f.rule + ': ' + f.detail))].join('; '))}</td></tr>`).join('');
writeFileSync(out + 'report.html', `<!doctype html><html lang="en"><meta charset="utf-8"><title>Control routing validation</title><style>body{font:16px system-ui;max-width:1500px;margin:32px auto;padding:0 24px;color:#162332}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:8px;border:1px solid #cbd3dd;text-align:left;vertical-align:top}th{background:#eaf0f5}.status{background:#fff0cf;border-left:5px solid #bd7900;padding:16px}p{max-width:1100px}code{font-size:12px;overflow-wrap:anywhere}</style>
<h1>Control and support routing validation</h1><p class="status"><strong>${esc(report.status)}.</strong> ${physical.nativeSolvedNets}/${physical.configuredNets} nets have native candidate paths; ${physical.physicalScreenPassedNets}/${physical.configuredNets} pass the independent physical screen. <strong>No control candidates have been applied to the board.</strong></p>
<p>The native solver finds paths. A separate checker measures the actual copper and drills. A found path is rejected if it violates spacing, shorts to foreign copper, misses a terminal, exceeds the configured length, or loses its ground reference.</p>
<p>Saved board preservation: ${native.preservation?.passed ? 'PASS' : 'FAIL'}; ${native.preservation?.preservedTraceCount} original traces, ${native.preservation?.preservedViaCount} existing vias, ${native.preservation?.preservedPourCount} pours, ${native.preservation?.topComponentCount} assembled components on top. Current-source integration must be rechecked after the concurrent refactor.</p>
<p>Gap values are measured / required, in mm. Reference checks exclude bounded openings for a signal’s own vias and through-hole launches. New antipads are screened conservatively; native refill and preservation of all existing connections remain required.</p>
<table><thead><tr><th>Net</th><th>Native path</th><th>Physical screen</th><th>Minimum gap / target</th><th>Vias</th><th>Failures</th></tr></thead><tbody>${rows}</tbody></table>
<p>Source SHA-256: <code>${setup.sourceSha256}</code>. Detailed measurements: <a href="physical-audit.json">physical-audit.json</a>. Recheck with <code>PCIE_SI_PYTHON=${esc(python)} bun scripts/check-control-routing.mjs</code>.</p>
<p>${esc(physical.scope)}</p><p>Full board completion also requires a fresh source build, native pour refill, prior-route continuity and clearances, shorts, PCB style, placement, and the separate impedance/topology review.</p></html>`);
console.log(report.status);
process.exitCode = fullSearch && physical.passed ? 0 : 1;
