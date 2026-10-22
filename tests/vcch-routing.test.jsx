import assert from "node:assert/strict";
import {test} from "node:test";
import {auditLayoutPreservation} from "./audits/layout-audit.mjs";
import {auditVcchRouting} from "./audits/vcch-routing-audit.mjs";
const raw=await Bun.file(process.env.VCCH_AUDIT_FIXTURE??process.env.BOARD_TEST_FIXTURE??"dist/board.circuit.json").json(),json=raw.circuitJson??raw;
test("3.3 V distribution preserves placement and previously routed signal and supply geometry",()=>{
  const audit=auditVcchRouting(json);assert.ok(audit.passed,audit.failures.join("\n"));assert.equal(audit.assembledComponentsOnTop,153);
});
test("3.3 V audit rejects loss of analog power copper and drift of an existing lane",()=>{
  const net=json.find(e=>e.type==="source_net"&&e.name==="VCCA33");
  assert.ok(!auditVcchRouting(json.filter(e=>!(e.type==="pcb_copper_pour"&&e.source_net_id===net.source_net_id))).passed);
  const other=structuredClone(json);other.find(e=>e.type==="pcb_trace"&&e.pcb_trace_id==="saved_phase_null_1_12").route[0].x+=.1;
  assert.ok(auditLayoutPreservation(other).failures.some(f=>f.includes("Existing route")));
});
