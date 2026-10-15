import assert from "node:assert/strict";
import {test} from "node:test";
import {Children} from "react";
import {Circuit} from "tscircuit";
import {Footprint, X1618WVS_164_9TV30} from "../imports/X1618WVS_164_9TV30";

const chip = X1618WVS_164_9TV30({name: "J1"});
const elements = Children.toArray(Footprint().props.children);
const pads = elements.filter(element => element.type === "smtpad").map(element => element.props);
const contacts = pads.filter(pad => pad.portHints?.length);
const number = value => parseFloat(value);
const near = (actual, expected) => assert.ok(Math.abs(number(actual) - expected) < 0.001,
  `${actual} != ${expected}`);

test("C21263101 maps every physical A/B contact to a distinct SMT land", () => {
  assert.equal(chip.props.manufacturerPartNumber, "X1618WVS-164-9TV30");
  assert.deepEqual(chip.props.supplierPartNumbers, {jlcpcb: ["C21263101"]});
  assert.equal(contacts.length, 164);
  assert.equal(new Set(contacts.map(pad => pad.portHints[0])).size, 164);
  // Manufacturer drawing, component-side view: A above B, A1/B1 at the left.
  for (const side of ["A", "B"]) {
    for (let n = 1; n <= 82; n++) {
      const contact = `${side}${n}`;
      const matches = contacts.filter(pad => pad.portHints.includes(contact));
      assert.equal(matches.length, 1, contact);
      const pad = matches[0];
      assert.ok(chip.props.pinLabels[pad.portHints[0]].includes(contact), contact);
      near(pad.pcbX, -41.5 + (n <= 11 ? n - 1 : n + 1));
      near(pad.pcbY, side === "A" ? 3.6 : -3.6);
      near(pad.width, 0.7);
      near(pad.height, 2);
      assert.equal(pad.layer, "top");
      assert.equal(pad.shape, "rect");
    }
  }
  assert.equal(elements.filter(element => element.type === "platedhole").length, 0);
});

test("locating holes and mechanical hold-down lands match the manufacturer drawing", () => {
  const holes = elements.filter(element => element.type === "hole").map(element => element.props);
  assert.equal(holes.length, 2);
  near(holes[0].pcbX, -29.85);
  near(holes[1].pcbX, 43.3);
  near(number(holes[1].pcbX) - number(holes[0].pcbX), 73.15);
  for (const hole of holes) {
    near(hole.diameter, 1.2);
    near(hole.pcbY, 0);
  }
  const tabs = pads.filter(pad => !pad.portHints?.length);
  assert.equal(tabs.length, 2);
  for (const [index, tab] of tabs.entries()) {
    near(tab.pcbX, index === 0 ? -44.5 : 44.5);
    near(tab.pcbY, 0);
    near(tab.width, 3);
    near(tab.height, 5);
    assert.equal(tab.layer, "top");
  }
});

test("rendered PCB preserves all 164 port-to-land associations", async () => {
  const circuit = new Circuit();
  circuit.schematicDisabled = true;
  circuit.add(<board width="100mm" height="20mm" routingDisabled>
    <X1618WVS_164_9TV30 name="J1" pcbX={0} pcbY={0}/>
  </board>);
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const sourcePorts = json.filter(element => element.type === "source_port");
  const pcbPorts = json.filter(element => element.type === "pcb_port");
  const lands = json.filter(element => element.type === "pcb_smtpad");
  assert.equal(sourcePorts.length, 164);
  assert.equal(lands.length, 166);
  for (const source of sourcePorts) {
    const port = pcbPorts.find(port => port.source_port_id === source.source_port_id);
    assert.ok(port, source.name);
    const matching = lands.filter(land => land.pcb_port_id === port.pcb_port_id);
    assert.equal(matching.length, 1, source.name);
  }
  assert.equal(lands.filter(land => !land.pcb_port_id).length, 2);
});
