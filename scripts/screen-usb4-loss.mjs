import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {argv} from "node:process";
import stackup from "../manufacturing/stackup/JLC06161H-3313.json" with {type: "json"};

// A planning sensitivity calculation, not a field solver or channel simulation.
const input = JSON.parse(readFileSync(argv[2] ?? "dist/bga-planning-cache.json", "utf8"));
const json = input.circuitJson ?? input;
const sourceComponents = json.filter(e => e.type === "source_component");
const sourcePorts = json.filter(e => e.type === "source_port");
const pcbPorts = json.filter(e => e.type === "pcb_port");
function port(name, alias) {
  const component = sourceComponents.find(e => e.name === name);
  if (!component) throw new Error(`Missing component ${name}`);
  const matches = sourcePorts.filter(p => p.source_component_id === component.source_component_id && p.port_hints?.includes(alias));
  if (matches.length !== 1) throw new Error(`Ambiguous port ${name}.${alias}`);
  const p = pcbPorts.find(p => p.source_port_id === matches[0].source_port_id);
  if (!p) throw new Error(`Missing PCB port ${name}.${alias}`);
  return {x: p.x, y: p.y};
}
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Physical mapping reviewed in tests/usb4-lanes.test.jsx against ASMedia sheet 3.
const contacts = [
  ["TX1_P", "T1", "A2"], ["TX1_N", "T2", "A3"],
  ["TX2_P", "V2", "B2"], ["TX2_N", "V1", "B3"],
  ["RX1_P", "P1", "B11"], ["RX1_N", "P2", "B10"],
  ["RX2_P", "Y2", "A11"], ["RX2_N", "Y1", "A10"],
];
const lengths = contacts.map(([name, ball, contact]) => {
  const bridge = port("ASM2464PDX", ball), clamp = port(`D_USB_${name}`, "pin1");
  const capBridge = port(`C_USB_${name}`, "pin2"), capConnector = port(`C_USB_${name}`, "pin1");
  const resistor = port(`R_USB_${name}`, "pin1"), connector = port("USBC", contact);
  const copper = distance(bridge, clamp) + distance(clamp, capBridge) + distance(capConnector, resistor) + distance(resistor, connector);
  return {name, ball, contact, copperLowerBoundMm: copper, capPadCenterSpanMm: distance(capBridge, capConnector)};
});
const frequencyHz = 10e9, c = 299792458, mu0 = 4 * Math.PI * 1e-7, rhoCopper = 1.724e-8;
const er = stackup.dielectrics[0].designDk;
const traceWidthMm = stackup.impedanceProfiles[0].calculatedTraceWidthMm;
const zOdd = stackup.impedanceProfiles[0].targetOhms / 2;
const surfaceResistanceOhms = Math.sqrt(Math.PI * frequencyHz * mu0 * rhoCopper);
const dbPerNp = 20 * Math.LOG10E;
const assumptions = {
  frequencyHz, designEr: er, traceWidthMm, zOddOhms: zOdd, rhoCopperOhmM: rhoCopper,
  lossTangentsAt10GHz: [0.015, 0.02, 0.025, 0.03],
  conductorLossMultipliers: [1, 2],
  lumpedDiscontinuityAllowanceDb: 1,
  lengthScenariosMm: [15, 20, 25, 30],
  note: "All 10 GHz Df values, conductor multipliers and the 1 dB component allowance are assumptions, not vendor specifications or measured bounds.",
};
// Low-loss, homogeneous TEM dielectric approximation. It omits the microstrip
// air fraction. The conductor model assumes equal-width signal/return strips:
// Rloop = 2*Rs/w, alpha_c = Rloop/(2*Zodd). It is not a coupled-line EM model.
const scenarios = assumptions.lengthScenariosMm.flatMap(lengthMm => assumptions.lossTangentsAt10GHz.flatMap(df => assumptions.conductorLossMultipliers.map(multiplier => {
  const dielectricDb = dbPerNp * Math.PI * frequencyHz / c * Math.sqrt(er) * df * lengthMm / 1000;
  const conductorDb = dbPerNp * surfaceResistanceOhms / (traceWidthMm / 1000 * zOdd) * lengthMm / 1000 * multiplier;
  const screeningTotalDb = dielectricDb + conductorDb + assumptions.lumpedDiscontinuityAllowanceDb;
  return {lengthMm, assumedDfAt10GHz: df, conductorLossMultiplier: multiplier, dielectricDb, conductorDb,
    componentAllowanceDb: assumptions.lumpedDiscontinuityAllowanceDb, screeningTotalDb, remainingFrom4Db: 4 - screeningTotalDb};
})));
const report = {
  status: "planning sensitivity only; USB4 channel acceptance not established",
  sourceGeometry: argv[2] ?? "dist/bga-planning-cache.json",
  routedTraceCount: json.filter(e => e.type === "pcb_trace").length,
  routeLengths: {method: "Sum of straight-line distances through signal pads of the clamp, capacitor and discharge resistor; excludes capacitor pad span. This is a geometric lower bound, not a feasible route or routed length.",
    minMm: Math.min(...lengths.map(l => l.copperLowerBoundMm)), maxMm: Math.max(...lengths.map(l => l.copperLowerBoundMm)), conductors: lengths},
  projectLimit: {insertionLossDb: 4, frequencyHz, source: "ASMedia ASM2464PD-PDX PCB Guideline Mid-loss R1.0, page 3. Device-specific design limit, not a claim about the entire USB4 specification."},
  assumptions,
  model: {dielectric: "8.686 * pi * f/c * sqrt(er) * Df * length_m", conductor: "8.686 * Rs / (width_m * Zodd) * length_m * multiplier", copperSurfaceResistanceOhms: surfaceResistanceOhms},
  scenarios,
  limitations: ["No assigned production laminate or 10 GHz Df guarantee", "No conductor roughness specification", "No S-parameters for the assembled connector, capacitor launches, ESD and vias", "No routed geometry, return-loss/crosstalk analysis or compliance measurement", "BGA neck-down loss is not separately modeled", "The 1 dB component allowance is not a measured value or a proven upper bound"],
  recommendation: "Retain the selected stackup as a prototype candidate. Try to keep USB4 copper paths within 20 mm. Reassess longer routes. Obtain exact laminate/prepreg and foil data, then analyze or measure the routed channel before claiming acceptance.",
};
mkdirSync("dist/laminate-review", {recursive: true});
writeFileSync("dist/laminate-review/usb4-loss-screen.json", JSON.stringify(report, null, 2) + "\n");
console.log("Pad-to-pad copper lower bounds (mm):", report.routeLengths.minMm.toFixed(2), "to", report.routeLengths.maxMm.toFixed(2));
console.log("Assumed Df=0.020, conductor multiplier=1 to 2, plus assumed 1 dB component allowance:");
for (const length of assumptions.lengthScenariosMm) {
  const cases = scenarios.filter(s => s.lengthMm === length && s.assumedDfAt10GHz === 0.02);
  console.log(length, "mm:", cases.map(s => s.screeningTotalDb.toFixed(2)).join(" to "), "dB");
}
console.log("20 mm high-loss sensitivity (assumed Df=0.030, multiplier=2):", scenarios.find(s => s.lengthMm === 20 && s.assumedDfAt10GHz === 0.03 && s.conductorLossMultiplier === 2).screeningTotalDb.toFixed(2), "dB");
