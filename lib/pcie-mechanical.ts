import type {AnyCircuitElement} from "circuit-json";
import {getBoundsOfPcbElements} from "@tscircuit/circuit-json-util";

type Point = {x: number; y: number};
type Rect = {minX: number; maxX: number; minY: number; maxY: number};
// Native XKB footprint coordinates: +X away from the bracket, +Y toward row A.
// XKB X1618WVS drawing pp. 1-2, 164-position variant:
// body D=89, width=8.80 (-5.10..+3.70), hold-down lands K=92,
// signal lands end at +/-4.60. Reserve the connector's full assembly envelope.
const connectorKeepout: Rect = {minX: -46, maxX: 46, minY: -5.1, maxY: 4.6};

const prefix = "pcie_mechanical_";
const corners = (r: Rect): Point[] => [
  {x: r.minX, y: r.minY}, {x: r.maxX, y: r.minY},
  {x: r.maxX, y: r.maxY}, {x: r.minX, y: r.maxY},
];
const area = (p: Point[]) => Math.abs(p.reduce((sum, a, i) => {
  const b = p[(i + 1) % p.length];
  return sum + a.x * b.y - b.x * a.y;
}, 0)) / 2;

// Clip the rotated keepout to the rectangular board or component bounds.
function clip(polygon: Point[], rect: Rect): Point[] {
  for (const [axis, value, sign] of [
    ["x", rect.minX, 1], ["x", rect.maxX, -1],
    ["y", rect.minY, 1], ["y", rect.maxY, -1],
  ] as const) {
    const input = polygon;
    polygon = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i], b = input[(i + 1) % input.length];
      const aIn = sign * (a[axis] - value) >= 0;
      const bIn = sign * (b[axis] - value) >= 0;
      if (aIn) polygon.push(a);
      if (aIn !== bIn) {
        const t = (value - a[axis]) / (b[axis] - a[axis]);
        polygon.push({x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)});
      }
    }
  }
  return polygon;
}

export function getPcieConnectorKeepout(json: AnyCircuitElement[]) {
  const source = json.find(e => e.type === "source_component" && e.name === "PCIe");
  if (source?.type !== "source_component") return undefined;
  if (source.manufacturer_part_number !== "X1618WVS-164-9TV30") {
    throw new Error("Review the PCIe keepout for the replacement connector");
  }
  const connector = json.find(e => e.type === "pcb_component" && e.source_component_id === source.source_component_id);
  const board = json.find(e => e.type === "pcb_board");
  if (connector?.type !== "pcb_component" || board?.type !== "pcb_board") return undefined;
  if (!board.width || !board.height || board.outline?.length) {
    throw new Error("Review PCIe keepout clipping for a board with a custom outline");
  }
  if (connector.layer !== "top") throw new Error("The PCIe connector must stay on the top layer");
  const bounds = {minX: board.center.x - board.width / 2, maxX: board.center.x + board.width / 2,
    minY: board.center.y - board.height / 2, maxY: board.center.y + board.height / 2};
  const angle = connector.rotation * Math.PI / 180;
  const transform = (p: Point): Point => ({
    x: connector.center.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: connector.center.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  });
  return {connector, bounds, polygon: clip(corners(connectorKeepout).map(transform), bounds)};
}

type PcieKeepoutFinding = {
  rule: "pcie_component_keepout"; severity: "error"; message: string; elementIds: string[];
};

export function checkPcieConnectorKeepout(json: AnyCircuitElement[]): PcieKeepoutFinding[] {
  const geometry = getPcieConnectorKeepout(json);
  if (!geometry) return [];
  const {connector, polygon} = geometry;
  const sources = new Map(json.filter(e => e.type === "source_component").map(e => [e.source_component_id, e]));
  const findings: PcieKeepoutFinding[] = [];
  for (const part of json.filter(e => e.type === "pcb_component")) {
    if (part.pcb_component_id === connector.pcb_component_id || part.layer !== connector.layer
      || part.source_component_id?.startsWith("source_manually_placed_via_")) continue;
    const ownGeometry = json.filter(e => (e.type.startsWith("pcb_courtyard_") || e.type === "pcb_component")
      && "pcb_component_id" in e && e.pcb_component_id === part.pcb_component_id)
      .map(e => e.type === "pcb_component" ? {...e, rotation: 0} : e);
    const bounds = getBoundsOfPcbElements(ownGeometry);
    if (area(clip(polygon, bounds)) <= 1e-6) continue;
    const source = sources.get(part.source_component_id);
    findings.push({rule: "pcie_component_keepout", severity: "error",
      message: `${source?.name}: component overlaps the XKB PCIe assembly keepout.`,
      elementIds: [part.pcb_component_id, connector.pcb_component_id]});
  }
  return findings;
}

// Called after group placement in both full renders and cached moves. Notes are
// board-owned so their dimensions never alter the connector's placement bounds.
// Traces, vias and pours remain available beneath the connector.
export function updatePcieConnectorKeepout(json: AnyCircuitElement[]) {
  const geometry = getPcieConnectorKeepout(json);
  if (!geometry) return;
  const {polygon} = geometry;
  const generated: AnyCircuitElement[] = [];
  if (area(polygon) > 1e-6) {
    generated.push({type: "pcb_note_path", pcb_note_path_id: `${prefix}xkb-body`,
      name: `${prefix}xkb-body`, route: [...polygon, polygon[0]],
      layer: "top", stroke_width: 0.18, color: "#e05a5a"});
  }
  for (const [index, finding] of checkPcieConnectorKeepout(json).entries()) {
    generated.push({type: "pcb_placement_error", pcb_placement_error_id: `${prefix}error_${index}`,
      error_type: "pcb_placement_error", message: finding.message});
  }
  const id = (e: AnyCircuitElement) => (e as unknown as Record<string, unknown>)[`${e.type}_id`] as string;
  const pending = new Map(generated.map(e => [id(e), e]));
  // Preserve existing element order when refreshing the preview.
  for (let i = 0; i < json.length; i++) {
    const key = id(json[i]);
    if (!key?.startsWith(prefix)) continue;
    const replacement = pending.get(key);
    if (replacement) { Object.assign(json[i], replacement); pending.delete(key); }
    else { json.splice(i, 1); i--; }
  }
  json.push(...pending.values());
}
