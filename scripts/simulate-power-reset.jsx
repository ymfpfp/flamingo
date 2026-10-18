import {mkdir, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createEngine, runtimeHash} from "../simulations/power-reset/engine.mjs";
import {simulateScenario} from "../simulations/power-reset/run.mjs";
import {scenarios, startupEnvelopeScenarios} from "../simulations/power-reset/scenarios";
import {requirements} from "../simulations/power-reset/analyze.mjs";

const output = new URL("../dist/power-reset/", import.meta.url);
await mkdir(output, {recursive: true});
const engine = await createEngine();
const report = {scope: "Reset RC and approximate VCCH supervisor; buck outputs are prescribed stimuli, not regulator predictions.",
  runtimeSha256: runtimeHash, requirements, results: []};
for (const scenario of [...scenarios, ...startupEnvelopeScenarios]) {
  const run = await simulateScenario(engine, scenario);
  report.results.push(run.analysis);
  await writeFile(new URL(`${scenario.name}.cir`, output), run.netlist);
  await writeFile(new URL(`${scenario.name}.simulation.json`, output), JSON.stringify(run.circuitJson));
  await writeFile(new URL(`${scenario.name}.waveforms.json`, output), JSON.stringify(run.graphs));
  console.log(`${scenario.name}: ${run.analysis.failed.length ? run.analysis.failed.join(", ") : "modeled checks passed"}`);
}
const rows = report.results.flatMap(r => r.checks.map(c => `| ${r.name} | ${c.id} | ${c.status} | ${c.measuredMs?.toFixed(3) ?? ""} |`));
const envelope = report.results.filter(r => r.name.startsWith("startup-"));
report.normalStartupEnvelope = {cases: envelope.length, minimumMarginMs: Math.min(...envelope.map(r => r.startupMarginMs ?? -Infinity)),
  failedCases: envelope.filter(r => r.failed.length).map(r => r.name), assumptions: startupEnvelopeScenarios[0].assumptions};
await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2) + "\n");
await writeFile(new URL("report.md", output), ["# Power/reset simulation results", "", report.scope, "",
  "A passed stimulus case does not qualify the regulator, bridge, or complete board.", "",
  `Normal-startup sensitivity envelope: ${envelope.length} cases; minimum modeled margin ${report.normalStartupEnvelope.minimumMarginMs.toFixed(3)} ms.`, "",
  ...startupEnvelopeScenarios[0].assumptions.map(a => `- ${a}`), "",
  "`not_observed` means the event did not occur within the simulation window.", "",
  "| Scenario | Check | Result | Measured interval (ms) |", "| --- | --- | --- | ---: |", ...rows, ""].join("\n"));
console.log(`Reports and waveforms: ${fileURLToPath(output)}`);
if (process.argv.includes("--check") && report.results.some(r => r.failed.length)) process.exitCode = 1;
