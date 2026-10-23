import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {test} from "node:test";
import {getFullConnectivityMapFromCircuitJson} from "circuit-json-to-connectivity-map";
import {buildSubcircuitConnectivityLookup} from "../node_modules/@tscircuit/copper-pour-solver/lib/circuit-json/buildSubcircuitConnectivityLookup";
import {resolvePourConnectivityKey} from "../node_modules/@tscircuit/copper-pour-solver/lib/circuit-json/resolvePourConnectivityKey";
import {initializeManifoldGeometry} from "@tscircuit/copper-pour-solver";
import {subtractBlockersFromPour} from "../node_modules/@tscircuit/copper-pour-solver/lib/solvers/copper-pour/manifold-geometry-adapter";
import {filterCopperObstacles, patchCopperPourConnectivity, patchCopperPourObstacleFiltering,
  patchCopperPourWorker, patchEmbeddedCircuitWorker} from "../scripts/prepare-preview-runtime.mjs";

const source = readFileSync(createRequire(import.meta.url).resolve("tscircuit/browser"), "utf8");
const workerPattern = /q4n=URL\.createObjectURL\(new Blob\(\[atob\("([A-Za-z0-9+/=]+)"\)/;
const worker = Buffer.from(source.match(workerPattern)[1], "base64").toString("utf8");

function getConverter(bundle, counts = {global: 0, scoped: 0}, isWorker = false) {
  const start = bundle.indexOf(isWorker ? "convertCircuitJsonToInputProblem=" : "Twt=");
  const end = bundle.indexOf(isWorker ? ";init_dist8()" : ";function oPe", start);
  assert.ok(start >= 0 && end > start, "locate the installed viewer's copper input converter");
  const names = isWorker
    ? ["getFullConnectivityMapFromCircuitJson", "buildSubcircuitConnectivityLookup", "resolvePourConnectivityKey"]
    : ["c_", "V5o", "J5o"];
  return new Function(...names, `const ${bundle.slice(start, end)};return ${isWorker ? "convertCircuitJsonToInputProblem" : "Twt"};`)(
    json => { counts.global++; return getFullConnectivityMapFromCircuitJson(json); },
    (...args) => { counts.scoped++; return buildSubcircuitConnectivityLookup(...args); },
    resolvePourConnectivityKey,
  );
}

function fixture() {
  const json = [
    {type: "pcb_board", pcb_board_id: "board", center: {x: 10, y: 10}, width: 20, height: 20},
    ...["root", "child"].flatMap(scope => [
      {type: "source_group", source_group_id: scope, subcircuit_id: scope,
        ...(scope === "child" ? {parent_subcircuit_id: "root"} : {})},
      {type: "source_net", source_net_id: `${scope}-gnd`, name: "GND", subcircuit_id: scope,
        subcircuit_connectivity_map_key: `${scope}-ground`},
      {type: "source_net", source_net_id: `${scope}-vcc`, name: "VCC", subcircuit_id: scope,
        subcircuit_connectivity_map_key: `${scope}-supply`},
      {type: "pcb_smtpad", pcb_smtpad_id: `${scope}-pad`, shape: "rect", layer: "top",
        x: 5, y: 5, width: 1, height: 2, subcircuit_id: scope,
        subcircuit_connectivity_map_key: `${scope}-supply`},
      {type: "pcb_via", pcb_via_id: `${scope}-via`, x: 8, y: 8, outer_diameter: .6,
        layers: ["top", "bottom"], subcircuit_id: scope,
        subcircuit_connectivity_map_key: `${scope}-ground`},
    ]),
    {type: "pcb_hole", pcb_hole_id: "hole", hole_shape: "circle", x: 12, y: 12, hole_diameter: 2},
    {type: "pcb_cutout", pcb_cutout_id: "cutout", shape: "rect", center: {x: 15, y: 10}, width: 2, height: 4},
  ];
  const options = ["root-gnd", "root-vcc", "child-gnd"].flatMap((source_net_id, i) =>
    ["top", "bottom"].map(layer => ({source_net_id, subcircuit_id: "root", layer,
      pad_margin: .2 + i / 10, trace_margin: .25, cutout_margin: .3,
      board_edge_margin: .2, outline: [{x: 0, y: 0}, {x: 20, y: 0}, {x: 20, y: 20}, {x: 0, y: 20}]})));
  return {json, options};
}

test("shared copper connectivity preserves every region, obstacle, and subcircuit net", () => {
  const {json, options} = fixture();
  for (const [bundle, patched, isWorker] of [[source, patchCopperPourConnectivity(source), false],
    [worker, patchCopperPourWorker(worker), true]]) {
    const before = {global: 0, scoped: 0}, after = {global: 0, scoped: 0};
    const original = getConverter(bundle, before, isWorker), optimized = getConverter(patched, after, isWorker);
    assert.deepEqual(optimized(json, options), original(json, options));
    assert.equal(before.global, options.length);
    assert.equal(before.scoped, options.length);
    assert.deepEqual(after, {global: 1, scoped: 1});
    assert.deepEqual(optimized(json, options[0]), original(json, options[0]));
  }
});

test("copper connectivity is rebuilt after board or net edits", () => {
  for (const [bundle, patched, isWorker] of [[source, patchCopperPourConnectivity(source), false],
    [worker, patchCopperPourWorker(worker), true]]) {
    const {json, options} = fixture();
    const counts = {global: 0, scoped: 0};
    const optimized = getConverter(patched, counts, isWorker);
    const first = optimized(json, options);
    json.find(element => element.pcb_smtpad_id === "root-pad").x = 7;
    json.find(element => element.pcb_smtpad_id === "root-pad").subcircuit_connectivity_map_key = "root-ground";
    const changed = optimized(json, options);
    assert.notDeepEqual(changed, first);
    assert.deepEqual(changed, getConverter(bundle, undefined, isWorker)(json, options));
    assert.deepEqual(counts, {global: 2, scoped: 2});
  }
});

test("copper batches keep scope validation and the patch rejects an unknown runtime", () => {
  const patched = patchCopperPourConnectivity(source);
  const convert = getConverter(patched);
  const {json, options} = fixture();
  assert.deepEqual(convert(json, []), {pads: [], regionsForPour: []});
  assert.throws(() => convert(json, [options[0], {...options[1], subcircuit_id: "child"}]), /same subcircuit_id/);
  assert.equal(patchCopperPourConnectivity(patched), patched);
  assert.throws(() => patchCopperPourConnectivity("unknown viewer"), /runtime changed/);
});

const rectangle = (x, y, width, height) => [
  {x, y}, {x: x + width, y}, {x: x + width, y: y + height}, {x, y: y + height},
];

test("obstacle filtering preserves native copper geometry at boundaries and across holes", async () => {
  await initializeManifoldGeometry();
  const outline = [
    {x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10},
    {x: 6, y: 10}, {x: 6, y: 6}, {x: 0, y: 6},
  ];
  const blockers = [
    rectangle(2, 2, 2, 2), // Interior hole.
    rectangle(-1, 3, 2, 1), // Crosses an edge.
    rectangle(-1, -1, 12, .5), // Spans the pour's X range, outside its Y range.
    rectangle(9.9999996, 5, 2, 1), // Rounds onto the native geometry grid.
    rectangle(10.000001, 3, 2, 1), // Kept conservatively near the boundary.
    rectangle(10, 10, 1, 1), // Touches a vertex.
    rectangle(20, 20, 2, 2),
    rectangle(-20, 2, 2, 2),
  ];
  const filtered = filterCopperObstacles(outline, blockers);
  assert.equal(filtered.length, 5);
  const original = subtractBlockersFromPour(outline, blockers);
  const optimized = subtractBlockersFromPour(outline, filtered);
  assert.deepEqual(optimized.toPolygons(), original.toPolygons());
  assert.equal(optimized.subtract(original).area(), 0);
  assert.equal(original.subtract(optimized).area(), 0);
});

test("obstacle filtering retains geometry errors and is installed in the actual viewer", async () => {
  await initializeManifoldGeometry();
  const outline = rectangle(0, 0, 10, 10);
  const invalid = [[{x: 30, y: 30}, {x: Infinity, y: 31}, {x: 31, y: 32}]];
  assert.deepEqual(filterCopperObstacles(outline, invalid), invalid);
  assert.throws(() => subtractBlockersFromPour(outline, filterCopperObstacles(outline, invalid)), /non-finite/);
  const patched = patchCopperPourObstacleFiltering(source);
  assert.ok(patched.includes(`e=(${filterCopperObstacles.toString()})(t,e)`));
  assert.equal(patchCopperPourObstacleFiltering(patched), patched);
  assert.throws(() => patchCopperPourObstacleFiltering("unknown viewer"), /runtime changed/);
});

test("the served bundle embeds the optimized circuit worker", () => {
  const patched = patchEmbeddedCircuitWorker(source);
  const decoded = Buffer.from(patched.match(workerPattern)[1], "base64").toString("utf8");
  assert.equal(decoded, patchCopperPourWorker(worker));
  const counts = {global: 0, scoped: 0}, {json, options} = fixture();
  assert.deepEqual(getConverter(decoded, counts, true)(json, options), getConverter(worker, undefined, true)(json, options));
  assert.deepEqual(counts, {global: 1, scoped: 1});
  assert.equal(patchEmbeddedCircuitWorker(patched), patched);
  assert.throws(() => patchEmbeddedCircuitWorker("unknown viewer"), /cannot locate/);
  assert.throws(() => patchCopperPourWorker("unknown worker"), /worker changed/);
});
