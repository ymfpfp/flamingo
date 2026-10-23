// Check the emitted board after the RX3 neck edit. This does not modify copper.
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runAllNetlistChecks, checkTracesAreContiguous} from '@tscircuit/checks';
import {runJlcpcbDrc} from '../../tests/audits/jlcpcb-drc';
import {auditPcieRxRouting} from '../../tests/audits/pcie-rx-routing-audit';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) throw Error('Usage: bun verify_rx3_change.mjs board.circuit.json output.json');
const bytes = readFileSync(input), json = JSON.parse(bytes);
const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
const rx = auditPcieRxRouting(json);
const netlist = await runAllNetlistChecks(json);
const continuity = checkTracesAreContiguous(json);
const drc = await runJlcpcbDrc(json, {requireRouted: true});
const report = {sourceSha256, passed: rx.passed && !netlist.length && !continuity.length && drc.passed,
  rx, netlist, continuity, drc};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({sourceSha256, passed: report.passed, rxPassed: rx.passed,
  netlistFindings: netlist.length, continuityFindings: continuity.length,
  drcErrors: drc.findings.filter(f => f.severity === 'error').length,
  drcWarnings: drc.findings.filter(f => f.severity === 'warning').length}));
process.exitCode = report.passed ? 0 : 1;
