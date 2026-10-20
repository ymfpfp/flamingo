import {readFileSync, writeFileSync, renameSync, mkdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {readPreviewInput} from "./preview-source.mjs";
import {auditPcieTxRouting} from "../lib/pcie-tx-routing-audit";
import {auditPcieRxRouting} from "../lib/pcie-rx-routing-audit";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {auditUsb4Routing} from "../lib/usb4-routing-audit";
import {auditUsb2Routing} from "../lib/usb2-routing-audit";
import {auditBridgeClockRouting} from "../lib/bridge-clock-routing-audit";
import {checkSchematicPlacement,runAllNetlistChecks,runAllPlacementChecks,checkTracesAreContiguous} from "@tscircuit/checks";

const root = process.cwd(), input = readPreviewInput(root);
const file = "dist/pcie-tx-routing/preview-build.json";
mkdirSync("dist/pcie-tx-routing", {recursive: true});
const run = (command, args) => {
  const result = spawnSync(command, args, {stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
};
run(process.execPath, ["scripts/render-preview.mjs", file]);
const fresh = JSON.parse(readFileSync(file, "utf8"));
if (input.inputKey !== readPreviewInput(root).inputKey) throw new Error("Source changed during preview render; rebuild before updating.");
for (const audit of [auditPcieTxRouting(fresh.circuitJson), auditPcieRxRouting(fresh.circuitJson),
  auditUsb4Routing(fresh.circuitJson),auditUsb2Routing(fresh.circuitJson),auditBridgeClockRouting(fresh.circuitJson)]) {
  if (!audit.passed) throw new Error(audit.failures.join("\n"));
}
const drc = await runJlcpcbDrc(fresh.circuitJson);
if (!drc.passed) throw new Error(JSON.stringify(drc.findings.filter(f => f.severity === "error")));
for(const findings of [await runAllNetlistChecks(fresh.circuitJson),await runAllPlacementChecks(fresh.circuitJson),checkSchematicPlacement(fresh.circuitJson),
  checkTracesAreContiguous(fresh.circuitJson)])if(findings.length)throw new Error(JSON.stringify(findings));
const python = process.env.PCIE_SI_PYTHON ?? "python3";
run(python, ["simulations/pcie-tx/check_asmedia_spacing.py", file, "--self-test"]);
run(python, ["simulations/pcie-tx/check_reference_planes.py", file]);
run(python, ["simulations/usb4/check_layout.py", file]);
run(python, ["simulations/usb4/check_reference_planes.py", file]);
run(python, ["simulations/bridge-clocks/check_layout.py", file,"--self-test"]);
if (input.inputKey !== readPreviewInput(root).inputKey) throw new Error("Source changed during validation; rebuild before updating.");
const atomic = (path, json) => {
  writeFileSync(`${path}.refresh.tmp`, JSON.stringify(json));
  renameSync(`${path}.refresh.tmp`, path);
};
atomic("dist/placement-preview-cache.json", {...fresh, sourceHash: input.sourceHash});
const viewer = fresh.circuitJson.map(e => e.type !== "cad_component" ? e : Object.fromEntries(
  Object.entries(e).map(([k, v]) => [k, k.startsWith("model_") && k.endsWith("_url") && typeof v === "string" && v.startsWith(`${root}/`)
    ? `/api/files/static/${v.slice(root.length + 1)}` : v])));
mkdirSync("dist/preview", {recursive: true});
atomic("dist/preview/circuit.json", viewer);
console.log(`Validated preview refreshed: ${viewer.filter(e => e.type === "pcb_trace").length} traces, PCIe/USB pairs and bridge clocks.`);
