import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {convertCircuitJsonToPcbSvg} from "circuit-to-svg";
import {Resvg} from "@resvg/resvg-js";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {auditUsb4Routing, usb4GeometryForDrc} from "../lib/usb4-routing-audit";
import {auditUsb2Routing} from "../lib/usb2-routing-audit";

export async function reviewUsb4Routing(raw) {
  const json = raw.circuitJson ?? raw;
  const dir = "dist/usb4-routing";
  mkdirSync(dir, {recursive: true});
  writeFileSync(`${dir}/board.circuit.json`, JSON.stringify(json, null, 2));
  const report = await runJlcpcbDrc(json);
  writeFileSync(`${dir}/drc.json`, JSON.stringify(report, null, 2));
  const usb4Report = await runJlcpcbDrc(usb4GeometryForDrc(json));
  writeFileSync(`${dir}/usb4-drc.json`, JSON.stringify(usb4Report, null, 2));
  const counts = {};
  for (const f of report.findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  console.log("DRC:", counts);
  console.log("USB4 geometry:", usb4Report.passed ? "pass" : "fail");
  const audit = auditUsb4Routing(json);
  const usb2Audit = auditUsb2Routing(json);
  writeFileSync(`${dir}/usb2-audit.json`, JSON.stringify(usb2Audit, null, 2));
  console.log("USB2:",usb2Audit.passed?"passed":usb2Audit.failures);
  writeFileSync(`${dir}/audit.json`, JSON.stringify(audit, null, 2));
  console.table(audit.pairs);
  for (const failure of audit.failures) console.log("USB4:", failure);
  for (const warning of audit.warnings) console.log("USB4 guidance:", warning);
  for (const f of report.findings.filter(f => f.severity === "error").slice(0, 35)) console.log(f.rule, f.message);
  const usbSources = new Set(json.filter(e => e.type === "source_trace" && e.name?.startsWith("USB4_"))
    .map(e => e.source_trace_id));
  const cropped = json.filter(e => e.type.startsWith("source_") ||
    ["pcb_smtpad", "pcb_plated_hole", "pcb_via"].includes(e.type) && e.x > 32 && e.x < 48 && e.y > 92 && e.y < 107 ||
    e.type === "pcb_trace" && usbSources.has(e.source_trace_id));
  cropped.push({...json.find(e => e.type === "pcb_board"), center: {x: 40, y: 99.5}, width: 16, height: 15});
  for (const layer of ["top", "bottom"]) {
    const svg = convertCircuitJsonToPcbSvg(cropped, {width: 1400, height: 1300, layer,
      showSolderMask: false, shouldDrawRatsNest: false, shouldDrawErrors: false,
      showCourtyards: false, showFabricationNotes: false});
    writeFileSync(`${dir}/${layer}.svg`, svg);
    writeFileSync(`${dir}/${layer}.png`, new Resvg(svg).render().asPng());
  }
  console.log("Traces:", json.filter(e => e.type === "pcb_trace").length,
    "Vias:", json.filter(e => e.type === "pcb_via").length,
    "Pours:", json.filter(e => e.type === "pcb_copper_pour").length);
  console.log("Pending:", audit.pendingPairs.map(p => p.name).join(", "));
  return {report, usb4Report, audit, usb2Audit};
}

if (import.meta.main) {
  const raw = JSON.parse(readFileSync(process.argv[2] ?? "dist/usb4-routing/board.circuit.json", "utf8"));
  const {report, audit, usb2Audit} = await reviewUsb4Routing(raw);
  process.exitCode = report.passed && audit.passed && usb2Audit.passed ? 0 : 1;
}
