import {readFile, mkdir, writeFile} from "node:fs/promises";
import {circuitGraph} from "../lib/schematic-audit.mjs";
import {qualifySlotPower} from "../lib/power-qualification.mjs";

const path = process.argv.slice(2).find(arg => !arg.startsWith("--")) ?? "dist/index/circuit.json";
const json = JSON.parse(await readFile(path, "utf8"));
if (json.some(e => e.type.endsWith("_error"))) throw new Error("The input circuit contains errors.");
const graph = circuitGraph(json);
const report = qualifySlotPower(graph);
report.cardCapacitanceSensitivity = [0, 1000].map(extraCardCapacitanceUF => {
  const q = qualifySlotPower(graph, {extraCardCapacitanceUF});
  return {extraCardCapacitanceUF, rails: [q.rail12, q.rail3V3].map(r => ({
    rail: r.suffix, capacitanceUF: r.maximumEffectiveCapacitanceUF,
    capacitorOnlyStartupEnergyJ: r.capacitorOnlyStartupEnergyJ, rampStress: r.rampStress,
  }))};
});
await mkdir("dist/slot-power", {recursive: true});
await writeFile("dist/slot-power/original-switch-review.json", JSON.stringify(report, null, 2) + "\n");
// Retire the previous topology's generated passing report at its public path.
await writeFile("dist/slot-power/report.json", JSON.stringify({scope: "Original-switch analytical screening; no SPICE pass claim.",
  status: report.status, report: "original-switch-review.json", hardwareQualified: false}, null, 2) + "\n");
for (const rail of [report.rail12, report.rail3V3]) {
  console.log(`${rail.suffix}: ${rail.fetLossAt25CMaxRdsW.toFixed(3)} W at 25 C maximum Rds, assuming full gate drive.`);
  console.log(`Gate RC: ${rail.idealDriverGateOnTimeConstantMs.toFixed(2)} ms on, ${rail.gateOffTimeConstantMs.toFixed(0)} ms off.`);
}
console.log(report.driver.guaranteedAtBridgeMinimumHigh
  ? "Driver selection passes the low-voltage drive check. REVIEW REQUIRED: startup/shutdown SOA, temperature, repeated pulses and PSU fault clearing."
  : "REVIEW REQUIRED: 2.4 V driver guarantee, startup/shutdown SOA, repeated resistor pulses and PSU fault clearing.");
if (process.argv.includes("--require-qualified") || [report.rail12, report.rail3V3].some(r => !r.dcVoltageRatingsPass)) process.exitCode = 1;
