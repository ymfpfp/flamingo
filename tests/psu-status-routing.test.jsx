import assert from "node:assert/strict";
import {test} from "node:test";
import {boardFixture} from "./board-fixture.mjs";

const json = boardFixture();

test("omitting the optional PSU indicator leaves no retired LED parts, routes or ground vias", () => {
  const removed = new Set(["U_PSU_LED", "LED_PSU_OK", "R_PSU_OK_PD", "R_PSU_LED", "C_PSU_LED"]);
  assert.deepEqual(json.filter(e => e.type === "source_component" && removed.has(e.name)), []);
  assert.deepEqual(json.filter(e => e.type === "source_trace" && e.name?.startsWith("PSU_STATUS_")), []);
  assert.deepEqual(json.filter(e => e.type === "pcb_via" && e.name?.startsWith("PSU_STATUS_GND_")), []);
  for (const [x,y] of [[43.8,26.45], [45.95,26.4078], [40.3,21.9]]) {
    assert.ok(!json.some(e => e.type === "pcb_via" && Math.hypot(e.x-x,e.y-y)<1e-5), `retired indicator ground via ${x},${y}`);
  }
  for (const name of ["U_BUCK_EN", "VCCL_BUCK", "VDD_BUCK", "R_RST", "C_RST", "SW_RESET", "R_PSU_ON"]) {
    assert.ok(json.some(e => e.type === "source_component" && e.name === name), name);
  }
});
