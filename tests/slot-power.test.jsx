import assert from "node:assert/strict";
import {test} from "node:test";
import {Circuit} from "tscircuit";
import Board from "../index.circuit";

const circuit = new Circuit();
circuit.pcbDisabled = true;
circuit.schematicDisabled = true;
circuit.add(Board());
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const components = json.filter(element => element.type === "source_component");
const ports = json.filter(element => element.type === "source_port");
const component = name => {
  const found = components.find(element => element.name === name);
  assert.ok(found, name);
  return found;
};
function port(name, alias) {
  const matches = ports.filter(element => element.source_component_id === component(name).source_component_id
    && element.port_hints.includes(alias));
  assert.equal(matches.length, 1, `${name}.${alias}`);
  return matches[0].source_port_id;
}
const parents = new Map();
function root(id) {
  if (!parents.has(id)) parents.set(id, id);
  if (parents.get(id) !== id) parents.set(id, root(parents.get(id)));
  return parents.get(id);
}
function join(ids) {
  for (const id of ids.slice(1)) parents.set(root(id), root(ids[0]));
}
for (const trace of json.filter(element => element.type === "source_trace")) {
  join([...trace.connected_source_port_ids, ...trace.connected_source_net_ids]);
}
for (const c of components) {
  for (const group of c.internally_connected_source_port_ids ?? []) join(group);
  // Zero-ohm signal links conduct DC; timing capacitors and FET channels do not.
  if (c.ftype === "simple_resistor" && c.resistance === 0) {
    join(ports.filter(p => p.source_component_id === c.source_component_id).map(p => p.source_port_id));
  }
}
const net = (name, alias) => root(port(name, alias));
const ground = net("ATX", "pin3");
const rails = [
  {suffix: "3V3", atx: "pin1", contacts: ["A9", "A10", "B8"], drains: [5], mpn: "DMP2008UFG-7"},
  {suffix: "12V", atx: "pin10", contacts: ["A2", "A3", "B1", "B2", "B3"], drains: [5, 6, 7, 8], mpn: "AO4407A"},
];

test("both slot supplies pass through correctly oriented P-channel FETs with no direct bypass", () => {
  const allPowerNets = new Set([ground]);
  for (const {suffix, atx, contacts, drains, mpn} of rails) {
    const name = `Q_SLOT_${suffix}`;
    assert.equal(component(name).manufacturer_part_number, mpn);
    const input = net("ATX", atx);
    const output = net("PCIe", contacts[0]);
    assert.notEqual(input, output, `${suffix}: supply must not bypass the power MOSFET`);
    for (const n of [1, 2, 3]) assert.equal(net(name, `pin${n}`), input, `${name} source ${n}`);
    for (const n of drains) assert.equal(net(name, `pin${n}`), output, `${name} drain ${n}`);
    for (const contact of contacts) assert.equal(net("PCIe", contact), output, contact);
    allPowerNets.add(input);
    allPowerNets.add(output);
  }
  assert.equal(allPowerNets.size, 5, "input rails, output rails and ground are separate");
});

test("HDDPC controls both grounded-source drivers without touching either power rail", () => {
  assert.equal(component("R_SLOT_ENABLE").resistance, 0);
  const enable = net("ASM2464PDX", "C21");
  for (const {suffix, atx, contacts} of rails) {
    const driver = `Q_SLOT_DRV_${suffix}`;
    assert.equal(component(driver).manufacturer_part_number, "2N7002K-7");
    assert.equal(net(driver, "G"), enable);
    assert.equal(net(driver, "S"), ground);
    assert.notEqual(enable, net("ATX", atx));
    assert.notEqual(enable, net("PCIe", contacts[0]));
  }
  assert.notEqual(enable, ground);
  assert.equal(component("R_SLOT_ENABLE_PD").resistance, 1000);
  assert.equal(net("R_SLOT_ENABLE_PD", "pin1"), enable);
  assert.equal(net("R_SLOT_ENABLE_PD", "pin2"), ground);
});

test("each gate has a source-referenced RC network and its own driver series resistor", () => {
  const gates = new Set();
  for (const {suffix, atx, contacts} of rails) {
    const gate = net(`Q_SLOT_${suffix}`, "G");
    const input = net("ATX", atx);
    const output = net("PCIe", contacts[0]);
    const series = `R_SLOT_GATE_${suffix}`;
    const pullup = `R_SLOT_OFF_${suffix}`;
    const capacitor = `C_SLOT_GATE_${suffix}`;
    gates.add(gate);
    assert.equal(component(series).resistance, 510);
    assert.equal(net(series, "pin1"), net(`Q_SLOT_DRV_${suffix}`, "D"));
    assert.equal(net(series, "pin2"), gate);
    assert.notEqual(net(series, "pin1"), gate, "series resistor is not bypassed");
    assert.equal(component(pullup).resistance, 100000);
    assert.equal(net(pullup, "pin1"), input);
    assert.equal(net(pullup, "pin2"), gate);
    assert.ok(Math.abs(component(capacitor).capacitance - 10e-6) < 1e-12);
    assert.equal(net(capacitor, "pin1"), input, "timing capacitor references source, not GND or output");
    assert.equal(net(capacitor, "pin2"), gate);
    assert.ok(![input, output, ground].includes(gate));
    const bleeder = `R_SLOT_DISCHARGE_${suffix}`;
    assert.equal(component(bleeder).manufacturer_part_number, "1206W4F1001T5E");
    assert.equal(component(bleeder).resistance, 1000);
    assert.equal(net(bleeder, "pin1"), output);
    assert.equal(net(bleeder, "pin2"), ground);
  }
  assert.equal(gates.size, 2, "the 12 V and 3.3 V power gates must not be tied together");
});

test("bridge power, slot AUX and ground remain independent of the switched main outputs", () => {
  const outputs = rails.map(({contacts}) => net("PCIe", contacts[0]));
  assert.equal(net("ASM2464PDX", "D6"), net("ATX", "pin1"), "VCCH stays on upstream 3.3 V");
  assert.equal(net("PCIe", "A4"), ground);
  assert.ok(!outputs.includes(net("ASM2464PDX", "D6")));
  assert.ok(!outputs.includes(net("PCIe", "B10")), "3.3 V AUX is not a switched main rail");
  assert.notEqual(net("PCIe", "B10"), ground);
});
