import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import Board from "../index.circuit";
import {auditPowerDistribution} from "../lib/power-distribution-audit";
let json;
if(process.env.PDN_AUDIT_FIXTURE){const j=await Bun.file(process.env.PDN_AUDIT_FIXTURE).json();json=j.circuitJson??j;}
else{const c=new RootCircuit({platform:{partsEngineDisabled:true}});c.add(Board());await c.renderUntilSettled();json=c.getCircuitJson();}
test("power distribution preserves the top placement and existing signal and buck routes",()=>{
 const a=auditPowerDistribution(json);assert.ok(a.passed,a.failures.join("\n"));assert.equal(a.preservedTraceCount,117);assert.equal(a.assembledComponentsOnTop,153);
});
test("the power audit rejects loss of a power region and a misattributed ground contact",()=>{
 const other=structuredClone(json),n=other.find(e=>e.type==="source_net"&&e.name==="VDD");
 assert.ok(!auditPowerDistribution(other.filter(e=>!(e.type==="pcb_copper_pour"&&e.source_net_id===n.source_net_id&&e.layer==="inner3"))).passed);
 const t=other.find(e=>e.type==="pcb_trace"&&e.pcb_trace_id.includes("_8_"));t.source_trace_id="source_trace_10";
 assert.ok(auditPowerDistribution(other).failures.some(f=>f.includes("correctly attributed")));
});
test("the power audit rejects drift of pre-existing lane geometry and bottom assembly",()=>{
 const other=structuredClone(json);other.find(e=>e.type==="pcb_trace"&&e.pcb_trace_id==="saved_phase_null_1_12").route[0].x+=.1;
 assert.ok(auditPowerDistribution(other).failures.some(f=>f.includes("Existing route")));
 const p=other.find(e=>e.type==="source_component"&&e.name==="ASM2464PDX");other.find(e=>e.type==="pcb_component"&&e.source_component_id===p.source_component_id).layer="bottom";
 assert.ok(auditPowerDistribution(other).failures.some(f=>f.includes("placement changed")));
});
