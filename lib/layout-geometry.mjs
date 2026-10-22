import {createHash} from "node:crypto";

function normalized(value) {
  if (typeof value === "number") return Math.round(value * 1e6) / 1e6;
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalized(v)]));
  return value;
}
export const layoutDigest = value => createHash("sha256").update(JSON.stringify(normalized(value))).digest("hex");
const routeKeys = ["route_type", "x", "y", "width", "end_width", "layer", "from_layer", "to_layer", "via_diameter", "via_hole_diameter"];
export const routeDigest = route => layoutDigest(route.map(q => Object.fromEntries(Object.entries(q).filter(([k]) => routeKeys.includes(k)))));
export function assembledPlacements(json) {
  const sources = new Map(json.filter(e => e.type === "source_component").map(e => [e.source_component_id, e.name]));
  return json.filter(e => e.type === "pcb_component" && sources.has(e.source_component_id))
    .map(p => ({name: sources.get(p.source_component_id), center: p.center, rotation: p.rotation, layer: p.layer})).sort((a, b) => a.name.localeCompare(b.name));
}
export function traceConnections(json) {
  const names = new Map(json.filter(e => e.type === "source_component").map(e => [e.source_component_id, e.name]));
  const ports = new Map(json.filter(e => e.type === "source_port").map(e => [e.source_port_id, `${names.get(e.source_component_id)}.${e.name}`]));
  const nets = new Map(json.filter(e => e.type === "source_net").map(e => [e.source_net_id, `net.${e.name}`]));
  return new Map(json.filter(e => e.type === "source_trace").map(e => [e.source_trace_id, e.name || [...e.connected_source_port_ids.map(id => ports.get(id)), ...e.connected_source_net_ids.map(id => nets.get(id))].sort().join("|")]));
}
