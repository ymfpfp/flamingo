// Nominal centers use the board's top-view frame. Origins normalize each local
// pattern; pcbGroupPlacements sets its final bottom-left anchor independently.
// Assembly is top-only. Keep the left PCIe surface corridors free of bypass pads.
type Placement = {pcbX: number; pcbY: number; pcbRotation?: number; layer: "top"};
const origins: Record<string, {x: number; y: number}> = {
  VCCH: {x: 34.045, y: 83.575},
  VCCA33: {x: 35.83435, y: 93.645},
  VCCL: {x: 23.545, y: 103.78},
  VDD: {x: 20.445, y: 81.375},
};
const layouts: Record<string, Placement> = {};
const place = (rail: string, name: string, x: number, y: number, pcbRotation = 180) => {
  layouts[name] = {pcbX: x - origins[rail].x, pcbY: y - origins[rail].y, pcbRotation, layer: "top"};
};
const row = (rail: string, refs: readonly number[], xs: readonly number[], y: number, rotation = 180) => {
  refs.forEach((ref, index) => place(rail, `C_${rail}_${ref}`, xs[index], y, rotation));
};

// VCCH is concentrated at the lower/right power balls after bridge rotation.
// Keep the 220 nF rows nearest the supply region, clear of the SPI flash.
row("VCCH", [3, 11], [36.8, 39], 89, 0);
row("VCCH", [16, 19], [36.8, 39], 90.3, 0);
row("VCCH", [23, 27], [36.8, 39], 91.6, 0);
row("VCCH", [31], [36.8], 92.9, 0);
row("VCCH", [35], [39], 92.7, 0);
place("VCCH", "C_VCCH_6", 41, 88.8, 270);
place("VCCH", "C_VCCH_14", 36, 84.5, 0);

// Fast 220 nF bypasses sit immediately below the bridge. Larger bypasses and
// bulk capacitors occupy clear top-side pockets outside the PCIe corridors.
row("VDD", [26, 30, 34, 39], [31.3, 32.4, 33.5, 34.6], 90.45, 90);
row("VDD", [1, 9, 15, 22, 24, 28], [22.4, 24.6, 26.8, 29, 31.2, 33.4], 110.3);
row("VDD", [32, 36, 40, 42, 44], [22.4, 24.6, 26.8, 29, 31.2], 111.6);
place("VDD", "C_VDD_4", 33, 82.3);
place("VDD", "C_VDD_12", 22.4, 105.3);
place("VDD", "C_VDD_18", 37.5, 86.7);

// VCCL spans the L/N/P/T/U regions. Distribute its small capacitors across
// the upper-left, upper, and right edges instead of using one distant bank.
row("VCCL", [2, 10, 17], [25.3, 27.5, 29.7], 106.7);
row("VCCL", [25, 29, 33], [25.3, 27.5, 29.5], 104.5);
row("VCCL", [37, 41], [31.35, 34.65], 104.3);
row("VCCL", [43, 45], [28.6, 30.8], 105.6);
place("VCCL", "C_VCCL_46", 36.5, 104.3, 0);
row("VCCL", [5, 13], [25.5, 30], 108.5);
place("VCCL", "C_VCCL_20", 38.9, 111);

// Keep the feed and fast bypass beside H5. The bulk capacitor sits below the
// USB lane bank so its courtyard and pads leave the RX1 escape corridor clear.
place("VCCA33", "R_VCCA33_4", 36.8, 93.95, 0);
place("VCCA33", "C_VCCA33_8", 36.8, 95, 0);
place("VCCA33", "C_VCCA33_7", 43, 90.5, 270);

export function bridgeDecouplingPlacement(name: string) {
  const placement = layouts[name];
  if (!placement) throw new Error(`Missing bridge decoupling placement for ${name}`);
  return {...placement,
    pcbStyle: {silkscreenTextVisibility: "hidden" as const}};
}
