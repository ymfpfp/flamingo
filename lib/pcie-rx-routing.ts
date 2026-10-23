import type {FanoutTracePath} from "@tscircuit/props";
import {offsetPairCenterline, pcieTxViaRules} from "./pcie-tx-routing";
import stackup from "../manufacturing/stackup/selected.json";
import {traceWidthsMm} from "./trace-width-rules";

type Point = {x: number; y: number};
const width = traceWidthsMm.surfaceDifferential85, gap = stackup.impedanceProfiles[0].calculatedPairGapMm;
const hp = (width + gap) / 2, k = Math.SQRT2 - 1, q = 2 - Math.SQRT2;
export const pcieRxNeckWidth = 0.0762;
export const pcieRxContacts = [
  {lane: 0, positive: "N21", negative: "N20", slot: ["A16", "A17"]},
  {lane: 1, positive: "W21", negative: "W20", slot: ["A21", "A22"]},
  {lane: 2, positive: "Y19", negative: "AA19", slot: ["A25", "A26"]},
  {lane: 3, positive: "AA13", negative: "Y13", slot: ["A29", "A30"]},
] as const;
export const pcieRxReturns = [
  {x: 15.6, y: 97.2}, {x: 15.95, y: 95.6},
  {x: 19.88, y: 100.0, diameter: 0.25, hole: 0.15}, {x: 18.85, y: 101.55, retired: true}, {x: 19.5, y: 103.0},
] as const;
export const pcieRxBgaReturns = [{x: 24.9, y: 100.6200074}] as const;

const wire = (p: Point, layer: "top" | "bottom" = "top", w = width) =>
  ({route_type: "wire" as const, ...p, width: w, layer});
const via = (p: Point, from: "top" | "bottom", bga: boolean) => ({route_type: "via" as const,
  ...p, from_layer: from, to_layer: from === "top" ? "bottom" as const : "top" as const,
  via_diameter: bga ? pcieTxViaRules.bgaDiameter : pcieTxViaRules.diameter,
  via_hole_diameter: bga ? pcieTxViaRules.bgaHole : pcieTxViaRules.hole});

// Fixed native saved paths. Offset trunks retain the nominal surface geometry;
// the pad flares and BGA necks are short launch discontinuities.
export function createPcieRxRoutes(position: (selector: string) => Point): FanoutTracePath[] {
  return pcieRxContacts.flatMap(({lane, positive, negative}) => {
    const balls = [positive, negative], b = balls.map(ball => position(`ASM2464PDX.${ball}`));
    const ends = ["P", "N"].map(p => position(`PCIe.RX${lane}_${p}`));
    const cy = (ends[0].y + ends[1].y) / 2;
    const flareX = ends[0].x + 1.2 + 0.5 - hp;
    let top: Point[][], bottomCenter: Point[] = [], topCenter: Point[], returnX = 0, returnY = 0;
    if (lane === 0) {
      const a = 8 * hp * k / Math.SQRT2;
      top = [[b[0], {x: b[0].x - a, y: b[0].y}], [b[1]]];
      returnX = 16.35; returnY = 96.8;
      bottomCenter = [{x: 25.13, y: 97.8}, {x: 25.13, y: 97.2},
        {x: 24.73, y: 96.8}, {x: returnX + 0.3 - hp, y: returnY}];
      topCenter = [{x: returnX - 0.3 + hp, y: returnY}, {x: 15.95, y: returnY},
        {x: 15.8, y: 96.65}, {x: 15.8, y: cy + 0.15},
        {x: 15.65, y: cy}, {x: flareX, y: cy}];
    } else if (lane === 1) {
      const t = 0.22, h = (0.46 + q * 0.1 + 2 * k * t) / Math.SQRT2;
      top = [[b[0], {x: 24.5, y: b[0].y}, {x: 24.4, y: b[0].y + 0.1},
        {x: 24.4, y: b[0].y + h}], [b[1]]];
      returnX = 19.5; returnY = 100.6;
      bottomCenter = [{x: 23.5, y: b[0].y + t}, {x: 20.35, y: b[0].y + t},
        {x: 20.05, y: b[0].y + t - 0.3}, {x: 20.05, y: returnY + 0.3},
        {x: 19.75, y: returnY}, {x: returnX + 0.3 - hp, y: returnY}];
      topCenter = [{x: returnX - 0.3 + hp, y: returnY}, {x: 19, y: returnY},
        {x: 18.7, y: returnY - 0.3}, {x: 18.7, y: cy + 0.3}, {x: 18.4, y: cy}, {x: flareX, y: cy}];
    } else if (lane === 2) {
      const h = (16 * hp * k - k * (0.46 - 2 * hp)) / Math.SQRT2;
      top = [[b[0], {x: b[0].x, y: b[0].y - h}], [b[1]]];
      returnX = 20.3; returnY = 103;
      bottomCenter = [{x: 23.9, y: returnY}, {x: returnX + 0.3 - hp, y: returnY}];
      topCenter = [{x: returnX + 0.3 - hp, y: returnY}, {x: 20.6, y: returnY},
        {x: 21, y: returnY - 0.4}, {x: 21, y: cy + 0.3},
        {x: 20.7, y: cy}, {x: flareX, y: cy}];
    } else {
      const a = (0.46 + k * (0.23 + 0.0065) - 8 * hp * k) / (2 * k);
      top = [[b[0], {x: b[0].x + a, y: b[0].y + a},
        {x: b[0].x + a, y: b[0].y + a + 0.1},
        {x: b[0].x, y: b[0].y + 2 * a + 0.1}, {x: b[0].x, y: 102.6065074}],
      [b[1], {x: 28.35, y: b[1].y + 0.23}, {x: 28.35, y: 102.6},
        {x: 28.3565, y: 102.6065}]];
      topCenter = [{x: 28.46825, y: 102.7}, {x: 28.46825, y: 103.0},
        {x: 28.26825, y: 103.2}, {x: 23.35, y: 103.2}, {x: 23.05, y: 102.9},
        {x: 23.05, y: 83}, {x: 22.75, y: 82.7}, {x: 17, y: 82.7},
        {x: 17 - (cy - 82.7), y: cy}, {x: flareX, y: cy}];
    }
    const tp = [-hp, hp].map(d => offsetPairCenterline(topCenter, d));
    const bp = [-hp, hp].map(d => offsetPairCenterline(bottomCenter, lane === 2 ? -d : d));
    return [0, 1].map(i => {
      const endFlare = [{x: ends[i].x + 1.2, y: ends[i].y}, ends[i]];
      let route: FanoutTracePath["route"];
      if (lane === 3) {
        // Keep equal narrow arclengths without widening beside the BGA pads.
        const matchedNeckLength = top[0].slice(1).reduce((length, p, j) =>
          length + Math.hypot(p.x - top[0][j].x, p.y - top[0][j].y), 0);
        const nDogboneLength = Math.hypot(top[1][1].x - top[1][0].x, top[1][1].y - top[1][0].y);
        const launch = i === 0
          ? [...top[i].slice(0, -1).map(p => wire(p, "top", pcieRxNeckWidth)), wire(top[i][top[i].length - 1])]
          : [wire(top[i][0], "top", pcieRxNeckWidth), wire(top[i][1], "top", pcieRxNeckWidth),
            wire({x: top[i][1].x, y: top[i][1].y + matchedNeckLength - nDogboneLength}),
            ...top[i].slice(2).map(p => wire(p))];
        route = [...launch, ...tp[i].map(p => wire(p)), ...endFlare.map(p => wire(p))];
      } else {
        const bv = top[i][top[i].length - 1], start = bp[i][0];
        const launch = lane === 0 ? [{x: start.x, y: bv.y - Math.abs(start.x - bv.x)}, start]
          : [{x: bv.x - Math.abs(start.y - bv.y), y: start.y}, start];
        const sign = (i === 0 ? 1 : -1) * (lane === 2 ? -1 : 1);
        const rv = {x: returnX, y: returnY + sign * 0.3};
        route = [...top[i].map(p => wire(p)), via(bv, "top", true), wire(bv, "bottom"),
          ...launch.map(p => wire(p, "bottom")), ...bp[i].slice(1).map(p => wire(p, "bottom")),
          wire(rv, "bottom"), via(rv, "bottom", false), wire(rv),
          ...tp[i].map(p => wire(p)), ...endFlare.map(p => wire(p))];
      }
      return {connection: `ASM2464PDX.${balls[i]}`, route};
    });
  });
}
