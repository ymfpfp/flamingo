import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdirSync, writeFileSync} from "node:fs";
import {RootCircuit} from "tscircuit";
import {runAllNetlistChecks, runAllPlacementChecks, runAllRoutingChecks} from "@tscircuit/checks";
import {convertCircuitJsonToPcbSvg} from "circuit-to-svg";
import {Resvg} from "@resvg/resvg-js";
import FixedRoutingExample, {savedEscape} from "../examples/fixed-routing.circuit";

async function render(props) {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
  circuit.schematicDisabled = true;
  circuit.add(FixedRoutingExample(props));
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

function tracesFor(json, name) {
  const source = json.find(e => e.type === "source_trace" && e.name === name);
  assert.ok(source, `Missing source trace ${name}`);
  return json.filter(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
}

function geometry(trace) {
  // Ignore generated IDs, but compare every coordinate, layer, width and via size.
  return trace.route.map(({start_pcb_port_id, end_pcb_port_id, pcb_port_id, ...point}) => point);
}

function save(json, name) {
  const dir = "dist/fixed-routing";
  mkdirSync(dir, {recursive: true});
  writeFileSync(`${dir}/${name}.circuit.json`, JSON.stringify(json, null, 2));
  const svg = convertCircuitJsonToPcbSvg(json, {width: 1000, height: 750, showSolderMask: false});
  writeFileSync(`${dir}/${name}.svg`, svg);
  writeFileSync(`${dir}/${name}.png`, new Resvg(svg).render().asPng());
}

for (const manualVias of [false, true]) {
  test(`autorouting preserves fixed paths ${manualVias ? "with" : "without"} manual vias`, {timeout: 60000}, async () => {
    const before = await render({routeRemaining: false, manualVias});
    const after = await render({routeRemaining: true, manualVias});
    const variant = manualVias ? "manual-vias" : "top-detour";
    save(before, `${variant}-before`);
    save(after, `${variant}-after`);
    const fixedBefore = tracesFor(before, "FIXED");
    const fixedAfter = tracesFor(after, "FIXED");
    assert.equal(fixedBefore.length, 1);
    assert.deepEqual(fixedAfter.map(geometry), fixedBefore.map(geometry), "manual route changed");
    assert.equal(fixedBefore[0].route.filter(p => p.route_type === "via").length, manualVias ? 2 : 0);
    assert.ok(fixedBefore[0].route.some(p => p.y === 2), "intentional detour must be present");

    // Saved fanout copper is emitted during routing; compare it to its source.
    const savedAfter = tracesFor(after, "AUTO_CONTINUATION");
    const saved = savedAfter.find(t => t.pcb_trace_id.startsWith("saved_fanout_"));
    assert.ok(saved, "saved fanout must render");
    assert.deepEqual(geometry(saved), savedEscape[0].route.map(p => ({...p, x: p.x - 8, y: p.y - 4})), "saved fanout changed");
    assert.deepEqual(after.filter(e => e.type === "pcb_via" && e.pcb_trace_id === saved.pcb_trace_id)
      .map(v => ({x: v.x, y: v.y, from: v.from_layer, to: v.to_layer, hole: v.hole_diameter, copper: v.outer_diameter})), [
      {x: -6, y: -4, from: "top", to: "inner2", hole: 0.3, copper: 0.6},
      {x: -4, y: -4, from: "inner2", to: "top", hole: 0.3, copper: 0.6},
    ], "saved via geometry changed");
    assert.ok(savedAfter.length > 1, "autorouter must continue from the saved exit");
    assert.ok(savedAfter.filter(t => t !== saved).some(t => t.route.some(p => p.x === -3 && p.y === -4 && p.layer === "top")), "continuation must touch the saved exit");
    assert.equal(tracesFor(before, "AUTO_CROSSING").length, 0);
    assert.ok(tracesFor(after, "AUTO_CROSSING").length > 0, "crossing connection must be autorouted");

    const fixedTraceIds = new Set(fixedBefore.map(t => t.pcb_trace_id));
    const fixedVias = json => json.filter(e => e.type === "pcb_via" && fixedTraceIds.has(e.pcb_trace_id))
      .map(({pcb_via_id, ...via}) => via);
    assert.deepEqual(fixedVias(after), fixedVias(before), "fixed via geometry changed");
    assert.deepEqual(await runAllNetlistChecks(after), []);
    assert.deepEqual(await runAllPlacementChecks(after), []);
    assert.deepEqual(await runAllRoutingChecks(after), []);
    assert.deepEqual(after.filter(e => e.type.endsWith("_error")), []);
    console.log(`${variant}: fixed route and saved escape unchanged; crossing and continuation routed`);
  });
}
