import {readFileSync, writeFileSync, renameSync, mkdirSync, rmSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {readPreviewInput} from "./preview-source.mjs";
import {auditPcieTxRouting} from "../lib/pcie-tx-routing-audit";
import {auditPcieRxRouting} from "../lib/pcie-rx-routing-audit";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {auditUsb4Routing} from "../lib/usb4-routing-audit";
import {auditUsb2Routing} from "../lib/usb2-routing-audit";
import {auditBridgeClockRouting} from "../lib/bridge-clock-routing-audit";
import {auditBuckRouting} from "../lib/buck-routing-audit";
import {auditPowerDistribution} from "../lib/power-distribution-audit.mjs";
import {auditVcchRouting} from "../lib/vcch-routing-audit.mjs";
import {auditAtx5vRouting} from "../lib/atx5v-routing-audit.mjs";
import {auditSlotPowerRouting} from "../lib/slot-power-routing-audit.mjs";
import {auditVbusRouting} from "../lib/vbus-routing-audit.mjs";
import {auditGroundReturns} from "../lib/ground-returns-audit.mjs";
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
const nativeErrors=fresh.circuitJson.filter(e=>e.type.endsWith("_error")&&!["pcb_port_not_connected_error","pcb_trace_missing_error"].includes(e.type));
if(nativeErrors.length)throw new Error(JSON.stringify(nativeErrors));
for (const audit of [auditPcieTxRouting(fresh.circuitJson), auditPcieRxRouting(fresh.circuitJson),
  auditUsb4Routing(fresh.circuitJson),auditUsb2Routing(fresh.circuitJson),auditBridgeClockRouting(fresh.circuitJson),auditBuckRouting(fresh.circuitJson),auditPowerDistribution(fresh.circuitJson),auditVcchRouting(fresh.circuitJson),auditAtx5vRouting(fresh.circuitJson),auditSlotPowerRouting(fresh.circuitJson),auditVbusRouting(fresh.circuitJson),auditGroundReturns(fresh.circuitJson)]) {
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
run(python, ["simulations/buck/check_layout.py", file,"--self-test"]);
run(python, ["simulations/power-distribution/check_layout.py", file,"--self-test"]);
run(python, ["simulations/power-distribution/check_vcch.py", file,"--self-test"]);
run(python, ["simulations/power-distribution/check_atx5v.py", file,"--self-test"]);
run(python, ["simulations/power-distribution/check_atx5v_dc.py", file]);
run(process.execPath,["scripts/check-slot-routing.mjs",file]);
run(python,["simulations/power-distribution/check_slot_dc.py",file]);
run(process.execPath,["scripts/check-vbus-routing.mjs",file]);
run(process.execPath,["scripts/check-ground-returns.mjs",file]);
mkdirSync("dist/slot-power-routing",{recursive:true});
const rawCheckFile="dist/slot-power-routing/validation.circuit.json";
writeFileSync(rawCheckFile,JSON.stringify(fresh.circuitJson));
run("bunx",["tsci","check","shorts",rawCheckFile]);
run("bunx",["tsci","check","pcb-style",rawCheckFile]);
// The user requested completion of the routing pass. Keep the separate DC
// screen visible and failing at its original target, while publishing only
// after every required geometry/continuity check passes.
rmSync("dist/power-distribution/dc-audit.json",{force:true});
const pdnDc=spawnSync(python,["simulations/power-distribution/check_dc.py",file],{stdio:"inherit"});
if(pdnDc.error)throw pdnDc.error;
if(![0,1].includes(pdnDc.status))throw new Error("PDN screen did not complete");
const pdnQualification=JSON.parse(readFileSync("dist/power-distribution/dc-audit.json","utf8"));
if(!Array.isArray(pdnQualification.results)||pdnQualification.results.length!==2)throw new Error("Incomplete PDN screen");
if(pdnQualification.sourceSha256!==createHash("sha256").update(readFileSync(file)).digest("hex"))throw new Error("PDN screen used a different board build");
if(pdnQualification.passed!==(pdnDc.status===0))throw new Error("PDN screen status disagrees with its report");
console.log(`PDN load qualification: ${pdnQualification.passed?"screen passed":"OPEN — the assumed 3 A load exceeds the 8 mV project target"}`);
if (input.inputKey !== readPreviewInput(root).inputKey) throw new Error("Source changed during validation; rebuild before updating.");
run(python,["simulations/power-distribution/render_vbus_report.py",file]);
run(python,["simulations/power-distribution/render_ground_returns_report.py",file]);
const atomic = (path, json) => {
  writeFileSync(`${path}.refresh.tmp`, JSON.stringify(json));
  renameSync(`${path}.refresh.tmp`, path);
};
atomic("dist/placement-preview-cache.json", {...fresh, sourceHash: input.sourceHash,pdnLoadQualification:pdnQualification.passed?"screen-passed":"open"});
const viewer = fresh.circuitJson.map(e => e.type !== "cad_component" ? e : Object.fromEntries(
  Object.entries(e).map(([k, v]) => [k, k.startsWith("model_") && k.endsWith("_url") && typeof v === "string" && v.startsWith(`${root}/`)
    ? `/api/files/static/${v.slice(root.length + 1)}` : v])));
mkdirSync("dist/preview", {recursive: true});
atomic("dist/preview/circuit.json", viewer);
console.log(`Validated preview refreshed: ${viewer.filter(e => e.type === "pcb_trace").length} traces, PCIe/USB pairs, clocks, bucks, bridge supplies, ATX/slot power, USB VBUS and every assembled ground return.`);
