// Nominal centers in the board's top-view frame. The root group anchor uses
// footprint/courtyard bounds, just like the bridge and USB4 placement maps.
// Stack the two local gate-control groups in the open center, between ATX and
// the buck converters. Leave the slot output capacitors at the connector.
// Both switches drain toward the slot (-X); sources and gate networks face +X.
const origin = {x: 18.4995, y: 39.46745};
const placements: Record<string, {x: number; y: number; rotation: number}> = {
  Q_SLOT_12V: {x: 25.5, y: 52, rotation: 90},
  C_SLOT_GATE_12V: {x: 31.2, y: 53.5, rotation: 90},
  R_SLOT_OFF_12V: {x: 31.6, y: 57.1, rotation: 0},
  R_SLOT_GATE_12V: {x: 29, y: 57.1, rotation: 0},
  Q_SLOT_DRV_12V: {x: 25.5, y: 56.7, rotation: 180},
  R_SLOT_DISCHARGE_12V: {x: 19.6, y: 53.4, rotation: 90},
  Q_SLOT_3V3: {x: 25.5, y: 41.8, rotation: 90},
  C_SLOT_GATE_3V3: {x: 31.2, y: 43.3, rotation: 90},
  R_SLOT_OFF_3V3: {x: 31.2, y: 47.5, rotation: 180},
  R_SLOT_GATE_3V3: {x: 28.7, y: 45.1, rotation: 270},
  Q_SLOT_DRV_3V3: {x: 25.5, y: 46, rotation: 180},
  R_SLOT_DISCHARGE_3V3: {x: 19.6, y: 41.8, rotation: 90},
  // Above the buck-enable divider after the root group's 180-degree rotation.
  R_HDDPC_PD: {x: 22.1, y: 43.2, rotation: 270},
};

export function slotPowerPlacement(name: string) {
  const p = placements[name];
  if (!p) throw new Error(`Missing slot power placement for ${name}`);
  return {
    pcbX: p.x - origin.x,
    pcbY: p.y - origin.y,
    pcbRotation: p.rotation,
    layer: "top" as const,
    pcbStyle: {silkscreenTextVisibility: "hidden" as const},
  };
}
