import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import {runAllNetlistChecks, runAllPlacementChecks, checkTracesAreContiguous} from "@tscircuit/checks";
import Board from "../index.circuit";
import {psuStatusRoutes, psuStatusTraceWidth} from "../components/PsuStatusRouting";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";

const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
circuit.schematicDisabled = true;
circuit.add(Board());
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();

test("PWR_OK, its independent 5 V LED branch, and local ground returns have top-layer copper", async () => {
  for (const {name} of psuStatusRoutes) {
    const source = json.find(e => e.type === "source_trace" && e.name === name);
    assert.ok(source, name);
    const copper = json.filter(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
    assert.equal(copper.length, 1, name);
    const route = copper[0].route;
    assert.ok(route.length >= 2, name);
    assert.ok(route.every(p => p.route_type === "wire" && p.layer === "top"
      && p.width >= psuStatusTraceWidth - 1e-6), `${name}: top copper, no signal vias`);
    if (source.max_length !== undefined) {
      const length = route.slice(1).reduce((sum, p, i) =>
        sum + Math.hypot(p.x-route[i].x, p.y-route[i].y), 0);
      assert.ok(length <= source.max_length + 1e-6, `${name}: bypass connection stays short`);
    }
    for (const id of source.connected_source_port_ids) {
      const port = json.find(e => e.type === "pcb_port" && e.source_port_id === id);
      assert.ok(port, `${name}: placed endpoint`);
      assert.ok([route[0], route.at(-1)].some(p => Math.hypot(p.x-port.x, p.y-port.y) < 1e-4),
        `${name}: copper reaches both endpoints`);
    }
  }
  const ground = json.find(e => e.type === "source_net" && e.name === "GND");
  const groundVias = json.filter(e => e.type === "pcb_via" && e.x > 39 && e.x < 47 && e.y > 21 && e.y < 29);
  assert.equal(groundVias.length, 3);
  assert.ok(groundVias.every(v => {
    const source = json.find(e => e.type === "source_trace" && e.source_trace_id === v.source_trace_id);
    const isGround = source?.connected_source_port_ids.some(id => json.some(e => e.type === "source_port"
      && e.source_port_id === id && e.subcircuit_connectivity_map_key === ground.subcircuit_connectivity_map_key));
    return isGround && v.layers.includes("inner1") && v.layers.includes("inner4");
  }));
  assert.deepEqual(json.filter(e => e.type === "pcb_autorouting_error" || e.type === "source_runtime_error"), []);
  assert.deepEqual(await runAllNetlistChecks(json), []);
  assert.deepEqual(await runAllPlacementChecks(json), []);
  assert.deepEqual(checkTracesAreContiguous(json), []);
  const report = await runJlcpcbDrc(json);
  assert.ok(report.passed, JSON.stringify(report.findings.filter(f => f.severity === "error")));
});
