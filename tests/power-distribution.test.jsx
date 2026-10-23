import assert from "node:assert/strict";
import {test} from "node:test";
import {boardFixture} from "./board-fixture.mjs";
import {auditLayoutPreservation} from "./audits/layout-audit.mjs";
import {auditPowerDistribution} from "./audits/power-distribution-audit";
const json = boardFixture(process.env.PDN_AUDIT_FIXTURE ?? process.env.BOARD_TEST_FIXTURE ?? "dist/board.circuit.json");
test("power distribution preserves the top placement and existing signal and buck routes",()=>{
 const a=auditPowerDistribution(json);assert.ok(a.passed,a.failures.join("\n"));assert.equal(a.assembledComponentsOnTop,154);
});
test("a named ground-via tap must retain its native source-port attribution",()=>{
 const other=structuredClone(json),trace=other.find(e=>e.type==="source_trace"&&e.name==="PDN_BGA_Y5_TRACE");
 const viaPort=trace.connected_source_port_ids.find(id=>other.some(e=>e.type==="source_port"&&e.source_port_id===id&&e.source_component_id?.startsWith("source_manually_placed_via_")));
 assert.ok(viaPort,"the ground retap must reference an actual native via port");
 trace.connected_source_port_ids=trace.connected_source_port_ids.filter(id=>id!==viaPort);
 assert.throws(()=>auditPowerDistribution(other),/Missing ground tap endpoint/);
});
test("the power audit rejects loss of a power region and a misattributed ground contact",()=>{
 const other=structuredClone(json),n=other.find(e=>e.type==="source_net"&&e.name==="VDD");
 assert.ok(!auditPowerDistribution(other.filter(e=>!(e.type==="pcb_copper_pour"&&e.source_net_id===n.source_net_id&&e.layer==="inner3"))).passed);
 const t=other.find(e=>e.type==="pcb_trace"&&e.pcb_trace_id.includes("_8_"));t.source_trace_id="source_trace_10";
 assert.ok(auditPowerDistribution(other).failures.some(f=>f.includes("correctly attributed")));
});
test("the power audit rejects drift of pre-existing lane geometry and bottom assembly",()=>{
 const other=structuredClone(json);other.find(e=>e.type==="pcb_trace"&&e.pcb_trace_id==="saved_phase_null_1_12").route[0].x+=.1;
 assert.ok(auditLayoutPreservation(other).failures.some(f=>f.includes("Existing route")));
 const assembly=structuredClone(json),p=assembly.find(e=>e.type==="source_component"&&e.name==="ASM2464PDX");
 assembly.find(e=>e.type==="pcb_component"&&e.source_component_id===p.source_component_id).layer="bottom";
 assert.ok(auditPowerDistribution(assembly).failures.some(f=>f.includes("All assembled components must remain on top")));
});
