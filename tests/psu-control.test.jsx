import assert from "node:assert/strict";
import {test} from "node:test";
import {Circuit} from "tscircuit";
import {SN74AHCT1G14DBVR} from "../imports/SN74AHCT1G14DBVR";
import Board from "../index.circuit";

const circuit = new Circuit();
circuit.pcbDisabled = true;
circuit.schematicDisabled = true;
circuit.add(Board());
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const components = json.filter(e => e.type === "source_component");
const ports = json.filter(e => e.type === "source_port");
const component = name => {
  const c = components.find(e => e.name === name);
  assert.ok(c, name);
  return c;
};
function port(name, alias) {
  const matches = ports.filter(p => p.source_component_id === component(name).source_component_id
    && p.port_hints.includes(alias));
  assert.equal(matches.length, 1, `${name}.${alias}`);
  return matches[0].source_port_id;
}
function connectivity(includeStartLink) {
  const parents = new Map();
  function root(id) {
    if (!parents.has(id)) parents.set(id, id);
    if (parents.get(id) !== id) parents.set(id, root(parents.get(id)));
    return parents.get(id);
  }
  function join(ids) {
    for (const id of ids.slice(1)) parents.set(root(id), root(ids[0]));
  }
  for (const t of json.filter(e => e.type === "source_trace")) {
    join([...t.connected_source_port_ids, ...t.connected_source_net_ids]);
  }
  for (const c of components) {
    if (c.ftype === "simple_resistor" && c.resistance === 0
      && (includeStartLink || c.name !== "R_PSU_ON")) {
      join(ports.filter(p => p.source_component_id === c.source_component_id).map(p => p.source_port_id));
    }
  }
  const net = (name, alias) => root(port(name, alias));
  net.port = id => root(id);
  return net;
}
const net = connectivity(true);

test("the removable start link grounds PS_ON# without shorting a supply rail", () => {
  const ground = net("ATX", "pin3");
  assert.equal(component("R_PSU_ON").resistance, 0);
  assert.equal(net("ATX", "pin16"), ground);
  for (const pin of ["pin1", "pin4", "pin9", "pin10", "pin8"]) {
    assert.notEqual(net("ATX", pin), ground, `ATX.${pin}`);
  }
  const linkRemoved = connectivity(false);
  assert.notEqual(linkRemoved("ATX", "pin16"), linkRemoved("ATX", "pin3"));
  assert.equal(linkRemoved("ATX", "pin16"), linkRemoved("R_PSU_ON", "pin1"));
  assert.equal(linkRemoved("R_PSU_ON", "pin2"), linkRemoved("ATX", "pin3"));
});

test("PWR_OK only senses through the TTL input and pull-down; the 5 V driver supplies LED current", () => {
  assert.equal(component("U_PSU_LED").manufacturer_part_number, "SN74AHCT1G14DBVR");
  assert.equal(component("LED_PSU_OK").manufacturer_part_number, "XL-1608UWC-04");
  const status = net("ATX", "pin8");
  const ground = net("ATX", "pin3");
  const main5V = net("ATX", "pin4");
  assert.equal(net("U_PSU_LED", "pin2"), status);
  assert.equal(net("R_PSU_OK_PD", "pin1"), status);
  assert.equal(net("R_PSU_OK_PD", "pin2"), ground);
  assert.equal(net("U_PSU_LED", "pin5"), main5V);
  assert.equal(net("U_PSU_LED", "pin3"), ground);
  assert.equal(net("C_PSU_LED", "pin1"), main5V);
  assert.equal(net("C_PSU_LED", "pin2"), ground);
  assert.equal(component("C_PSU_LED").capacitance, 100e-9);
  assert.equal(net("R_PSU_LED", "pin1"), main5V);
  assert.equal(net("R_PSU_LED", "pin2"), net("LED_PSU_OK", "anode"));
  assert.equal(net("LED_PSU_OK", "cathode"), net("U_PSU_LED", "pin4"));
  assert.equal(new Set([status, ground, main5V, net("LED_PSU_OK", "anode"),
    net("LED_PSU_OK", "cathode"), net("ATX", "pin9")]).size, 6);
  const directlyLoadedByStatus = ports.filter(p => net.port(p.source_port_id) === status)
    .map(p => components.find(c => c.source_component_id === p.source_component_id).name);
  assert.deepEqual([...new Set(directlyLoadedByStatus)].sort(), ["ATX", "R_PSU_OK_PD", "U_PSU_LED"]);
});

test("the status input and LED branch stay within their datasheet current budgets", () => {
  // Intel PWR_OK: 2.4..5 V high, 200 uA guaranteed sourcing.
  // TI AHCT1G14: VT+ <=2.0 V, input leakage <=1 uA, sink current <=8 mA.
  const pullDownMin = component("R_PSU_OK_PD").resistance * 0.99;
  const ledResistanceMin = component("R_PSU_LED").resistance * 0.99;
  assert.ok(5 / pullDownMin + 1e-6 < 200e-6, "PWR_OK sources only pull-down current and input leakage");
  // Conservative bound: ignore LED forward voltage and output saturation entirely.
  assert.ok(5.25 / ledResistanceMin < 8e-3, "the LED branch cannot exceed the driver sink rating");
  assert.ok(5.25 ** 2 / ledResistanceMin < 0.0625, "the 0402 resistor stays below 1/16 W");
});

test("PSU inverter lands retain clearance at every packing rotation", async () => {
  for(const rotation of [0,90,180,270]) {
    const c=new Circuit();c.schematicDisabled=true;
    c.add(<board routingDisabled><SN74AHCT1G14DBVR name="U_TEST" pcbX={0} pcbY={0} pcbRotation={rotation}/></board>);
    await c.renderUntilSettled();
    const j=c.getCircuitJson(), pads=j.filter(e=>e.type==="pcb_smtpad");
    assert.equal(pads.length,5);
    assert.ok(!j.some(e=>e.type==="pcb_pad_pad_clearance_error"),`rotation ${rotation}`);
    const adjacent=[1,2,3].map(pin=>pads.find(p=>p.port_hints.includes(`pin${pin}`)));
    assert.ok(adjacent.every(Boolean));
    for(let i=1;i<adjacent.length;i++) {
      const a=adjacent[i-1],b=adjacent[i];
      const dx=Math.abs(a.x-b.x)-(a.width+b.width)/2;
      const dy=Math.abs(a.y-b.y)-(a.height+b.height)/2;
      assert.ok(Math.max(dx,dy)>=0.349999,`adjacent pin clearance at ${rotation}`);
    }
  }
});
