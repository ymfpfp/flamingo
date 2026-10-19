// Nominal centers use the board's top-view frame. Origins normalize each local
// pattern; pcbGroupPlacements sets its final bottom-left anchor independently.
// All parts share the bridge's top side and stay outside its courtyard.
type Placement = {pcbX: number; pcbY: number; pcbRotation?: number};
const origins: Record<string, {x: number; y: number}> = {
  VCCH: {x: 34.045, y: 83.575},
  VCCA33: {x: 35.83435, y: 93.645},
  VCCL: {x: 21.0799, y: 97.98},
  VDD: {x: 16.6799, y: 83.175},
};
const layouts: Record<string, Placement> = {};
const place = (rail: string, name: string, x: number, y: number, pcbRotation = 180) => {
  layouts[name] = {pcbX: x - origins[rail].x, pcbY: y - origins[rail].y, pcbRotation};
};
const row = (rail: string, refs: readonly number[], xs: readonly number[], y: number, rotation = 180) => {
  refs.forEach((ref, index) => place(rail, `C_${rail}_${ref}`, xs[index], y, rotation));
};
const column = (rail: string, refs: readonly number[], x: number, ys: readonly number[], rotation = 180) => {
  refs.forEach((ref, index) => place(rail, `C_${rail}_${ref}`, x, ys[index], rotation));
};

// VCCH is concentrated at the lower/right power balls after bridge rotation.
// Keep the 220 nF rows nearest the supply region, clear of the SPI flash.
row("VCCH", [3, 11], [36.8, 39], 89, 0);
row("VCCH", [16, 19], [36.8, 39], 90.3, 0);
row("VCCH", [23, 27], [36.8, 39], 91.6, 0);
row("VCCH", [31, 35], [36.8, 39], 92.9, 0);
place("VCCH", "C_VCCH_6", 41, 88.8, 270);
place("VCCH", "C_VCCH_14", 36, 84.5, 0);

const innerLeftColumnX = 22;

// VDD follows the left edge and lower-left corner. The 220 nF parts sit
// beside the J/K-side VDD balls; the larger capacitors occupy the outer row.
column("VDD", [1, 9, 15, 26, 30], innerLeftColumnX, [92, 93.3, 94.6, 95.9, 97.2]);
column("VDD", [28, 32, 36, 34, 39], 19.8, [92, 93.3, 94.6, 95.9, 97.2]);
column("VDD", [22, 24, 40, 42, 44], 17.6, [92, 93.3, 94.6, 95.9, 97.2]);
column("VDD", [4, 12, 18], 19.8, [84.1, 86.5, 88.9]);

// VCCL spans the L/N/P/T/U regions. Distribute its small capacitors across
// the upper-left, upper, and right edges instead of using one distant bank.
column("VCCL", [2, 10, 17], innerLeftColumnX, [98.5, 99.8, 101.1]);
row("VCCL", [25, 29, 33, 37, 41], [25.3, 27.5, 29.7, 31.9, 34.1], 104.3);
row("VCCL", [43, 45], [28.6, 30.8], 105.6);
place("VCCL", "C_VCCL_46", 36.3, 104.3, 0);
row("VCCL", [5, 13, 20], [25.5, 30, 34.5], 108.5);

// Keep the analog feed and both capacitors together, beside H5 on the right.
place("VCCA33", "R_VCCA33_4", 36.8, 97.45, 0);
place("VCCA33", "C_VCCA33_8", 36.8, 96.1, 0);
place("VCCA33", "C_VCCA33_7", 38.8, 95.6, 270);

export function bridgeDecouplingPlacement(name: string) {
  const placement = layouts[name];
  if (!placement) throw new Error(`Missing bridge decoupling placement for ${name}`);
  return {...placement, layer: "top" as const,
    pcbStyle: {silkscreenTextVisibility: "hidden" as const}};
}
