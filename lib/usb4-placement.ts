// Nominal centers use the board's top-view frame; the USB4_LANES map entry
// anchors the resulting footprint bounds. Components stay on the top side.
// Preserve bridge lane order vertically. The far connector row uses short
// bottom-layer escapes with GND on L5; the rest of the active routes use L1.
export const usb4PairPlacements = {
  RX1: {centerY: 94.05, capacitorCenterY: 94, positiveOnTop: false},
  TX1: {centerY: 96.69, capacitorCenterY: 96.994821, positiveOnTop: false},
  TX2: {centerY: 100.38, capacitorCenterY: 100.74475, positiveOnTop: true},
  RX2: {centerY: 103.8, capacitorCenterY: 103.8, positiveOnTop: true},
} as const;

const origin = {x: 40.2, y: 92.7653302};
type Role = "capacitor" | "clamp" | "discharge";

export function usb4Placement(signal: string, role: Role) {
  const pairName = signal.slice(0, -2) as keyof typeof usb4PairPlacements;
  const pair = usb4PairPlacements[pairName];
  if (!pair) throw new Error(`Missing USB4 pair placement for ${signal}`);
  const upper = signal.endsWith("_P") === pair.positiveOnTop;
  const sign = upper ? 1 : -1;
  // Main signal paths run through the shunt signal pads at +/-0.55 mm.
  // Shunt grounds point outward; capacitor pin 1 faces the connector.
  // Keep 1.10 mm P/N pitch to clear the existing assembly courtyards.
  // TX capacitor/resistor centers align with their connector pair centers;
  // RX1 stays below TX1 and reaches the far row through a paired bottom path.
  const centerY = role === "clamp" ? pair.centerY : pair.capacitorCenterY;
  const x = role === "clamp" ? 40.6 : role === "capacitor" ? pairName === "TX2" ? 41.8 : pairName === "RX1" ? 42 : 42.1
    : pairName === "TX2" ? 43 : pairName === "RX1" ? 43.2 : 43.5;
  const offset = role === "capacitor" ? 0 : role === "clamp" ? 0.200025 : 0.241554;
  return {
    pcbX: x - origin.x,
    pcbY: centerY + sign * (0.55 + offset) - origin.y,
    pcbRotation: role === "capacitor" ? 180 : upper ? 90 : 270,
    layer: "top" as const,
    pcbStyle: {silkscreenTextVisibility: "hidden" as const},
  };
}
