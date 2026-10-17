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
const traces = json.filter(element => element.type === "source_trace");

function port(componentName, alias) {
  const component = components.find(element => element.name === componentName);
  assert.ok(component, componentName);
  const matches = ports.filter(element => element.source_component_id === component.source_component_id
    && element.port_hints.includes(alias));
  assert.equal(matches.length, 1, `${componentName}.${alias}`);
  return matches[0];
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
for (const trace of traces) join([...trace.connected_source_port_ids, ...trace.connected_source_net_ids]);
for (const component of components) {
  for (const group of component.internally_connected_source_port_ids ?? []) join(group);
}
const net = port => root(port.source_port_id);

// Independent physical-contact mapping from ASMedia ASM2464PDX_TI_R03 sheet 3
// and the revision 0.3 BGA pinout. This catches lane and polarity swaps.
const contacts = [
  ["TX1_P", "A2", "T1", 220e-9, "GRM033R61E224KE01D", "C701263"],
  ["TX1_N", "A3", "T2", 220e-9, "GRM033R61E224KE01D", "C701263"],
  ["TX2_P", "B2", "V2", 220e-9, "GRM033R61E224KE01D", "C701263"],
  ["TX2_N", "B3", "V1", 220e-9, "GRM033R61E224KE01D", "C701263"],
  ["RX1_P", "B11", "P1", 330e-9, "GRM033R61E334KE15D", "C723889"],
  ["RX1_N", "B10", "P2", 330e-9, "GRM033R61E334KE15D", "C723889"],
  ["RX2_P", "A11", "Y2", 330e-9, "GRM033R61E334KE15D", "C723889"],
  ["RX2_N", "A10", "Y1", 330e-9, "GRM033R61E334KE15D", "C723889"],
];

test("each USB4 conductor reaches the correct bridge ball through one coupling capacitor", () => {
  assert.equal(components.filter(component => component.name.startsWith("C_USB_")).length, 8);
  const signalNets = new Set();
  for (const [name, connectorContact, bridgeBall, capacitance, mpn, supplier] of contacts) {
    const cap = components.find(component => component.name === `C_USB_${name}`);
    assert.equal(cap.ftype, "simple_capacitor");
    assert.equal(cap.manufacturer_part_number, mpn);
    assert.deepEqual(cap.supplier_part_numbers.jlcpcb, [supplier]);
    assert.ok(Math.abs(cap.capacitance - capacitance) < 1e-15);
    const connectorSide = net(port(cap.name, "pin1"));
    const bridgeSide = net(port(cap.name, "pin2"));
    assert.equal(connectorSide, net(port("USBC", connectorContact)), name);
    assert.equal(bridgeSide, net(port("ASM2464PDX", bridgeBall)), name);
    assert.notEqual(connectorSide, bridgeSide, `${name}: capacitor must not be bypassed`);
    signalNets.add(connectorSide);
    signalNets.add(bridgeSide);
  }
  assert.equal(signalNets.size, 16, "all eight conductors remain distinct on both capacitor sides");
});

test("eight separate single-channel clamps protect the PHY side without shorting any signal to ground", () => {
  const clamps = components.filter(component => component.name.startsWith("D_USB_"));
  assert.equal(clamps.length, 8);
  const ground = net(port("USBC", "A1"));
  for (const [name] of contacts) {
    const clamp = clamps.find(component => component.name === `D_USB_${name}`);
    assert.equal(clamp.manufacturer_part_number, "ESD150B1W0201E6327XTSA1");
    assert.deepEqual(clamp.supplier_part_numbers.jlcpcb, ["C3709987"]);
    assert.equal(ports.filter(port => port.source_component_id === clamp.source_component_id).length, 2);
    assert.equal(net(port(clamp.name, "pin1")), net(port(`C_USB_${name}`, "pin2")));
    assert.equal(net(port(clamp.name, "pin2")), ground);
    assert.notEqual(net(port(clamp.name, "pin1")), ground);
  }
});

test("each connector-side conductor has a 220k discharge resistor and remains isolated from VBUS", () => {
  const ground = net(port("USBC", "A1"));
  const vbus = net(port("USBC", "A4"));
  assert.equal(components.filter(component => component.name.startsWith("R_USB_")).length, 8);
  for (const [name, connectorContact] of contacts) {
    const resistor = components.find(component => component.name === `R_USB_${name}`);
    assert.equal(resistor.resistance, 220000);
    assert.deepEqual(resistor.supplier_part_numbers.jlcpcb, ["C473458"]);
    assert.equal(net(port(resistor.name, "pin1")), net(port("USBC", connectorContact)));
    assert.equal(net(port(resistor.name, "pin2")), ground);
    assert.notEqual(net(port(resistor.name, "pin1")), ground);
    assert.notEqual(net(port(resistor.name, "pin1")), vbus);
  }
});

test("VBUS reaches G1 only through the reference divider and filter", () => {
  const cable = net(port("USBC", "A4"));
  const sense = net(port("ASM2464PDX", "G1"));
  const ground = net(port("USBC", "A1"));
  const component = name => components.find(element => element.name === name);
  assert.equal(component("R_VBUS_TOP").resistance, 4700);
  assert.equal(component("R_VBUS_BOTTOM").resistance, 10000);
  assert.ok(Math.abs(component("C_VBUS_SENSE").capacitance - 1e-6) < 1e-15);
  assert.notEqual(cable, sense, "raw cable VBUS must not bypass the divider");
  assert.notEqual(sense, ground);
  assert.notEqual(cable, ground);
  for (const contact of ["A4", "A9", "B4", "B9"]) {
    assert.equal(net(port("USBC", contact)), cable);
  }
  assert.equal(net(port("R_VBUS_TOP", "pin1")), cable);
  assert.equal(net(port("R_VBUS_TOP", "pin2")), sense);
  assert.equal(net(port("R_VBUS_BOTTOM", "pin1")), sense);
  assert.equal(net(port("R_VBUS_BOTTOM", "pin2")), ground);
  assert.equal(net(port("C_VBUS_SENSE", "pin1")), sense);
  assert.equal(net(port("C_VBUS_SENSE", "pin2")), ground);
  for (const [name, pin] of [["ATX", "pin1"], ["ATX", "pin4"], ["ATX", "pin9"], ["ATX", "pin10"]]) {
    assert.notEqual(cable, net(port(name, pin)), `USB VBUS must remain separate from ${name}.${pin}`);
    assert.notEqual(sense, net(port(name, pin)), `USB sense must remain separate from ${name}.${pin}`);
  }
});
