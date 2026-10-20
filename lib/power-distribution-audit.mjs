// Inspect emitted power contacts and preserve the previous validated layout.
import { createHash } from "node:crypto";
import preserved from "../manufacturing/power-distribution/preserved-layout.json";
import terminals from "../manufacturing/power-distribution/terminals.json";
import paths from "../manufacturing/power-distribution/bga-escapes.json";
import capPaths from "../manufacturing/power-distribution/cap-escapes.json";
function normalized(value) {
  if (typeof value === "number")
    return Math.round(value * 1e6) / 1e6;
  if (Array.isArray(value))
    return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalized(v)]));
  return value;
}
var layoutDigest = (value) => createHash("sha256").update(JSON.stringify(normalized(value))).digest("hex");
var routeKeys = ["route_type", "x", "y", "width", "end_width", "layer", "from_layer", "to_layer", "via_diameter", "via_hole_diameter"];
var routeDigest = (route) => layoutDigest(route.map((q) => Object.fromEntries(Object.entries(q).filter(([k]) => routeKeys.includes(k)))));
function assembledPlacements(json) {
  const sc = new Map(json.filter((e) => e.type === "source_component").map((e) => [e.source_component_id, e]));
  return json.filter((e) => e.type === "pcb_component" && sc.has(e.source_component_id)).map((p) => ({ name: sc.get(p.source_component_id).name, center: p.center, rotation: p.rotation, layer: p.layer })).sort((a, b) => a.name.localeCompare(b.name));
}
function auditPowerDistribution(json) {
  const failures = [];
  const parts = assembledPlacements(json);
  if (parts.length !== preserved.assembledCount || layoutDigest(parts) !== preserved.assembledPlacementSha256)
    failures.push("Assembled placement changed during power distribution routing");
  const traces = new Map(json.filter((e) => e.type === "pcb_trace").map((e) => [e.pcb_trace_id, e]));
  for (const [id, digest] of Object.entries(preserved.traceGeometrySha256)) {
    const t = traces.get(id);
    if (!t || routeDigest(t.route) !== digest)
      failures.push(`Existing route geometry changed: ${id}`);
  }
  const sources = new Map(json.filter((e) => e.type === "source_trace").map((e) => [e.source_trace_id, e]));
  for (const p of [...capPaths, ...paths]) {
    const s = [...sources.values()].find((t2) => t2.name === `${p.name}_TRACE`);
    const found = [...traces.values()].filter((t2) => t2.source_trace_id === s?.source_trace_id);
    if (!s || found.length !== 1) {
      failures.push(`${p.name}: expected one correctly attributed contact route`);
      continue;
    }
    const t = found[0];
    if (t.connection_name !== s.source_trace_id)
      failures.push(`${p.name}: saved route connection metadata disagrees with its source`);
    const actual = t.route.filter((q) => q.route_type === "wire");
    if (actual.some((q) => q.layer !== "top" || q.width < 0.1 - 0.00000001))
      failures.push(`${p.name}: contact must stay on top at >=0.1 mm width`);
    const terminal = terminals.find((t2) => t2.name === p.name);
    for (const expected of [p.route[0], { x: terminal.x, y: terminal.y }])
      if (![actual[0], actual.at(-1)].some((q) => Math.hypot(q.x - expected.x, q.y - expected.y) < 0.0001))
        failures.push(`${p.name}: wrong physical contact endpoint`);
  }
  for (const rail of ["VCCL", "VDD"]) {
    const n = json.find((e) => e.type === "source_net" && e.name === rail);
    const layer = rail === "VCCL" ? "inner2" : "inner3";
    if (!json.some((e) => e.type === "pcb_copper_pour" && e.source_net_id === n?.source_net_id && e.layer === layer))
      failures.push(`${rail}: missing assigned power region`);
  }
  return {
    passed: !failures.length,
    failures,
    preservedTraceCount: Object.keys(preserved.traceGeometrySha256).length,
    assembledComponentsOnTop: parts.filter((p) => p.layer === "top").length,
    contactRoutes: paths.length + capPaths.length,
    scope: "Fixed placement, previous route preservation, named contact geometry and assigned L3/L4 regions. Physical copper and DC screens are separate required checks.",
    limitations: "No AC PDN, package model, load-step or thermal qualification. ASMedia maximum rail currents remain TBD in the available datasheet."
  };
}
export {
  routeDigest,
  layoutDigest,
  auditPowerDistribution,
  assembledPlacements
};
