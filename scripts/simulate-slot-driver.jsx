import {readFile, mkdir, writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {Circuit} from "tscircuit";
import {createElement} from "react";
import {circuitGraph} from "../lib/schematic-audit.mjs";
import {createEngine} from "../simulations/power-reset/engine.mjs";
import {OriginalGateDriver} from "../simulations/slot-power/OriginalGateDriver";
import {valueAt, crossing} from "../simulations/power-reset/analyze.mjs";

const source = JSON.parse(await readFile("dist/index/circuit.json", "utf8"));
if (source.some(e => e.type.endsWith("_error"))) throw new Error("The input circuit contains errors.");
const g = circuitGraph(source);
for (const suffix of ["12V", "3V3"]) {
  if (g.component(`Q_SLOT_DRV_${suffix}`).manufacturer_part_number !== "NX3008NBK,215") throw new Error("Unexpected gate driver.");
}
const rails = [["12V", 12, 10], ["3V3", 3.3, 2.5]].map(([suffix, supplyV, targetGateV]) => ({
  suffix, supplyV, targetGateV, seriesOhm: g.component(`R_SLOT_GATE_${suffix}`).resistance,
  pullupOhm: g.component(`R_SLOT_OFF_${suffix}`).resistance,
  gateCapF: g.component(`C_SLOT_GATE_${suffix}`).capacitance,
}));
const modelPath = "simulations/slot-power/vendor/2N7002K.spice.txt";
const model = await readFile(modelPath, "utf8");
const engine = await createEngine();
const results = [];
// Exploratory Level-1 fit to the datasheet's maximum threshold test point:
// Id=1mA, Vgs=2.5V, Vds=10V. This is not a supplied production corner.
const testI = 0.001, rs = 0.280, rd = 0.280, kp = 0.032, phi = 0.75, gamma = 3.10, lambda = 0.000104;
const fittedVto = 2.5 - testI * rs - gamma * (Math.sqrt(phi + testI * rs) - Math.sqrt(phi))
  - Math.sqrt(2 * testI / (kp * (1 + lambda * (10 - testI * (rs + rd)))));
const variants = [
  {name: "old-2n7002k-manufacturer", source: `MDRIVER D G S S DI_2N7002K L=100u W=100u\n${model}`, vtoV: 2.5},
  {name: "old-threshold-fit-sensitivity", source: `MDRIVER D G S S DI_2N7002K L=100u W=100u\n${model.replace("VTO=2.50", `VTO=${fittedVto}`)}`, vtoV: fittedVto},
  ...[2.8, 5.6].map(ron => ({name: `selected-nx3008nbk-${ron}ohm-10ma`,
    source: `BDRIVER D S I={min(max(V(G,S)/1.8,0),1)*min(max(V(D,S),0)/${ron},0.01)+V(D,S)/1e12}`,
    ronOhm: ron, sinkCeilingA: 0.01,
    boundType: ron === 2.8 ? "25 C on-state RC envelope; 10 mA ceiling avoids extrapolating the Rds test point"
      : "2x-Rds sensitivity with 10 mA ceiling, not a manufacturer hot limit"})),
];
await mkdir("dist/slot-power/driver", {recursive: true});
for (const variant of variants) for (const controlV of [2.4, 2.5, 2.6, 2.7, 2.8, 3.135, 3.3]) {
  let deck;
  const c = new Circuit({platform: {spiceEngineMap: {ngspice: {async simulate(netlist) {
    deck = netlist.replace(/\n/, "\n.temp 25\n"); return engine.simulate(deck);
  }}}}});
  c.pcbDisabled = true; c.schematicDisabled = true;
  c.add(createElement(OriginalGateDriver, {rails, controlV, model: variant.source}));
  await c.renderUntilSettled();
  const json = c.getCircuitJson();
  const errors = json.filter(e => e.type.endsWith("_error"));
  if (errors.length || !deck) throw new Error(JSON.stringify(errors));
  const graph = name => {
    const matches = json.filter(e => e.type === "simulation_transient_voltage_graph" && e.name === name);
    if (matches.length !== 1) throw new Error(`Missing graph ${name}.`);
    const q = matches[0], timeMs = q.timestamps_ms, volts = q.voltage_levels;
    if (!timeMs || timeMs.length !== volts?.length || timeMs.length < 3 || timeMs.at(-1) < 2999
      || !volts.every(Number.isFinite) || !timeMs.every((t, i) => Number.isFinite(t) && (!i || t > timeMs[i - 1]))) {
      throw new Error(`Invalid graph ${name}.`);
    }
    return {timeMs, volts};
  };
  const measurements = rails.map(r => {
    const gate = graph(`P_GATE_${r.suffix}`);
    const magnitude = {timeMs: gate.timeMs, volts: gate.volts.map(v => r.supplyV - v)};
    return {rail: r.suffix, gateMagnitudeAt99msV: valueAt(magnitude, 99),
      timeToRdsGateMs: crossing(magnitude, r.targetGateV), targetGateV: r.targetGateV,
      gateMagnitudeAt3000msV: magnitude.volts.at(-1)};
  });
  results.push({variant: variant.name, controlV, temperatureC: 25, measurements});
  await writeFile(`dist/slot-power/driver/${variant.name}-control-${controlV}.cir`, deck);
  await writeFile(`dist/slot-power/driver/${variant.name}-control-${controlV}.json`, JSON.stringify(json));
  console.log(`${variant.name}, ${controlV} V control: ${measurements.map(m => `${m.rail} gate ${m.gateMagnitudeAt99msV.toFixed(3)} V at 99 ms`).join(", ")}`);
}
const report = {scope: "Selected NX3008NBK gate-network envelope with a conservative 10 mA sink ceiling, plus historical 2N7002K comparisons; not a card-startup simulation.",
  source: "https://www.diodes.com/spice/download/1834/2N7002K.spice.txt", modelPath,
  sha256: createHash("sha256").update(model).digest("hex"),
  modelVtoV: 2.5, modelIsGuaranteedProductionCorner: false,
  thresholdFitSensitivityVtoV: fittedVto, thresholdFitIsGuaranteedProductionCorner: false,
  selectedDriver: "NX3008NBK,215", selectedModelType: "2.8 ohm / 10 mA on-state envelope with an idealized continuous control transition; not a vendor MOSFET model",
  selectedVariants: variants.filter(v => v.name.startsWith("selected-")).map(({source, ...metadata}) => metadata),
  limitations: ["The Level-1 model VTO is not the datasheet threshold measured at 1 mA. No min/max model set is supplied.",
    "No power-MOSFET channel, card load, Miller dynamics, rail SOA or electrothermal behavior is included.",
    "Supply is established before control rises. Supply-ramp coupling is not tested.",
    "The threshold-fit variant changes only VTO and approximately matches the datasheet's 1mA/2.5V/10V threshold point. It is not a production bound.",
    "The selected-driver switch model checks the on-state RC loading only. It does not validate gate charge, subthreshold conduction, temperature limits or off-state behavior at 0.4 V.",
    "The selected envelope assumes monotonic conduction above the 1.8 V / 10 mA / 25 C Rds test point and conservatively caps sink current at 10 mA. The 2x-resistance case is sensitivity only.",
    "The old model illustrates low-control sensitivity and cannot prove production failure or a guaranteed pass."],
  selectedOnStateRcChecksPass: results.filter(r => r.variant.startsWith("selected-")).every(r =>
    r.measurements.every(m => m.timeToRdsGateMs !== null && m.timeToRdsGateMs < 100)),
  rails, results};
await writeFile("dist/slot-power/driver/report.json", JSON.stringify(report, null, 2) + "\n");
if (!report.selectedOnStateRcChecksPass) process.exitCode = 1;
