import type {AnyCircuitElement} from "circuit-json";
import {getBoundsOfPcbElements, repositionPcbComponentTo, transformPCBElements} from "@tscircuit/circuit-json-util";
import {updatePcieConnectorKeepout} from "./pcie-mechanical";
import componentRework from "../manufacturing/control-routing/component-rework.json";

export type PcbGroupPlacement = {
  pcbX: number;
  pcbY: number;
  pcbRotation?: number;
  pcbGrid?: boolean;
  pcbGridCols?: number;
  pcbGridGap?: number;
  offBoard?: boolean;
};

export type PcbPlacementGroups = {
  members: Record<string, string[]>;
  nativeGroupIds: Record<string, string>;
  looseOffsets: Record<string, {x: number; y: number}>;
};

// Align rendered component/courtyard bounds to the requested group anchors.
export function applyPcbGroupPlacements(
  json: AnyCircuitElement[],
  placements: Record<string, PcbGroupPlacement>,
  groups: PcbPlacementGroups,
) {
  const sources = new Map(json.filter(e => e.type === "source_component")
    .map(e => [e.name, e.source_component_id]));
  const parts = new Map(json.filter(e => e.type === "pcb_component")
    .map(e => [e.source_component_id, e]));
  const ownParts = (name: string) => (groups.members[name] ?? []).map(ref => {
    const part = parts.get(sources.get(ref)!);
    if (!part) throw new Error(`No rendered PCB component for ${ref}`);
    return part;
  });
  const childNames = (name: string) => Object.keys(placements)
    .filter(key => key.slice(0, key.lastIndexOf("/")) === name);
  const allParts = (name: string): ReturnType<typeof ownParts> => [
    ...ownParts(name), ...childNames(name).flatMap(allParts),
  ];
  const bounds = (items: ReturnType<typeof ownParts>) => {
    const ids = new Set(items.map(p => p.pcb_component_id));
    // pcb_component width/height already describe the rotated, world-axis bounds.
    return getBoundsOfPcbElements(json.filter(e =>
      (e.type === "pcb_component" || e.type.startsWith("pcb_courtyard_"))
      && "pcb_component_id" in e && ids.has(e.pcb_component_id as string),
    ).map(e => e.type === "pcb_component" ? {...e, rotation: 0} : e));
  };
  const move = (items: ReturnType<typeof ownParts>, dx: number, dy: number) => {
    for (const part of items) {
      repositionPcbComponentTo(json, part.pcb_component_id, {
        x: part.center.x + dx, y: part.center.y + dy,
      });
      // The installed transform utility does not yet move filled silkscreen.
      for (const graphic of json) {
        if (graphic.type !== "pcb_silkscreen_graphic" || graphic.pcb_component_id !== part.pcb_component_id) continue;
        for (const ring of [graphic.brep_shape.outer_ring, ...graphic.brep_shape.inner_rings]) {
          ring.vertices = ring.vertices.map(p => ({...p, x: p.x + dx, y: p.y + dy}));
        }
      }
      // The installed utility does not yet transform component-owned cutouts.
      for (const cutout of json.filter(e => e.type === "pcb_cutout" && e.pcb_component_id === part.pcb_component_id)) {
        if (cutout.type !== "pcb_cutout") continue;
        if (cutout.shape === "polygon") {
          cutout.points = cutout.points.map(p => ({x: p.x + dx, y: p.y + dy}));
        } else if (cutout.shape === "rect" || cutout.shape === "circle") {
          cutout.center = {x: cutout.center.x + dx, y: cutout.center.y + dy};
        }
      }
    }
  };
  const align = (name: string, x: number, y: number, rotation = 0) => {
    const direct = ownParts(name);
    if (direct.length) {
      const b = bounds(direct);
      move(direct, x - b.minX, y - b.minY);
    }
    const angle = rotation * Math.PI / 180;
    for (const child of childNames(name)) {
      const p = placements[child];
      align(child, x + p.pcbX * Math.cos(angle) - p.pcbY * Math.sin(angle),
        y + p.pcbX * Math.sin(angle) + p.pcbY * Math.cos(angle),
        rotation + (p.pcbRotation ?? 0));
    }
    const items = allParts(name);
    if (!items.length) throw new Error(`No PCB parts in placement group ${name}`);
    const b = bounds(items);
    move(items, x - b.minX, y - b.minY);
  };
  for (const name of Object.keys(placements).filter(key => !key.includes("/"))) {
    const p = placements[name];
    align(name, p.pcbX, p.pcbY, p.pcbRotation ?? 0);
    for (const ref of groups.members[name] ?? []) {
      const offset = groups.looseOffsets[ref];
      const part = parts.get(sources.get(ref)!);
      if (offset && part) {
        part.display_offset_x = `${p.pcbX + offset.x}mm`;
        part.display_offset_y = `${p.pcbY + offset.y}mm`;
      }
    }
  }
  // Apply explicit, user-authorized individual moves after group alignment.
  // Moving a support part must not recenter every member of its old group.
  for (const change of componentRework.changes) {
    const part = parts.get(sources.get(change.name)!);
    if (!componentRework.authorized || !part || change.after.layer !== "top" || part.layer !== "top")
      throw new Error(`Invalid top-side component move: ${change.name}`);
    const delta = ((part.rotation - change.after.rotation) % 360 + 360) % 360;
    if (Math.min(delta, 360-delta) > 1e-6)
      throw new Error(`Set the recorded rotation in the component source: ${change.name}`);
    move([part], change.after.center.x - part.center.x, change.after.center.y - part.center.y);
  }
  for (const [name, id] of Object.entries(groups.nativeGroupIds)) {
    const group = json.find(e => e.type === "pcb_group" && e.pcb_group_id === id);
    if (!group) throw new Error(`No rendered PCB group for ${name}`);
    const b = bounds(allParts(name));
    const center = {x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2};
    if (group.type !== "pcb_group") continue;
    transformPCBElements(json.filter(e => e.type !== "pcb_group" && !e.type.endsWith("_error") && !e.type.endsWith("_warning")
      && "pcb_group_id" in e && e.pcb_group_id === id && !("pcb_component_id" in e)), {
      a: 1, b: 0, c: 0, d: 1, e: center.x - group.center.x, f: center.y - group.center.y,
    });
    Object.assign(group, {
      center,
      width: b.maxX - b.minX, height: b.maxY - b.minY,
      anchor_position: {x: b.minX, y: b.minY}, anchor_alignment: "bottom_left",
      display_offset_x: `${placements[name].pcbX}mm`,
      display_offset_y: `${placements[name].pcbY}mm`,
    });
  }
  updatePcieConnectorKeepout(json);
}
