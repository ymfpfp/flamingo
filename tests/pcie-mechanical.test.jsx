import assert from "node:assert/strict";
import {test} from "node:test";
import {checkPcieConnectorKeepout, getPcieConnectorKeepout, updatePcieConnectorKeepout} from "../lib/pcie-mechanical";

const fixture = () => [
  {type: "pcb_board", pcb_board_id: "board", center: {x: 0, y: 0}, width: 400, height: 400,
    thickness: 1.6, num_layers: 6},
  {type: "source_component", source_component_id: "slot", name: "PCIe", ftype: "simple_chip",
    manufacturer_part_number: "X1618WVS-164-9TV30"},
  {type: "pcb_component", pcb_component_id: "slot", source_component_id: "slot",
    center: {x: 0, y: 0}, width: 92, height: 9.2, rotation: 0, layer: "top"},
];
function part(json, x, y, layer = "top") {
  json.push({type: "source_component", source_component_id: "test", name: "U_TEST", ftype: "simple_chip",
    manufacturer_part_number: "TEST"},
  {type: "pcb_component", pcb_component_id: "test", source_component_id: "test", center: {x, y},
    width: 1, height: 1, rotation: 0, layer});
}

test("connector keepout covers the XKB assembly envelope", () => {
  assert.deepEqual(getPcieConnectorKeepout(fixture()).polygon,
    [{x: -46, y: -5.1}, {x: 46, y: -5.1}, {x: 46, y: 4.6}, {x: -46, y: 4.6}]);
});

test("connector keepout rotates with the slot and clips to the board", () => {
  const json = fixture();
  Object.assign(json[0], {center: {x: 27.5, y: 60}, width: 55, height: 120});
  Object.assign(json[2], {center: {x: 8.344986, y: 69.2408656}, rotation: 270});
  const {polygon} = getPcieConnectorKeepout(json);
  assert.ok(Math.abs(Math.min(...polygon.map(p => p.x)) - 3.244986) < 1e-7);
  assert.ok(Math.abs(Math.min(...polygon.map(p => p.y)) - 23.2408656) < 1e-7);
  assert.ok(Math.abs(Math.max(...polygon.map(p => p.x)) - 12.944986) < 1e-7);
  assert.ok(Math.abs(Math.max(...polygon.map(p => p.y)) - 115.2408656) < 1e-7);
  // Move the connector until its envelope crosses the top board edge.
  json[2].center.y += 10;
  const clipped = getPcieConnectorKeepout(json).polygon;
  assert.equal(Math.max(...clipped.map(p => p.y)), 120);
  for (const point of clipped) {
    assert.ok(point.x >= -1e-8 && point.x <= 55 + 1e-8 && point.y >= -1e-8 && point.y <= 120 + 1e-8);
  }
});

test("only components inside the connector keepout cause errors", () => {
  const inside = fixture();
  part(inside, 0, 0);
  assert.equal(checkPcieConnectorKeepout(inside)[0].rule, "pcie_component_keepout");
  for (const [x, y] of [[-80, -20], [0, -20], [-49, 0]]) {
    const json = fixture();
    part(json, x, y);
    assert.deepEqual(checkPcieConnectorKeepout(json), []);
  }
  const bottom = fixture();
  part(bottom, 0, 0, "bottom");
  assert.deepEqual(checkPcieConnectorKeepout(bottom), []);
});

test("annotations are idempotent and never block copper or change connector bounds", () => {
  const json = fixture();
  const connector = structuredClone(json[2]);
  updatePcieConnectorKeepout(json);
  const first = structuredClone(json);
  updatePcieConnectorKeepout(json);
  assert.deepEqual(json, first);
  assert.deepEqual(json[2], connector);
  assert.equal(json.some(e => e.type === "pcb_keepout"), false);
  assert.equal(json.filter(e => e.type === "pcb_note_path").length, 1);
});

test("via proxies beneath the connector do not represent assembled bodies", () => {
  const json = fixture();
  json.push({type: "pcb_component", pcb_component_id: "via-proxy",
    source_component_id: "source_manually_placed_via_test", center: {x: 0, y: 0},
    width: 0.4, height: 0.4, rotation: 0, layer: "top"});
  assert.deepEqual(checkPcieConnectorKeepout(json), []);
  part(json, 0, 0);
  assert.equal(checkPcieConnectorKeepout(json)[0].rule, "pcie_component_keepout");
});
