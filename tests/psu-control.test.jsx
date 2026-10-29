import assert from "node:assert/strict";
import {test} from "node:test";
import {boardFixture} from "./board-fixture.mjs";

const json = boardFixture();
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

test("external PWR_OK wire access stays isolated from automatic start, supplies and reset", () => {
  assert.equal(net("ATX", "pin8"), net("PSU_ACCESS", "PWR_OK"));
  assert.equal(net("ATX", "pin4"), net("PSU_ACCESS", "V5V"));
  assert.equal(net("ATX", "pin3"), net("PSU_ACCESS", "GND"));
  const access=component("PSU_ACCESS");
  assert.ok(json.find(e=>e.type==="pcb_component" && e.source_component_id===access.source_component_id).do_not_place);
  assert.equal(json.filter(e=>e.type==="pcb_plated_hole" && e.pcb_component_id===json.find(e=>e.type==="pcb_component" && e.source_component_id===access.source_component_id).pcb_component_id).length,3);
  const status = net("ATX", "pin8");
  for (const [name, pin] of [["ATX", "pin3"], ["ATX", "pin16"], ["ATX", "pin4"],
    ["U_BUCK_EN", "N_RESET"], ["ASM2464PDX", "RST_N"]]) {
    assert.notEqual(status, net(name, pin), `${name}.${pin}`);
  }
});
