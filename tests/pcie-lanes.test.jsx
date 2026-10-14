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

test("only the 48 unused lane contacts are NC; presence contacts remain available", () => {
  const connector = components.find(element => element.name === "PCIe");
  const connectorPorts = ports.filter(element => element.source_component_id === connector.source_component_id);
  assert.equal(connectorPorts.length, 164);
  assert.equal(connectorPorts.filter(element => element.do_not_connect).length, 48);
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
