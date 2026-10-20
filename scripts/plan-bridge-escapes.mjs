import {readFileSync, mkdirSync, writeFileSync} from "node:fs";
import {argv} from "node:process";
import reference from "../tests/fixtures/asm2464pdx-pin-map.json" with {type: "json"};
import process from "../manufacturing/bridge-bga/process.json" with {type: "json"};
import rules from "../jlcpcb-clearance-rules.json" with {type: "json"};
import stackup from "../manufacturing/stackup/JLC06161H-3313.json" with {type: "json"};

// Inventory and planning measurements only. This does not generate copper routes.
const input = JSON.parse(readFileSync(argv[2] ?? "dist/bga-planning-cache.json", "utf8"));
const json = input.circuitJson ?? input;
const source = json.find(e => e.type === "source_component" && e.name === "ASM2464PDX");
const component = json.find(e => e.type === "pcb_component" && e.source_component_id === source?.source_component_id);
if (!component) throw new Error("ASM2464PDX PCB component not found");
const sources = new Map(json.filter(e => e.type === "source_port").map(e => [e.source_port_id, e]));
const ports = new Map(json.filter(e => e.type === "pcb_port").map(e => [e.pcb_port_id, e]));
const categorize = (signal, unused) => unused ? "unused"
  : /^(GND|GNDA)$/.test(signal) ? "ground"
  : /^(VDD|VCCL|VCCH|VCCA33)$/.test(signal) ? "power"
  : /^(UTX|URX)/.test(signal) ? "usb4"
  : /^(PTX|PRX|REFCLK)/.test(signal) ? "pcie"
  : "control";
const pads = json.filter(e => e.type === "pcb_smtpad" && e.pcb_component_id === component.pcb_component_id).map(pad => {
  const ball = pad.port_hints?.find(h => /^[A-Z]+\d+$/.test(h));
  if (!ball || !(ball in reference.balls)) throw new Error(`Unknown ball ${ball}`);
  const signal = reference.balls[ball];
  const port = ports.get(pad.pcb_port_id ?? "");
  const sourcePort = sources.get(port?.source_port_id ?? "");
  if (!sourcePort?.port_hints?.includes(ball)) throw new Error(`Port mismatch for ${ball}`);
  const x = pad.x - component.center.x, y = pad.y - component.center.y;
  const interior = Math.abs(x) <= 3.250001 && Math.abs(y) <= 3.250001;
  const category = categorize(signal, sourcePort.do_not_connect === true);
  if (interior && !["power", "ground"].includes(category)) throw new Error(`Unexpected interior signal ${ball}`);
  return {ball, signal, selector: `ASM2464PDX.${ball}`, active: sourcePort.do_not_connect !== true,
    category, region: interior ? "coarse interior" : "fine perimeter",
    x: +x.toFixed(5), y: +y.toFixed(5), boardX: +pad.x.toFixed(5), boardY: +pad.y.toFixed(5),
    width: pad.shape === "circle" ? pad.radius * 2 : "width" in pad ? pad.width : 0,
    height: pad.shape === "circle" ? pad.radius * 2 : "height" in pad ? pad.height : 0};
});
if (pads.length !== 273) throw new Error(`Expected 273 pads, found ${pads.length}`);
const countBy = key => Object.fromEntries([...new Set(pads.map(p => p[key]))].map(k => [k, pads.filter(p => p[key] === k).length]));
const corridor = width => ({traceWidthMm: width,
  padClearanceMm: +( (process.footprint.outerPitchMm - process.footprint.oblongWidthMm - width) / 2).toFixed(6),
  maskClearanceMm: +( (process.footprint.outerPitchMm - process.footprint.oblongWidthMm - width) / 2 - process.footprint.oblongSolderMaskMarginMm).toFixed(6)});
const report = {
  status: "escape planning; stackup selected; no escape copper",
  stackup,
  component: {center: component.center, rotation: component.rotation, layers: 6},
  counts: {total: pads.length, active: pads.filter(p => p.active).length, byRegion: countBy("region"), byCategory: countBy("category"), bySignal: countBy("signal")},
  corridor: {global: corridor(rules.minimumMm.traceWidth), candidate: corridor(process.escape.outerEscapeTraceWidthMm), requiredPadClearanceMm: rules.minimumMm.padToTrace,
    candidateLocallyEnabled: false, note: "Centered straight passage between adjacent perimeter oblongs; not a complete escape proof."},
  candidateVia: {drillMm: process.escape.viaDrillMm, copperMm: process.escape.viaCopperDiameterMm,
    dogboneDxMm: process.escape.innerDogboneOffsetMm, dogboneDyMm: process.escape.innerDogboneOffsetMm,
    status: "candidate only; all neighboring pads, vias, drill clearances and plane antipads must be checked"},
  selectedLayers: stackup.copperLayers.map(({tscircuitLayer, role}) => ({layer: tscircuitLayer, role})),
  openDecisions: ["Exact laminate loss and complete channel loss budget", "Apply the calculator geometry and review nearby copper, pad launches and BGA necks", "Explicit local BGA trace-width exception", "Vendor acceptance of footprint, via and assembly process", "Per-ball dogbone sites and plane connections", "Paired high-speed exit coordinates and nearby ground stitching"],
  sources: ["imports/ASM2464PDX.tsx", "tests/fixtures/asm2464pdx-pin-map.json", "manufacturing/bridge-bga/process.json", "datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf", "https://jlcpcb.com/capabilities/pcb-capabilities"],
  pads,
};
mkdirSync("dist/bga-escape-plan", {recursive: true});
writeFileSync("dist/bga-escape-plan/plan.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({counts: report.counts, corridor: report.corridor}, null, 2));
