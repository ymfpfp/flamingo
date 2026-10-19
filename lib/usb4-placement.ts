// Nominal centers use the board's top-view frame; the USB4_LANES map entry
// anchors the resulting footprint bounds. Components stay on the top side.
// Preserve bridge lane order vertically. The connector's inner pad row still
// needs a layer-transition plan when the differential pairs are routed.
export const usb4PairPlacements = {
  RX1: {centerY: 94.2, positiveOnTop: false},
  TX1: {centerY: 97.4, positiveOnTop: false},
  TX2: {centerY: 100.6, positiveOnTop: true},
  RX2: {centerY: 103.8, positiveOnTop: true},
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
  const x = role === "capacitor" ? 42 : role === "clamp" ? 40.6 : 43.5;
  const offset = role === "capacitor" ? 0 : role === "clamp" ? 0.200025 : 0.241554;
  return {
    pcbX: x - origin.x,
    pcbY: pair.centerY + sign * (0.55 + offset) - origin.y,
    pcbRotation: role === "capacitor" ? 180 : upper ? 90 : 270,
    layer: "top" as const,
    pcbStyle: {silkscreenTextVisibility: "hidden" as const},
  };
}
