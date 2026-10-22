import baseline from "../../manufacturing/layout-baseline.json";
import powerRework from "../../manufacturing/control-routing/power-via-rework.json";
import groundRework from "../../manufacturing/control-routing/ground-rework.json";
import clockRework from "../../manufacturing/control-routing/clock-rework.json";
import localRework from "../../manufacturing/control-routing/local-control-rework.json";
import componentRework from "../../manufacturing/control-routing/component-rework.json";
import {checkAssemblyRework} from "../../lib/assembly-rework.mjs";
import {assembledPlacements, layoutDigest, routeDigest, traceConnections} from "../../lib/layout-geometry.mjs";
import {checkTracesAreContiguous} from "@tscircuit/checks";
export {assembledPlacements, layoutDigest, routeDigest, traceConnections} from "../../lib/layout-geometry.mjs";

export function checkAssemblyPlacement(json) {
  return checkAssemblyRework(assembledPlacements(json), baseline.assembledPlacementSha256, componentRework);
}
export function auditLayoutPreservation(json) {
  const failures = checkAssemblyPlacement(json), connections = traceConnections(json);
  const changes=[...powerRework.traceChanges,...groundRework.changes,...clockRework.changes,...localRework.traceChanges];
  const actual = new Map();
  for (const trace of json.filter(e => e.type === "pcb_trace")) {
    const key = `${connections.get(trace.source_trace_id)}:${routeDigest(trace.route)}`;
    actual.set(key, (actual.get(key) ?? 0) + 1);
  }
  for (const {connection, digest} of baseline.traces) {
    const authorized = changes.find(change => change.name === connection && change.before === digest);
    const key = `${connection}:${authorized?.after ?? digest}`, count = actual.get(key) ?? 0;
    if (!count) failures.push(`Existing route geometry changed: ${connection}`);
    else actual.set(key, count - 1);
  }
  return {passed: failures.length === 0, failures, preservedTraceCount: baseline.traces.length};
}

export function checkSpecifiedRoutes(json, specs) {
  const failures = [], sources = json.filter(e => e.type === "source_trace");
  const ports = new Map(json.filter(e => e.type === "pcb_port").map(e => [e.source_port_id, e]));
  if(specs.some(s=>s.exactPadContacts))failures.push(...checkTracesAreContiguous(json).map(e=>e.message));
  for (const spec of specs) {
    const source = sources.find(s => s.name === spec.name);
    const traces = json.filter(e => e.type === "pcb_trace" && e.source_trace_id === source?.source_trace_id);
    if (!source || traces.length !== 1) {failures.push(`${spec.name}: expected one attributed route`); continue;}
    const route = traces[0].route;
    if (route.some(q => q.route_type !== "wire" || q.layer !== spec.layer || q.width < spec.width - 1e-8)) failures.push(`${spec.name}: wrong layer or width`);
    if(spec.exactPadContacts){
      if(route.length!==spec.points.length||route.some((q,i)=>Math.hypot(q.x-spec.points[i][0],q.y-spec.points[i][1])>1e-4))failures.push(`${spec.name}: authored pad-contact geometry changed`);
      continue; // Native continuity above checks the actual land, including off-centre contacts.
    }
    for (const id of source.connected_source_port_ids) {
      const at = ports.get(id);
      if (!at || ![route[0], route.at(-1)].some(q => Math.hypot(q.x - at.x, q.y - at.y) < 1e-4)) failures.push(`${spec.name}: route misses an endpoint`);
    }
  }
  return failures;
}
