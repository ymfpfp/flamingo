import assert from "node:assert/strict";
import {test} from "node:test";
import {runAllNetlistChecks, runAllPlacementChecks, checkTracesAreContiguous, checkPcbTraceViaCounts} from "@tscircuit/checks";
import {boardFixture} from "./board-fixture.mjs";
import {auditUsb4Routing, usb4GeometryForDrc} from "./audits/usb4-routing-audit";
import {runJlcpcbDrc, checkJlcpcbDimensions} from "./audits/jlcpcb-drc";
import {getUsb4BgaJoinX} from "../lib/usb4-routing";
import {auditUsb2Routing} from "./audits/usb2-routing-audit";

const json = boardFixture();
const usbSources = json.filter(e => e.type === "source_trace" && e.name?.startsWith("USB4_"));
const pcb = json.filter(e => e.type === "pcb_trace");

test("the initial USB4 phase connects every endpoint of four fixed pairs", async () => {
  assert.equal(usbSources.length, 32);
  assert.equal(pcb.filter(t => usbSources.some(s => s.source_trace_id === t.source_trace_id)).length, 32);
  for (const source of usbSources) {
    const copper = pcb.filter(t => t.source_trace_id === source.source_trace_id);
    assert.equal(copper.length, 1, source.name);
    const ends = [copper[0].route[0], copper[0].route.at(-1)];
    for (const id of source.connected_source_port_ids) {
      const pad = json.find(e => e.type === "pcb_port" && e.source_port_id === id);
      assert.ok(ends.some(p => pad.layers.includes(p.layer) && Math.hypot(p.x-pad.x,p.y-pad.y)<1e-4), source.name);
    }
  }
  assert.deepEqual(await runAllNetlistChecks(json), []);
  assert.deepEqual(await runAllPlacementChecks(json), []);
  assert.deepEqual(checkTracesAreContiguous(json), []);
  assert.deepEqual(checkPcbTraceViaCounts(json), []);
  const report = await runJlcpcbDrc(usb4GeometryForDrc(json));
  assert.ok(report.passed, JSON.stringify(report.findings.filter(f => f.severity === "error")));
});

test("every segment and the local BGA handoff match, including RX2", () => {
  const audit = auditUsb4Routing(json);
  assert.ok(audit.passed, audit.failures.join("\n"));
  assert.ok(audit.channelRulesPassed && audit.segmentRulesPassed && audit.complete);
  assert.equal(audit.segmentMatching.length, 16);
  assert.deepEqual(audit.pendingPairs, []);
  assert.equal(audit.viaGuidancePassed, true);
  assert.ok(audit.pairs.every(p => p.viaRecommendationMet));
  assert.deepEqual(audit.warnings, []);
  for (const pair of audit.pairs) {
    assert.ok(pair.launchPassed && pair.launchSkewMm < 0.025);
    assert.equal(pair.viaCountPerConductor, 2);
  }
  for (const conductor of audit.conductors) {
    const standard = {holeMm:0.2,copperMm:0.4};
    assert.deepEqual(conductor.viaProfile, [
      ["TX2", "RX1"].includes(conductor.name.slice(0,3)) ? standard : {holeMm:0.15,copperMm:0.25},standard]);
  }
  const parts = json.filter(e => e.type === "source_component" && /^[CDR]_USB_/.test(e.name));
  assert.equal(parts.length, 24);
  for (const source of parts) assert.equal(json.find(e => e.type === "pcb_component"
    && e.source_component_id === source.source_component_id).layer, "top");
  assert.equal(json.filter(e => e.type === "pcb_copper_pour" && ["inner1","inner4"].includes(e.layer)).length, 2);
  for (const layer of ["top","bottom"]) assert.ok(json.some(e=>e.type==="pcb_copper_pour"&&e.layer===layer));
  assert.equal(json.find(e => e.type === "pcb_board").is_via_in_pad_allowed, true);
});

test("USB2 reaches both USB-C contact rows with matched copper and no more than four vias",()=>{
  const audit=auditUsb2Routing(json);
  assert.ok(audit.passed,audit.failures.join("\n"));
  assert.ok(audit.nearRowSkewMm<.5&&audit.farRowSkewMm<.5);
  assert.ok(audit.conductors.every(c=>c.viaCount===4&&c.farRowLengthMm<101.6));
  const source=json.find(e=>e.type==="source_trace"&&e.name==="USB2_P_RECEPTACLE");
  assert.ok(!auditUsb2Routing(json.filter(e=>!(e.type==="pcb_trace"&&e.source_trace_id===source.source_trace_id))).passed);
  const changed=structuredClone(json);
  const trunkSource=changed.find(e=>e.type==="source_trace"&&e.name==="USB2_N_TRUNK");
  changed.find(e=>e.type==="pcb_trace"&&e.source_trace_id===trunkSource.source_trace_id).route[1].x+=2;
  assert.ok(auditUsb2Routing(changed).failures.some(f=>f.includes("P/N skew")));
});

test("3 mil necks are matched and confined to the four direct top BGA launches", () => {
  const audit = auditUsb4Routing(json);
  for (const pair of ["RX1", "TX2"]) {
    const conductors = audit.conductors.filter(c => c.name.startsWith(pair));
    assert.ok(conductors.every(c => c.neckLengthMm > 0 && c.neckLengthMm < 1));
    assert.ok(Math.abs(conductors[0].neckLengthMm-conductors[1].neckLengthMm)<1e-6);
  }
  assert.ok(audit.conductors.filter(c => /^(TX1|RX2)/.test(c.name)).every(c => c.neckLengthMm === 0));
  for (const mutation of ["width", "bounds", "layer", "name"]) {
    const changed = structuredClone(json);
    const source = changed.find(e => e.type === "source_trace" && e.name === "USB4_RX1_P_PHY_A");
    const trace = changed.find(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
    assert.equal(trace.route[0].width, 0.0762);
    if (mutation === "width") trace.route[0].width = 0.07;
    if (mutation === "bounds") trace.route[0].x = 33;
    if (mutation === "layer") trace.route[0].layer = "bottom";
    if (mutation === "name") source.name = "UNRELATED_TRACE";
    assert.ok(checkJlcpcbDimensions(changed).some(f => f.rule === "trace_width"), mutation);
    assert.ok(!auditUsb4Routing(changed).passed, mutation);
  }
});

test("other USB4 traces retain the normal minimum width", () => {
  const changed = structuredClone(json);
  const source = usbSources.find(s => s.name === "USB4_TX1_N_PHY_A");
  const trace = changed.find(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
  trace.route[0].width = 0.0762;
  assert.ok(checkJlcpcbDimensions(changed).some(f => f.rule === "trace_width"));
  assert.ok(!auditUsb4Routing(changed).passed);
});

test("missing USB4 copper and added segment skew are rejected", () => {
  const source = usbSources.find(s => s.name === "USB4_TX1_P_CON_A");
  const target = pcb.find(t => t.source_trace_id === source.source_trace_id);
  const missing = auditUsb4Routing(json.filter(e => e !== target));
  assert.ok(!missing.passed && !missing.complete);
  assert.ok(missing.failures.some(f => f.includes(source.name) && f.includes("found 0")));
  assert.equal(missing.pairs.find(p => p.name === "TX1").passed, false);
  const moved = structuredClone(json);
  moved.find(e => e.type === "pcb_trace" && e.pcb_trace_id === target.pcb_trace_id).route[1].y += 1;
  const skew = auditUsb4Routing(moved);
  assert.ok(!skew.passed);
  assert.equal(skew.segmentMatching.find(s => s.pair === "TX1" && s.segment === "CON_A").passed, false);
});

test("unequal BGA via dimensions and a missing local handoff are rejected", () => {
  const source = usbSources.find(s => s.name === "USB4_TX1_P_PHY_A");
  const changed = structuredClone(json);
  const trace = changed.find(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
  changed.find(e => e.type === "pcb_via" && e.pcb_trace_id === trace.pcb_trace_id).outer_diameter += 0.05;
  assert.ok(auditUsb4Routing(changed).failures.some(f => f.includes("unequal P/N via dimensions")));
  for (const point of trace.route) if (point.route_type === "wire" && Math.abs(point.x-getUsb4BgaJoinX("TX1"))<1e-6) point.x += 0.01;
  assert.ok(auditUsb4Routing(changed).failures.some(f => f.includes("missing matched BGA launch handoff")));
});

test("more than two vias on any complete USB4 conductor is a hard failure", () => {
  const changed = structuredClone(json);
  const source = usbSources.find(s => s.name === "USB4_TX1_P_PHY_A");
  const trace = changed.find(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
  trace.route.push(structuredClone(trace.route.find(p => p.route_type === "via")));
  const audit = auditUsb4Routing(changed);
  assert.equal(audit.passed, false);
  assert.equal(audit.viaGuidancePassed, false);
  assert.equal(audit.pairs.find(p => p.name === "TX1").passed, false);
  assert.ok(audit.failures.some(f => f.includes("TX1_P: 3 signal vias exceed the maximum of 2")));
});
