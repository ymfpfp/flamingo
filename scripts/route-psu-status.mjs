import {readFileSync, writeFileSync} from "node:fs";
import {RootCircuit, SOLVERS, getSimpleRouteJsonFromCircuitJson} from "tscircuit";
import {applyToPoint, compose, inverse, translate} from "transformation-matrix";
import Board from "../index.circuit";
import {psuStatusRoutes, psuStatusTraceWidth} from "../components/PsuStatusRouting";

// Generate the saved phase with tscircuit's standard router on one copper layer.
// Route only this local circuit; preserve the other board phases separately.
let json, board, phase;
const cachedJsonPath = process.argv[2];
const referencePaths = JSON.parse(readFileSync("lib/psu-status-trace-paths.json", "utf8"));
if (cachedJsonPath) {
  json = JSON.parse(readFileSync(cachedJsonPath, "utf8"));
} else {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDisabled: true}});
  circuit.schematicDisabled = true;
  circuit.add(Board());
  await circuit.renderUntilSettled();
  json = circuit.getCircuitJson(); board = circuit._getBoard();
  phase = board.selectAll("autoroutingphase").find(p => p.props.name === "PSU_STATUS");
}
const sources = json.filter(e => e.type === "source_trace");
const ids = new Set(sources.filter(s => psuStatusRoutes.some(r => r.name === s.name)).map(s => s.source_trace_id));
const {simpleRouteJson: input} = getSimpleRouteJsonFromCircuitJson({circuitJson: json.filter(e => e.type !== "pcb_trace")});
input.connections = input.connections.filter(c => ids.has(c.source_trace_id));
if (input.connections.length !== psuStatusRoutes.length) throw new Error("Missing PSU routing connections");
const endpoints = input.connections.flatMap(c => c.pointsToConnect);
input.bounds = {
  minX: Math.min(...endpoints.map(p => p.x)) - 2, maxX: Math.max(...endpoints.map(p => p.x)) + 2,
  minY: 10, maxY: Math.max(...endpoints.map(p => p.y)) + 2,
};
input.layerCount = 1;
input.minTraceWidth = psuStatusTraceWidth;
delete input.outline;
const b = input.bounds;
input.obstacles = input.obstacles.filter(o => o.layers.includes("top")
  && o.center.x + o.width/2 >= b.minX && o.center.x - o.width/2 <= b.maxX
  && o.center.y + o.height/2 >= b.minY && o.center.y - o.height/2 <= b.maxY)
  .map(o => ({...o, layers: ["top"]}));
// Route the compact branches first, then the two ATX feeds. Every path is
// produced by the built-in vector visibility solver on top copper only.
const order = ["GND_CAP", "GND_PD", "GND_IC", "BYPASS", "PULLDOWN", "LED_ANODE",
  "LED_CATHODE", "LED_FEED", "5V", "INPUT"].map(suffix => `PSU_STATUS_${suffix}`);
input.minTraceToPadEdgeClearance = 0.15;
const routed = new Map();
const started = performance.now();
for (const name of order) {
  const source = sources.find(s => s.name === name);
  const connection = input.connections.find(c => c.source_trace_id === source.source_trace_id);
  const solver = new SOLVERS.BusLanesSolver({...input, connections: [connection],
    // Copper on the same electrical net is a valid join, not an obstruction.
    traces: [...routed.entries()].filter(([other]) => sources.find(s => s.name === other)
      .subcircuit_connectivity_map_key !== source.subcircuit_connectivity_map_key).map(([,t]) => t), buses: [{name, connectionNames: [connection.name],
      traceWidth: psuStatusTraceWidth, ...(source.max_length ? {maxLength: source.max_length} : {})}]},
    {smoothTuning: false, denseSearch: false});
  while (!solver.solved && !solver.failed) {
    if (performance.now() - started > 30000) throw new Error("PSU routing exceeded 30 seconds");
    solver.step();
    if (solver.iterations % 200 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!solver.solved) {
    writeFileSync("dist/psu-status-partial.traces.json", JSON.stringify([...routed.values()], null, 2));
    throw new Error(`${name}: ${solver.error ?? "routing failed"}`);
  }
  const trace = solver.traces[0];
  if (trace.route.some(p => p.route_type !== "wire" || p.layer !== "top")) throw new Error("Unexpected layer change");
  routed.set(name, trace);
}
const paths = psuStatusRoutes.map(spec => {
  const trace = routed.get(spec.name);
  const source = sources.find(s => s.name === spec.name);
  const after = json.find(e => e.type === "pcb_port" && e.source_port_id === source.connected_source_port_ids[0]);
  const points = Math.hypot(trace.route[0].x-after.x, trace.route[0].y-after.y) < 1e-4
    ? trace.route : [...trace.route].reverse();
  let transform;
  if (board) {
    const port = board.selectOne(spec.from, {type: "port"});
    const before = port._getGlobalPcbPositionBeforeLayout();
    transform = inverse(compose(translate(after.x-before.x, after.y-before.y),
      phase.getGroup()._computePcbGlobalTransformBeforeLayout()));
  } else {
    // Reuse the saved frame only when this placed circuit matches its reference.
    const reference = referencePaths.find(p => p.connection === spec.from)?.route;
    const old = json.find(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id)?.route;
    if (!reference || !old || reference.length !== old.length || Math.hypot(old[0].x-after.x, old[0].y-after.y)>1e-4
      || reference.some((p,i) => Math.hypot(p.x-reference[0].x-old[i].x+old[0].x,
        p.y-reference[0].y-old[i].y+old[0].y)>1e-4)) throw new Error("Rebuild placement without a cached JSON argument");
    transform = translate(reference[0].x-after.x, reference[0].y-after.y);
  }
  return {connection: spec.from, route: points.map(p => ({route_type: "wire",
    ...applyToPoint(transform, p), width: psuStatusTraceWidth, layer: "top"}))};
});
writeFileSync("lib/psu-status-trace-paths.json", `${JSON.stringify(paths, null, 2)}\n`);
console.log(`Saved ${paths.length} top-layer paths from the native autorouter.`);
