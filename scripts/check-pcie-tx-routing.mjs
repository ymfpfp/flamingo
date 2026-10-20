import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {RootCircuit} from "tscircuit";
import {checkSchematicPlacement, checkTracesAreContiguous, runAllNetlistChecks, runAllPlacementChecks} from "@tscircuit/checks";
import {convertCircuitJsonToPcbSvg} from "circuit-to-svg";
import {Resvg} from "@resvg/resvg-js";
import Board from "../index.circuit";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {auditPcieTxRouting} from "../lib/pcie-tx-routing-audit";

const dir = "dist/pcie-tx-routing";
mkdirSync(dir, {recursive: true});
let json;
if (process.argv[2]) json = JSON.parse(readFileSync(process.argv[2], "utf8"));
else {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
  circuit.add(Board());
  await circuit.renderUntilSettled();
  json = circuit.getCircuitJson();
}
writeFileSync(`${dir}/board.circuit.json`, JSON.stringify(json, null, 2));
const audit = auditPcieTxRouting(json);
const drc = await runJlcpcbDrc(json);
const checks = {
  netlist: await runAllNetlistChecks(json),
  schematicPlacement: checkSchematicPlacement(json),
  pcbPlacement: await runAllPlacementChecks(json),
  contiguousCopper: checkTracesAreContiguous(json),
  runtime: json.filter(e => e.type === "source_runtime_error" || e.type === "pcb_autorouting_error"),
};
writeFileSync(`${dir}/audit.json`, JSON.stringify(audit, null, 2));
writeFileSync(`${dir}/drc.json`, JSON.stringify(drc, null, 2));
writeFileSync(`${dir}/checks.json`, JSON.stringify(checks, null, 2));
console.table(audit.pairs);
console.log("PCIe TX audit:", audit.passed ? "passed" : audit.failures);
console.log("DRC:", drc.passed ? "passed" : drc.findings.filter(f => f.severity === "error"));
console.log("Checks:", Object.fromEntries(Object.entries(checks).map(([name, errors]) => [name, errors.length])));
// A top view of bottom copper keeps bridge/connector locations consistent.
const bounds = {minX: 0, maxX: 34, minY: 82, maxY: 104};
const inside = p => p && p.x > bounds.minX && p.x < bounds.maxX && p.y > bounds.minY && p.y < bounds.maxY;
const cropped = json.filter(e => e.type.startsWith("source_")
  || ["pcb_smtpad", "pcb_via", "pcb_plated_hole"].includes(e.type) && inside(e)
  || e.type === "pcb_trace" && e.route.every(inside));
cropped.push({...json.find(e => e.type === "pcb_board"), center: {x: 17, y: 93}, width: 34, height: 22});
for (const layer of ["top", "bottom"]) {
  const svg = convertCircuitJsonToPcbSvg(cropped, {width: 1550, height: 1100, layer,
    showSolderMask: false, shouldDrawRatsNest: false, shouldDrawErrors: false,
    showCourtyards: false, showFabricationNotes: false});
  writeFileSync(`${dir}/${layer}.svg`, svg);
  writeFileSync(`${dir}/${layer}.png`, new Resvg(svg).render().asPng());
}
process.exitCode = audit.passed && drc.passed && Object.values(checks).every(errors => errors.length === 0) ? 0 : 1;
