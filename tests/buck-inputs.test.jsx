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
const components = json.filter(e => e.type === "source_component");
const ports = json.filter(e => e.type === "source_port");
const parents = new Map();
function root(id) {
  if (!parents.has(id)) parents.set(id, id);
  if (parents.get(id) !== id) parents.set(id, root(parents.get(id)));
  return parents.get(id);
}
for (const t of json.filter(e => e.type === "source_trace")) {
  const ids = [...t.connected_source_port_ids, ...t.connected_source_net_ids];
  for (const id of ids.slice(1)) parents.set(root(id), root(ids[0]));
}
function component(name) {
  const found = components.find(c => c.name === name);
  assert.ok(found, name);
  return found;
}
function net(name, pin) {
  const found = ports.filter(p => p.source_component_id === component(name).source_component_id
    && p.port_hints.includes(pin));
  assert.equal(found.length, 1, `${name}.${pin}`);
  return root(found[0].source_port_id);
}

test("both TPS62903 inputs use main ATX 5 V with shunt bypassing", () => {
  const input = net("ATX", "pin4");
  const ground = net("ATX", "pin3");
  const otherRails = ["pin1", "pin9", "pin10"].map(pin => net("ATX", pin));
  assert.equal(new Set([input, ground, ...otherRails]).size, 5,
    "5 V, 3.3 V, standby 5 V, 12 V and ground must remain separate");
  for (const rail of ["VCCL", "VDD"]) {
    const buck = `${rail}_BUCK`;
    for (const pin of ["VIN"]) {
      assert.equal(net(buck, pin), input, `${buck}.${pin}`);
    }
    for (const pin of ["GND"]) {
      assert.equal(net(buck, pin), ground, `${buck}.${pin}`);
    }
    for (const [suffix, capacitance] of [["CIN", 10e-6], ["HF", 100e-9]]) {
      const name = `C_${rail}_${suffix}`;
      assert.equal(component(name).capacitance, capacitance);
      assert.equal(net(name, "pin1"), input, `${name} must not interrupt the input rail`);
      assert.equal(net(name, "pin2"), ground, `${name} must bypass to ground`);
    }
    for (const pin of ["SW", "FB", "VOS"]) {
      assert.notEqual(net(buck, pin), input, `${buck}.${pin} must not receive raw 5 V`);
      assert.notEqual(net(buck, pin), ground, `${buck}.${pin} must remain available for the output stage`);
    }
  }
});

test("each output capacitor bypasses the filtered rail to ground without touching the switching node", () => {
  const ground = net("ATX", "pin3");
  const input = net("ATX", "pin4");
  const outputs = [];
  for (const rail of ["VCCL", "VDD"]) {
    const name = `C_${rail}_COUT`;
    const output = net(`L_${rail}`, "pin2");
    const switching = net(`L_${rail}`, "pin1");
    assert.equal(component(name).manufacturer_part_number, "CL21A226MAYNNNE");
    assert.equal(component(name).capacitance, 22e-6);
    assert.equal(net(name, "pin1"), output);
    assert.equal(net(name, "pin2"), ground);
    assert.equal(net(`${rail}_BUCK`, "VOS"), output);
    assert.equal(new Set([input, ground, switching, output]).size, 4,
      "the capacitor must bypass the output after the inductor, not raw 5 V or SW");
    outputs.push(output);
  }
  assert.notEqual(outputs[0], outputs[1], "output capacitors must not join the two supply rails");
});

test("feedback dividers sense each filtered output, return to GND, and set the intended nominal voltage", () => {
  const ground = net("ATX", "pin3");
  const feedbackNets = [];
  for (const [rail, topOhms, target] of [["VCCL", 26100, 1.9], ["VDD", 10700, 1.13]]) {
    const buck = `${rail}_BUCK`;
    const top = `R_${rail}_FBT`;
    const bottom = `R_${rail}_FBB`;
    const feedback = net(buck, "FB");
    const output = net(`L_${rail}`, "pin2");
    assert.equal(component(top).resistance, topOhms);
    assert.equal(component(bottom).resistance, 12100);
    assert.equal(component(bottom).manufacturer_part_number, "RT0402BRD0712K1L");
    assert.equal(net(top, "pin1"), output, "top resistor must sense the filtered output");
    assert.equal(net(top, "pin2"), feedback);
    assert.equal(net(bottom, "pin1"), feedback);
    assert.equal(net(bottom, "pin2"), net(buck, "GND"));
    assert.equal(new Set([feedback, output, ground, net(buck, "SW"), net("ATX", "pin4")]).size, 5,
      "the divider midpoint must remain separate from output, switching, ground and input");
    const nominal = 0.6 * (1 + component(top).resistance / component(bottom).resistance);
    assert.ok(Math.abs(nominal - target) / target < 0.004, `${rail} nominal target`);
    assert.ok(0.6 / component(bottom).resistance > 2e-6, "divider current exceeds the TI minimum");
    feedbackNets.push(feedback);
  }
  assert.notEqual(feedbackNets[0], feedbackNets[1], "the control loops must remain separate");
});

test("each buck drives its own bridge rail through one 2.2 uH inductor with output sensing after the inductor", () => {
  const input = net("ATX", "pin4");
  const ground = net("ATX", "pin3");
  const outputs = [];
  for (const rail of ["VCCL", "VDD"]) {
    const buck = `${rail}_BUCK`;
    const name = `L_${rail}`;
    assert.equal(component(name).manufacturer_part_number, "SLW5040S2R2MST");
    assert.equal(component(name).inductance, "2.2uH");
    const switching = net(name, "pin1");
    const output = net(name, "pin2");
    for (const pin of ["SW"]) {
      assert.equal(net(buck, pin), switching, `${buck}.${pin}`);
    }
    assert.equal(net(buck, "VOS"), output, "sense the filtered output rather than the switching node");
    const bridgePorts = ports.filter(p => p.source_component_id === component("ASM2464PDX").source_component_id
      && p.port_hints.includes(rail));
    assert.ok(bridgePorts.length > 0, `${rail} bridge supply pins`);
    for (const port of bridgePorts) {
      assert.equal(root(port.source_port_id), output, `${rail} must reach every corresponding bridge supply pin`);
    }
    assert.equal(new Set([input, ground, switching, output]).size, 4,
      "the output must not bypass the inductor or connect to raw 5 V or ground");
    outputs.push(output);
  }
  assert.notEqual(outputs[0], outputs[1], "the two low-voltage rails must stay separate");
});


test("21 kohm MODE resistors select external feedback, 1 MHz forced PWM and no active discharge", () => {
  const ground = net("ATX", "pin3");
  const modeNets = [];
  for (const rail of ["VCCL", "VDD"]) {
    const buck = `${rail}_BUCK`;
    const resistor = `R_${rail}_MODE`;
    assert.equal(component(buck).manufacturer_part_number, "TPS62903RPJR");
    assert.equal(component(resistor).resistance, 21000);
    assert.equal(component(resistor).manufacturer_part_number, "0402 ±1% 21K");
    assert.equal(net(buck, "MODE"), net(resistor, "pin1"));
    assert.equal(net(resistor, "pin2"), ground);
    assert.notEqual(net(buck, "MODE"), ground, "MODE must see 21k, not a direct ground strap");
    assert.notEqual(net(buck, "MODE"), net(buck, "FB"));
    modeNets.push(net(buck, "MODE"));
    const buckPorts = ports.filter(p => p.source_component_id === component(buck).source_component_id);
    assert.equal(buckPorts.length, 9, "the replacement has nine physical pins and no separate exposed pad");
    for (const [pin, signal] of [[1, "PG"], [2, "SW"], [3, "VOS"], [4, "GND"], [5, "EN"],
      [6, "VIN"], [7, "MODE"], [8, "SS"], [9, "FB"]]) {
      const port = buckPorts.find(p => p.port_hints.includes(`pin${pin}`));
      assert.ok(port?.port_hints.includes(signal), `${buck} pin ${pin} must be ${signal}`);
    }
    assert.equal(json.filter(e => e.type === "source_trace" && e.connected_source_port_ids.includes(
      buckPorts.find(p => p.port_hints.includes("SS")).source_port_id)).length, 0,
      "SS/TR stays open for the previously selected fastest startup");
  }
  assert.notEqual(modeNets[0], modeNets[1]);
});

test("reference, divider tolerance, drift and leakage leave at least 10 mV for remaining rail errors", () => {
  // TPS62903 table 6.5: reference +/-0.9%, FB leakage max 70 nA.
  // Resistors: +/-0.1% initially, +/-25 ppm/C each, 125 C from the 25 C reference.
  // This is a static component budget; ripple, PCB losses and load steps remain separate.
  const variation = 0.001 + 25e-6 * 125;
  for (const [rail, minimum, maximum] of [["VCCL", 1.85, 1.95], ["VDD", 1.10, 1.16]]) {
    const top = component(`R_${rail}_FBT`).resistance;
    const bottom = component(`R_${rail}_FBB`).resistance;
    const low = 0.6 * 0.991 * (1 + top * (1 - variation) / (bottom * (1 + variation)))
      - 70e-9 * top * (1 + variation);
    const high = 0.6 * 1.009 * (1 + top * (1 + variation) / (bottom * (1 - variation)))
      + 70e-9 * top * (1 + variation);
    assert.ok(low >= minimum + 0.010, `${rail} low bound ${low}`);
    assert.ok(high <= maximum - 0.010, `${rail} high bound ${high}`);
  }
});


test("VCCH supervisor controls both buck enables through its open-drain output and pull-up", () => {
  const ground = net("ATX", "pin3");
  const vcch = net("ATX", "pin1");
  const enable = net("U_BUCK_EN", "N_RESET");
  const sense = net("U_BUCK_EN", "SENSE");
  assert.equal(component("U_BUCK_EN").manufacturer_part_number, "TPS389001DSER");
  assert.equal(net("U_BUCK_EN", "VDD"), vcch);
  assert.equal(net("U_BUCK_EN", "N_MR"), vcch);
  assert.equal(net("U_BUCK_EN", "GND"), ground);
  assert.equal(component("R_BUCK_EN_TOP").resistance, 16200);
  assert.equal(component("R_BUCK_EN_BOTTOM").resistance, 10000);
  assert.equal(component("R_BUCK_EN_TOP").manufacturer_part_number, "RT0402BRD0716K2L");
  assert.equal(component("R_BUCK_EN_BOTTOM").manufacturer_part_number, "RT0402BRD0710KL");
  assert.equal(net("R_BUCK_EN_TOP", "pin1"), vcch);
  assert.equal(net("R_BUCK_EN_TOP", "pin2"), sense);
  assert.equal(net("R_BUCK_EN_BOTTOM", "pin1"), sense);
  assert.equal(net("R_BUCK_EN_BOTTOM", "pin2"), ground);
  assert.equal(component("R_BUCK_EN_PU").resistance, 10000);
  assert.equal(net("R_BUCK_EN_PU", "pin1"), vcch);
  assert.equal(net("R_BUCK_EN_PU", "pin2"), enable);
  assert.equal(component("C_BUCK_EN").capacitance, 100e-9);
  assert.equal(net("C_BUCK_EN", "pin1"), vcch);
  assert.equal(net("C_BUCK_EN", "pin2"), ground);
  for (const rail of ["VCCL", "VDD"]) {
    assert.equal(net(`${rail}_BUCK`, "EN"), enable);
    assert.notEqual(net(`${rail}_BUCK`, "PG"), enable, "PG must not form an enable feedback loop");
  }
  assert.equal(new Set([enable, sense, vcch, ground, net("ATX", "pin4"), net("R_RST", "pin2")]).size, 6,
    "enable, sense, supplies, ground and bridge reset must remain separate");
  const supervisorPorts = ports.filter(p => p.source_component_id === component("U_BUCK_EN").source_component_id);
  assert.equal(supervisorPorts.length, 6);
  for (const [pin, signal] of [[1, "SENSE"], [2, "GND"], [3, "N_MR"], [4, "VDD"], [5, "CT"], [6, "N_RESET"]]) {
    const port = supervisorPorts.find(p => p.port_hints.includes(`pin${pin}`));
    assert.ok(port?.port_hints.includes(signal), `supervisor pin ${pin} must be ${signal}`);
  }
  const ct = supervisorPorts.find(p => p.port_hints.includes("CT"));
  assert.equal(json.filter(e => e.type === "source_trace" && e.connected_source_port_ids.includes(ct.source_port_id)).length, 0);
  assert.ok(Math.abs(1.157 * (1 + 16200 / 10000) - 3.03134) < 1e-6);
});
