import assert from "node:assert/strict";
import {test} from "node:test";
import {auditAtx5vRouting} from "../lib/atx5v-routing-audit.mjs";
const raw=await Bun.file(process.env.ATX5V_AUDIT_FIXTURE??"dist/preview/circuit.json").json(),json=raw.circuitJson??raw;
test("ATX 5 V feed preserves every prior route and the top-only assembly",()=>{
  const a=auditAtx5vRouting(json);assert.ok(a.passed,a.failures.join("\n"));
  assert.equal(a.preservedTraceCount,326);assert.equal(a.assembledComponentsOnTop,153);assert.equal(a.newContacts,4);
});
test("ATX 5 V audit rejects a missing power contact or moved assembly",()=>{
  const source=json.find(e=>e.type==="source_trace"&&e.name==="ATX5V_VDD_A_TRACE");assert.ok(source);
  assert.ok(!auditAtx5vRouting(json.filter(e=>!(e.type==="pcb_trace"&&e.source_trace_id===source.source_trace_id))).passed);
  const changed=structuredClone(json),part=changed.find(e=>e.type==="source_component"&&e.name==="C_VCCL_CIN");
  changed.find(e=>e.type==="pcb_component"&&e.source_component_id===part.source_component_id).layer="bottom";
  assert.ok(!auditAtx5vRouting(changed).passed);
});
