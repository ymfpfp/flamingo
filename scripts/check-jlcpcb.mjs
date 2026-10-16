import {mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {Circuit} from "tscircuit";
import Board from "../index.circuit";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";

const args = process.argv.slice(2);
if (args.some(arg => arg.startsWith("--") && arg !== "--require-routed")) {
  throw new Error("Usage: bun scripts/check-jlcpcb.mjs [circuit.json] [--require-routed]");
}
const file = args.find(arg => !arg.startsWith("--"));
let json;
if (file) json = JSON.parse(await readFile(resolve(file), "utf8"));
else {
  const circuit = new Circuit();
  circuit.schematicDisabled = true;
  circuit.add(Board());
  await circuit.renderUntilSettled();
  json = circuit.getCircuitJson();
}
const report = await runJlcpcbDrc(json, {requireRouted: args.includes("--require-routed")});
const reportPath = resolve("dist/jlcpcb-drc.json");
await mkdir(resolve("dist"), {recursive: true});
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
const groups = new Map();
for (const finding of report.findings) {
  const key = `${finding.severity}: ${finding.rule}`;
  groups.set(key, [...(groups.get(key) ?? []), finding]);
}
for (const [key, findings] of groups) {
  console.log(`${key} (${findings.length})`);
  for (const finding of findings.slice(0, 3)) console.log(`  ${finding.message}`);
  if (findings.length > 3) console.log(`  ${findings.length - 3} more. See the JSON report.`);
}
console.log(`Geometry checks: ${report.passed ? "PASS" : "FAIL"}. Routed traces: ${report.traceCount}.`);
console.log(`Fabrication readiness: ${report.fabricationReady ? "local checks complete; vendor review still required" : "NOT ESTABLISHED"}.`);
console.log(`Report: ${reportPath}`);
process.exitCode = report.passed ? 0 : 1;
