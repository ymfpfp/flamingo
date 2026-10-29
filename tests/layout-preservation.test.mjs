import assert from "node:assert/strict";
import {test} from "node:test";
import {boardFixture} from "./board-fixture.mjs";
import {auditLayoutPreservation, traceConnections} from "./audits/layout-audit.mjs";

const board = boardFixture();
test("the current board preserves every baseline route or its exact authorized successor", () => {
  const result = auditLayoutPreservation(board);
  assert.ok(result.passed, result.failures.join("\n"));
});

test("the second authorized PCIe revision still rejects any further route drift", () => {
  const changed = structuredClone(board), names = traceConnections(changed);
  const trace = changed.find(e => e.type === "pcb_trace"
    && names.get(e.source_trace_id) === "ASM2464PDX.PTXP1|net.ASM_PTXP1");
  trace.route[0].x += .01;
  assert.ok(auditLayoutPreservation(changed).failures
    .includes("Existing route geometry changed: ASM2464PDX.PTXP1|net.ASM_PTXP1"));
});
