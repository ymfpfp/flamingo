import type {AnyCircuitElement} from "circuit-json";
import {getBoundsOfPcbElements} from "@tscircuit/circuit-json-util";

type Point = {x: number; y: number};
type Rect = {minX: number; maxX: number; minY: number; maxY: number};
export type PcieMechanicalZone = Rect & {
  name: string;
  label: string;
  color: string;
  maxHeightMm: number;
};

// Native XKB footprint coordinates: +X away from the bracket, +Y toward row A.
// XKB X1618WVS drawing pp. 1-2, 164-position variant:
// body D=89, width=8.80 (-5.10..+3.70), hold-down lands K=92,
// signal lands end at +/-4.60. The first locator/datum is X=-29.85.
// CEM 4.0 v0.9 Fig. 33 defines datum A at A11+1.65 (not key center).
// Fig. 86: datum A is 46.94 from the mounting datum; the front board edge
// is -10.16, the 5.08/15.24 boundary is +5.09, and board depth is 243.84.
// The transverse edge is -(34.29+47.29). The far boundary follows the
// actual XKB housing on row A, as the CEM illustration follows its housing.
// The 2.50-wide, 10.30-long anti-misinsertion zone ends at the housing front.
// These are system-board zones, not the card's edge-finger copper keepouts.
export const pcieMechanicalZones: readonly PcieMechanicalZone[] = [
  {name: "xkb-body", label: "XKB: no other components", color: "#e05a5a", maxHeightMm: 0,
    minX: -46, maxX: 46, minY: -5.1, maxY: 4.6},
  {name: "cem-front", label: "CEM: 5.08 mm max", color: "#b67cdb", maxHeightMm: 5.08,
    minX: -29.85 - 46.94 - 10.16, maxX: -29.85 - 46.94 + 5.09,
    minY: -34.29 - 47.29, maxY: 3.7},
  {name: "cem-card", label: "CEM: 15.24 mm max", color: "#50b9db", maxHeightMm: 15.24,
    minX: -29.85 - 46.94 + 5.09, maxX: -29.85 - 46.94 - 10.16 + 243.84,
    minY: -34.29 - 47.29, maxY: 3.7},
  {name: "cem-key", label: "CEM: 6.35 mm max", color: "#e6ac45", maxHeightMm: 6.35,
    minX: -44.5 - 10.3, maxX: -44.5, minY: -1.25, maxY: 1.25},
];

// Maximum assembled height above the PCB, not the footprint's planar height.
// 39301240: Molex 55690002-SD p.1, .38 inch housing plus .01 inch tolerance,
// rounded up to 10 mm. This covers the bare right-angle header, not its cable.
// Add reviewed maximum heights here as parts enter a CEM zone. CAD bounding
// boxes are not trusted: imported models and default boxes can omit tolerances.
export const pcieComponentHeightsMm: Readonly<Record<string, number>> = {
  "39301240": 10,
  // datasheets/CL10B104KB8NNNC.pdf p.1: 0.80 +/-0.10 mm thickness.
  // Allow another 0.10 mm for the solder joint above the board.
  "CL10B104KB8NNNC": 1,
  // datasheets/CL05B224KO5NNNC.pdf p.1: 0.50 +/-0.05 mm thickness.
  // Include 0.10 mm for the solder joint, rounded up to 0.7 mm assembled.
  "CL05B224KO5NNNC": 0.7,
};

const prefix = "pcie_mechanical_";
const corners = (r: Rect): Point[] => [
  {x: r.minX, y: r.minY}, {x: r.maxX, y: r.minY},
  {x: r.maxX, y: r.maxY}, {x: r.minX, y: r.maxY},
];
const area = (p: Point[]) => Math.abs(p.reduce((sum, a, i) => {
  const b = p[(i + 1) % p.length];
  return sum + a.x * b.y - b.x * a.y;
}, 0)) / 2;

// Clip convex zone polygons to the current rectangular board, or to component
// bounds. This also handles non-cardinal connector rotations without AABB zones.
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

export function getPcieMechanicalZones(json: AnyCircuitElement[]) {
  const source = json.find(e => e.type === "source_component" && e.name === "PCIe");
  if (source?.type !== "source_component") return undefined;
  if (source.manufacturer_part_number !== "X1618WVS-164-9TV30") {
    throw new Error("Review PCIe mechanical zones for the replacement connector");
  }
  const connector = json.find(e => e.type === "pcb_component" && e.source_component_id === source.source_component_id);
  const board = json.find(e => e.type === "pcb_board");
  if (connector?.type !== "pcb_component" || board?.type !== "pcb_board") return undefined;
  if (!board.width || !board.height || board.outline?.length) {
    throw new Error("Review PCIe zone clipping for a board with a custom outline");
  }
  if (connector.layer !== "top") throw new Error("Review PCIe zones before mounting the connector on the bottom side");
  const bounds = {minX: board.center.x - board.width / 2, maxX: board.center.x + board.width / 2,
    minY: board.center.y - board.height / 2, maxY: board.center.y + board.height / 2};
  const angle = connector.rotation * Math.PI / 180;
  const transform = (p: Point): Point => ({
    x: connector.center.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: connector.center.y + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  });
  const zones = pcieMechanicalZones.map(zone => ({...zone,
    polygon: clip(corners(zone).map(transform), bounds),
  })).filter(zone => area(zone.polygon) > 1e-6);
  return {connector, board, bounds, zones};
}

export type PcieMechanicalFinding = {
  rule: string; severity: "error" | "warning"; message: string; elementIds: string[];
};

export function checkPcieMechanicalZones(json: AnyCircuitElement[],
  heights: Readonly<Record<string, number>> = pcieComponentHeightsMm): PcieMechanicalFinding[] {
  const geometry = getPcieMechanicalZones(json);
  if (!geometry) return [];
  const {connector, zones} = geometry;
  const sources = new Map(json.filter(e => e.type === "source_component").map(e => [e.source_component_id, e]));
  const findings: PcieMechanicalFinding[] = [];
  for (const part of json.filter(e => e.type === "pcb_component")) {
    if (part.pcb_component_id === connector.pcb_component_id || part.layer !== connector.layer) continue;
    const ownGeometry = json.filter(e => (e.type.startsWith("pcb_courtyard_") || e.type === "pcb_component")
      && "pcb_component_id" in e && e.pcb_component_id === part.pcb_component_id)
      .map(e => e.type === "pcb_component" ? {...e, rotation: 0} : e);
    const bounds = getBoundsOfPcbElements(ownGeometry);
    const overlaps = zones.filter(zone => area(clip(zone.polygon, bounds)) > 1e-6);
    if (!overlaps.length) continue;
    const limit = Math.min(...overlaps.map(zone => zone.maxHeightMm));
    const source = sources.get(part.source_component_id);
    const height = heights[source?.manufacturer_part_number ?? ""];
    const rule = limit === 0 ? "pcie_component_keepout"
      : height === undefined ? "pcie_height_unreviewed" : "pcie_component_height";
    if (limit > 0 && height !== undefined && height <= limit) continue;
    findings.push({rule, severity: height === undefined && limit > 0 ? "warning" : "error",
      message: limit === 0 ? `${source?.name}: component overlaps the XKB PCIe assembly keepout.`
        : height === undefined ? `${source?.name}: review maximum assembled height in the ${limit} mm PCIe zone.`
        : `${source?.name}: ${height} mm maximum assembled height exceeds the ${limit} mm PCIe zone.`,
      elementIds: [part.pcb_component_id, connector.pcb_component_id]});
  }
  return findings;
}

// Called after group placement in both full renders and cached moves. Notes are
// board-owned so their dimensions never alter the connector's placement bounds.
// Mechanical rules do not create copper keepouts: routing, vias and pours remain
// available beneath the connector and within component-height restriction zones.
export function updatePcieMechanicalZones(json: AnyCircuitElement[]) {
  const geometry = getPcieMechanicalZones(json);
  if (!geometry) return;
  const {zones, bounds} = geometry;
  const generated: AnyCircuitElement[] = [];
  for (const [index, zone] of zones.entries()) {
    generated.push({type: "pcb_note_path", pcb_note_path_id: `${prefix}${zone.name}`,
      name: `${prefix}${zone.name}`, route: [...zone.polygon, zone.polygon[0]],
      layer: "top", stroke_width: 0.18, color: zone.color});
    generated.push({type: "pcb_note_text", pcb_note_text_id: `${prefix}${zone.name}_label`,
      name: `${prefix}${zone.name}_label`, text: zone.label,
      anchor_position: {x: bounds.minX + 16, y: bounds.maxY - 3 - index * 3},
      anchor_alignment: "top_left", font: "tscircuit2024", font_size: 1, layer: "top", color: zone.color});
  }
  for (const [index, finding] of checkPcieMechanicalZones(json).filter(f => f.severity === "error").entries()) {
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
