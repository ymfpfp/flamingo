import {mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {runAllNetlistChecks, checkSchematicPlacement, checkTracesAreContiguous} from "@tscircuit/checks";
import {loadBoard, saveBoard} from "./build-board.mjs";
import {runJlcpcbDrc} from "../tests/audits/jlcpcb-drc";
import {auditLayoutPreservation} from "../tests/audits/layout-audit.mjs";
import {auditPcieTxRouting} from "../tests/audits/pcie-tx-routing-audit";
import {auditPcieRxRouting} from "../tests/audits/pcie-rx-routing-audit";
import {auditUsb4Routing} from "../tests/audits/usb4-routing-audit";
import {auditUsb2Routing} from "../tests/audits/usb2-routing-audit";
import {auditBridgeClockRouting} from "../tests/audits/bridge-clock-routing-audit";
import {auditBuckRouting} from "../tests/audits/buck-routing-audit";
import {auditPowerDistribution} from "../tests/audits/power-distribution-audit.mjs";
import {auditVcchRouting} from "../tests/audits/vcch-routing-audit.mjs";
import {auditAtx5vRouting} from "../tests/audits/atx5v-routing-audit.mjs";
import {auditSlotPowerRouting} from "../tests/audits/slot-power-routing-audit.mjs";
import {auditVbusRouting} from "../tests/audits/vbus-routing-audit.mjs";
import {auditGroundReturns} from "../tests/audits/ground-returns-audit.mjs";

const scopes = {
  drc: {audits: [], python: []},
  pcie: {audits: [auditPcieTxRouting, auditPcieRxRouting], python: ["pcie-tx/check_asmedia_spacing.py", "pcie-tx/check_reference_planes.py"]},
  usb: {audits: [auditUsb4Routing, auditUsb2Routing], python: ["usb4/check_layout.py", "usb4/check_reference_planes.py"]},
  clocks: {audits: [auditBridgeClockRouting], python: ["bridge-clocks/check_layout.py"]},
  bucks: {audits: [auditBuckRouting], python: ["buck/check_layout.py"]},
  pdn: {audits: [auditPowerDistribution], python: ["power-distribution/check_layout.py"]},
  vcch: {audits: [auditVcchRouting], python: ["power-distribution/check_vcch.py"]},
  atx5v: {audits: [auditAtx5vRouting], python: ["power-distribution/check_atx5v.py", "power-distribution/check_atx5v_dc.py"]},
  slot: {audits: [auditSlotPowerRouting], python: ["power-distribution/check_slot.py", "power-distribution/check_slot_dc.py"]},
  vbus: {audits: [auditVbusRouting], python: ["power-distribution/check_vbus.py"]},
  grounds: {audits: [auditGroundReturns], python: ["power-distribution/check_ground_returns.py"]},
};
const args = process.argv.slice(2);
const scope = args.find(a => a.startsWith("--scope="))?.slice(8);
if (scope && !scopes[scope]) throw Error(`Unknown scope: ${scope}`);
for (const arg of args.filter(a => a.startsWith("--"))) {
  if (!arg.startsWith("--scope=") && !["--require-routed", "--geometry-only"].includes(arg)) throw Error(`Unknown option: ${arg}`);
}
const input = args.find(a => !a.startsWith("--"));
const json = await loadBoard(input);
const file = saveBoard(json);
const sourceSha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
const selected = scope ? [[scope, scopes[scope]]] : Object.entries(scopes);
const reports = {};
reports.layout = auditLayoutPreservation(json);
const netlist = await runAllNetlistChecks(json);
const schematic = checkSchematicPlacement(json);
const continuity = checkTracesAreContiguous(json);
const runtime = json.filter(e => (e.type.startsWith("source_") && e.type.endsWith("_error")) || e.type === "pcb_autorouting_error");
reports.native = {passed: ![...netlist, ...schematic, ...continuity, ...runtime].length, netlist, schematic, continuity, runtime};
reports.drc = await runJlcpcbDrc(json, {requireRouted: args.includes("--require-routed")});
for (const [name, config] of selected) for (const audit of config.audits) reports[`${name}:${audit.name}`] = audit(json);
let passed = Object.values(reports).every(r => r.passed);
for (const [name, report] of Object.entries(reports)) {
  console.log(`${name}: ${report.passed ? "PASS" : "FAIL"}`);
  if (!report.passed) console.error(JSON.stringify(report.failures ?? report.findings ?? report));
}
if (!args.includes("--geometry-only")) {
  const run = (command, argv, diagnosticMarker) => {
    const result = spawnSync(command, argv, {encoding: "utf8"});
    if (result.error) throw result.error;
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    if (![0, 1].includes(result.status)) throw Error(`${command} failed with ${result.signal ?? result.status}`);
    return result.status === 0 && (!diagnosticMarker || !result.stdout.includes(diagnosticMarker));
  };
  const python = process.env.PCIE_SI_PYTHON ?? "python3";
  for (const script of new Set(selected.flatMap(([, config]) => config.python))) {
    const ok = run(python, [`simulations/${script}`, file]);
    reports[script] = {passed: ok}; passed = ok && passed;
  }
  for (const check of ["schematic-placement", "shorts", "pcb-style"]) {
    const ok = run("node_modules/.bin/tsci", ["check", check, file], check === "schematic-placement" ? "<SchematicPlacementIssues>" : undefined);
    reports[check] = {passed: ok}; passed = ok && passed;
  }
  if (!scope || scope === "pdn") {
    rmSync("dist/power-distribution/dc-audit.json", {force: true});
    const qualified = run(python, ["simulations/power-distribution/check_dc.py", file]);
    const report = JSON.parse(readFileSync("dist/power-distribution/dc-audit.json", "utf8"));
    if (report.sourceSha256 !== sourceSha256 || report.passed !== qualified || !Array.isArray(report.results) || report.results.length !== 2) {
      throw Error("PDN load qualification did not produce a report for this build");
    }
    reports.pdnLoad = {qualified, report};
    console.log(`PDN load qualification: ${qualified ? "PASS" : "OPEN — see dist/power-distribution/dc-audit.json"}`);
  }
}
mkdirSync("dist/validation", {recursive: true});
writeFileSync(`dist/validation/${scope ?? "board"}.json`, JSON.stringify({passed, sourceSha256, reports}, null, 2));
process.exitCode = passed ? 0 : 1;
