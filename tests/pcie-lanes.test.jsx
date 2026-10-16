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

// Compare electrical nets without treating capacitors as DC connections.
const parents = new Map();
function root(id) {
  if (!parents.has(id)) parents.set(id, id);
  if (parents.get(id) !== id) parents.set(id, root(parents.get(id)));
  return parents.get(id);
}
function join(ids) {
  for (const id of ids.slice(1)) parents.set(root(id), root(ids[0]));
}
for (const trace of traces) {
  join([...trace.connected_source_port_ids, ...trace.connected_source_net_ids]);
}
for (const component of components) {
  for (const group of component.internally_connected_source_port_ids ?? []) join(group);
}
const net = port => root(port.source_port_id);

test("PCIe clock pair 0 reaches A13/A14 through separate removable zero-ohm links", () => {
  const clockNets = new Set();
  for (const [polarity, ball, contact] of [["P", "AA8", "A13"], ["N", "Y8", "A14"]]) {
    const name = `R_PCIE_REFCLK_${polarity}`;
    const resistor = components.find(element => element.name === name);
    assert.ok(resistor, name);
    assert.equal(resistor.ftype, "simple_resistor");
    assert.equal(resistor.resistance, 0);
    assert.equal(resistor.manufacturer_part_number, "0402WGF0000TCE");
    const bridge = port("ASM2464PDX", ball);
    const slot = port("PCIe", contact);
    const input = net(port(name, "pin1"));
    const output = net(port(name, "pin2"));
    assert.notEqual(bridge.do_not_connect, true);
    assert.notEqual(slot.do_not_connect, true);
    assert.equal(input, net(bridge), `${name} bridge ball`);
    assert.equal(output, net(slot), `${name} slot contact`);
    assert.notEqual(input, output, `${name} must not be bypassed`);
    clockNets.add(input);
    clockNets.add(output);
  }
  assert.equal(clockNets.size, 4, "Clock P and N must remain separate");
});

test("CLKREQ connects bridge A19 to slot B12 through a link with a bridge-supply pull-up", () => {
  const link = components.find(element => element.name === "R_PCIE_CLKREQ");
  const pullup = components.find(element => element.name === "R_PCIE_CLKREQ_PU");
  assert.ok(link);
  assert.ok(pullup);
  assert.equal(link.resistance, 0);
  assert.equal(pullup.resistance, 10000);
  const bridge = port("ASM2464PDX", "A19");
  const slot = port("PCIe", "B12");
  assert.notEqual(bridge.do_not_connect, true);
  assert.notEqual(slot.do_not_connect, true);
  assert.equal(net(port(link.name, "pin1")), net(bridge));
  assert.equal(net(port(link.name, "pin2")), net(slot));
  assert.notEqual(net(bridge), net(slot), "The removable link must not be bypassed");
  assert.equal(net(port(pullup.name, "pin2")), net(slot));
  assert.equal(net(port(pullup.name, "pin1")), net(port("ASM2464PDX", "D6")), "VCCH supply ball");
  assert.notEqual(net(port(pullup.name, "pin1")), net(port("PCIe", "A9")), "Use unswitched bridge power");
  assert.notEqual(net(port(pullup.name, "pin1")), net(port("ASM2464PDX", "D14")), "Do not use the core rail");
});

test("card presence senses all card lengths through GPIO2 with an unswitched 4.7k pull-up", () => {
  assert.equal(components.filter(element => element.name === "PCIe").length, 1);
  const pullup = components.find(element => element.name === "R_PCIE_PRESENT_PU");
  const link = components.find(element => element.name === "R_PCIE_PRESENT");
  assert.ok(pullup);
  assert.ok(link);
  assert.equal(pullup.resistance, 4700);
  assert.equal(link.resistance, 0);
  const sense = net(port(link.name, "pin2"));
  for (const contact of ["B17", "B31", "B48", "B81"]) {
    assert.equal(net(port("PCIe", contact)), sense, contact);
    assert.notEqual(port("PCIe", contact).do_not_connect, true, contact);
  }
  assert.equal(net(port(link.name, "pin1")), net(port("ASM2464PDX", "B1")));
  assert.notEqual(net(port(link.name, "pin1")), sense, "The removable link must not be bypassed");
  assert.equal(net(port(pullup.name, "pin2")), sense);
  const supply = net(port(pullup.name, "pin1"));
  assert.equal(supply, net(port("ASM2464PDX", "D6")), "Pull up to VCCH");
  assert.notEqual(supply, net(port("PCIe", "A9")), "Do not use switched slot power");
  const ground = net(port("ASM2464PDX", "D4"));
  assert.equal(net(port("PCIe", "A1")), ground, "Ground PRSNT1#");
  assert.notEqual(sense, ground, "The empty slot must not assert presence");
  assert.notEqual(sense, supply, "The card must be able to pull the sense net low");
});

test("the six unused reference-clock outputs are NC and have no traces", () => {
  for (const ball of ["AA11", "Y11", "AA10", "Y10", "AA7", "Y7"]) {
    const unused = port("ASM2464PDX", ball);
    assert.equal(unused.do_not_connect, true, ball);
    assert.ok(!traces.some(trace => trace.connected_source_port_ids.includes(unused.source_port_id)), ball);
  }
});

// Physical contacts from PCIe CEM Table 37 and ASMedia's revision 0.3 pinout.
// Each row contains slot TX, slot RX, bridge TX balls, and bridge RX balls (P, N).
const laneContacts = [
  [["B14", "B15"], ["A16", "A17"], ["R20", "R21"], ["N21", "N20"]],
  [["B19", "B20"], ["A21", "A22"], ["U20", "U21"], ["W21", "W20"]],
  [["B23", "B24"], ["A25", "A26"], ["Y17", "AA17"], ["Y19", "AA19"]],
  [["B27", "B28"], ["A29", "A30"], ["Y15", "AA15"], ["AA13", "Y13"]],
];

test("PCIe receive contacts connect to the matching bridge balls without lane or polarity swaps", () => {
  for (const [, rx, , bridgeRx] of laneContacts) {
    for (const polarity of [0, 1]) {
      assert.equal(net(port("PCIe", rx[polarity])), net(port("ASM2464PDX", bridgeRx[polarity])));
    }
  }
});

test("every bridge transmit conductor has one series capacitor and remains isolated from other signals", () => {
  const capacitors = components.filter(element => /^C_TX[0-3]_[PN]$/.test(element.name));
  assert.equal(capacitors.length, 8);
  const signalNets = new Set();
  for (const [lane, [tx, rx, bridgeTx]] of laneContacts.entries()) {
    for (const [polarity, suffix] of ["P", "N"].entries()) {
      const name = `C_TX${lane}_${suffix}`;
      const capacitor = capacitors.find(element => element.name === name);
      assert.equal(capacitor.ftype, "simple_capacitor");
      assert.ok(Math.abs(capacitor.capacitance - 220e-9) < 1e-15);
      const input = net(port(name, "pin1"));
      const output = net(port(name, "pin2"));
      assert.equal(input, net(port("ASM2464PDX", bridgeTx[polarity])), `${name} bridge contact`);
      assert.equal(output, net(port("PCIe", tx[polarity])), `${name} slot contact`);
      assert.notEqual(input, output, `${name} is bypassed`);
      signalNets.add(input);
      signalNets.add(output);
      signalNets.add(net(port("PCIe", rx[polarity])));
    }
  }
  assert.equal(signalNets.size, 24, "Lane conductors must remain separate");
});

test("the 48 unused lane contacts and B10 are NC; presence contacts remain available", () => {
  const connector = components.find(element => element.name === "PCIe");
  const connectorPorts = ports.filter(element => element.source_component_id === connector.source_component_id);
  assert.equal(connectorPorts.length, 164);
  assert.equal(connectorPorts.filter(element => element.do_not_connect).length, 49);
  assert.equal(port("PCIe", "B10").do_not_connect, true);
  for (let lane = 4; lane < 16; lane++) {
    for (const direction of ["TX", "RX"]) {
      for (const polarity of ["P", "N"]) {
        const unused = port("PCIe", `${direction}${lane}_${polarity}`);
        assert.equal(unused.do_not_connect, true);
        assert.ok(!traces.some(trace => trace.connected_source_port_ids.includes(unused.source_port_id)));
      }
    }
  }
  for (const contact of ["A1", "B17", "B31", "B48", "B81"]) {
    assert.notEqual(port("PCIe", contact).do_not_connect, true, contact);
  }
});
