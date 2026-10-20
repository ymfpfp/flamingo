import type {FanoutTracePath} from "@tscircuit/props";
import {traceWidthsMm} from "./trace-width-rules";
import stackup from "../manufacturing/stackup/JLC06161H-3313.json";

type Point = {x: number; y: number};
type Route = FanoutTracePath["route"];
const width = traceWidthsMm.surfaceDifferential85;
const halfPitch = (width + stackup.impedanceProfiles[0].calculatedPairGapMm) / 2;

export const pcieTxContacts = [
  {lane: 0, positive: "R20", negative: "R21"},
  {lane: 1, positive: "U20", negative: "U21"},
  {lane: 2, positive: "Y17", negative: "AA17"},
  {lane: 3, positive: "Y15", negative: "AA15"},
] as const;

export const pcieTxViaRules = {diameter: 0.3, hole: 0.2,
  bgaDiameter: 0.25, bgaHole: 0.15, maxCount: 2} as const;

// Full-stack GND vias join L2 and L5 beside both signal transitions.
export const pcieTxBridgeReturns = [
  {x: 24.3, y: 100}, {x: 24.3, y: 97.95}, {x: 24.25, y: 100.8},
  {x: 25.8, y: 98.65}, {x: 26.35, y: 98.95},
  {x: 29.3, y: 102.8},
] as const;
// V9, Y18 and AA16 are GNDA, connected to GND. The filled/capped BGA
// process also applies to these returns and the R20/U21/AA17/AA15 signals.
export const pcieTxBgaReturns = [{x: 30.1, y: 100.5700074},
  {x: 26.28, y: 101.5400074}, {x: 27.2, y: 102.0000074}] as const;
export const pcieTxCapReturns = [98.3608, 93.3608, 89.3608, 85.3608]
  .map(y => ({x: 1.05, y}));

// Authored bottom-layer corridors, not a path-search algorithm. L5 is GND.
// The first two southbound corridors have 1.2 mm pitch. TX3 starts farther
// east to keep its top escape and bottom launch clear of TX2's copper.
export function offsetPairCenterline(points: Point[], distance: number): Point[] {
  const normals = points.slice(1).map((p, i) => {
    const dx = p.x - points[i].x, dy = p.y - points[i].y, length = Math.hypot(dx, dy);
    return {x: -dy / length, y: dx / length};
  });
  return points.map((p, i) => {
    const a = normals[Math.max(0, i - 1)], b = normals[Math.min(i, normals.length - 1)];
    const scale = distance / (1 + a.x * b.x + a.y * b.y);
    return {x: p.x + (a.x + b.x) * scale, y: p.y + (a.y + b.y) * scale};
  });
}
const wire = (point: Point, layer: "top" | "bottom" = "bottom") =>
  ({route_type: "wire" as const, ...point, width, layer});
const via = (point: Point, from: "top" | "bottom", to: "top" | "bottom", bga = false) =>
  ({route_type: "via" as const, ...point, from_layer: from, to_layer: to,
    via_diameter: bga ? pcieTxViaRules.bgaDiameter : pcieTxViaRules.diameter,
    via_hole_diameter: bga ? pcieTxViaRules.bgaHole : pcieTxViaRules.hole});

// Four 45-degree turns from east to south to west shorten P relative to N.
// Balance this drawn length in the necessary two-layer BGA escapes. The
// complete trunk remains a constant-offset pair, with no individual trombones.
const k = Math.SQRT2 - 1, chamferSaving = 2 - Math.SQRT2;
const bendSkew = 16 * halfPitch * k;

export function pcieTxCenterline(lane: number, ballY: number, capCenter: number): Point[] {
  if (lane === 0) return [{x: 23.5, y: ballY}, {x: 22.9, y: ballY},
    {x: 22.9 - (ballY - capCenter), y: capCenter}, {x: 2.1, y: capCenter}];
  const x = [0, 27.7, 28.9, 32.4][lane];
  const y = [0, ballY + 0.3, 101.48, 102.8][lane];
  const startX = [0, 27.1, 27.15, 31.8][lane], turnY = [0, 95, 90.1, 86.7][lane];
  return [{x: startX, y}, {x: x - 0.3, y}, {x, y: y - 0.3},
    {x, y: turnY}, {x: x - (turnY - capCenter), y: capCenter}, {x: 2.1, y: capCenter}];
}

export function createPcieTxRoutes(position: (selector: string) => Point): FanoutTracePath[] {
  const paths: FanoutTracePath[] = [];
  for (const {lane, positive, negative} of pcieTxContacts) {
    const balls = [positive, negative];
    const caps = ["P", "N"].map(p => position(`C_TX${lane}_${p}.pin1`));
    const capCenter = (caps[0].y + caps[1].y) / 2;
    const b = balls.map(ball => position(`ASM2464PDX.${ball}`));
    const capVias = caps.map((_, i) => ({x: 1.65, y: capCenter + (i === 0 ? 0.3 : -0.3)}));
    const centerline = pcieTxCenterline(lane, b[0].y, capCenter);
    let paired = [offsetPairCenterline(centerline, -halfPitch), offsetPairCenterline(centerline, halfPitch)];
    let topLaunches: Point[][];
    if (lane === 0) {
      const h = (Math.abs(b[0].x - b[1].x) + 2 * halfPitch * k + 0.1 * chamferSaving) / Math.SQRT2;
      topLaunches = [[b[0]], [b[1], {x: 24.5, y: b[1].y},
        {x: 24.4, y: b[1].y - 0.1}, {x: 24.4, y: b[1].y - h}]];
    } else if (lane === 1) {
      const a = 0.39;
      const h = (Math.abs(b[0].x - b[1].x) + chamferSaving * a + 2 * k * halfPitch + bendSkew) / Math.SQRT2;
      topLaunches = [[b[0], {x: b[0].x + a, y: b[0].y - a},
        {x: b[0].x + a, y: b[0].y - h}], [b[1]]];
    } else if (lane === 2) {
      const t = centerline[0].y - b[0].y;
      const a = 0.14;
      const h = (k * (Math.abs(b[1].y - b[0].y) - 2 * t) + bendSkew) / Math.SQRT2 - a;
      topLaunches = [[b[0], {x: b[0].x - a, y: b[0].y - a},
        {x: b[0].x - a, y: b[0].y - h}], [b[1]]];
    } else {
      const firstDrop = 0.3, viaX = 30.1;
      const h = b[0].y - 101.0400074;
      // AA15's filled/capped land via frees the top-side RX3 escape. Begin
      // coupling on the NE run, within 3 mm of either bottom-layer launch.
      const viaY = b[0].y - h, startX = 30.575;
      const startY = viaY + startX - viaX + Math.SQRT2 * halfPitch;
      paired = [-halfPitch, halfPitch].map(d => offsetPairCenterline([
        {x: startX, y: startY}, {x: startX + 102.8 - startY, y: 102.8},
        ...centerline.slice(1),
      ], d));
      const leadP = 0.06 + Math.SQRT2 * firstDrop + viaX - (b[0].x + 0.06 + firstDrop)
        + b[0].y - firstDrop - viaY + Math.SQRT2 * (paired[0][0].x - viaX);
      const leadN = paired[1][0].x - b[1].x + k * (b[1].y - paired[1][0].y);
      // A short land-clearance dogleg balances the five 45-degree trunk turns.
      const a = (20 * halfPitch * k - (leadP - leadN)) / (2 * k);
      topLaunches = [[b[0], {x: b[0].x + 0.06, y: b[0].y},
        {x: b[0].x + 0.06 + firstDrop, y: b[0].y - firstDrop},
        {x: 28.1, y: b[0].y - firstDrop},
        {x: 28.1 + a, y: b[0].y - firstDrop - a},
        {x: 28.2 + a, y: b[0].y - firstDrop - a},
        {x: 28.2 + 2 * a, y: b[0].y - firstDrop},
        {x: viaX, y: b[0].y - firstDrop}, {x: viaX, y: b[0].y - h}],
      [b[1]]];
    }
    const bridgeVias = topLaunches.map(points => points[points.length - 1]);
    const launches = bridgeVias.map((v, i) => {
      const start = paired[i][0], dy = Math.abs(start.y - v.y);
      if (lane === 3) return i === 0 ? [v, start]
        : [v, {x: start.x - dy, y: v.y}, start];
      return [v, {x: v.x + (lane === 0 ? -dy : dy), y: start.y}, start];
    });
    const assemble = (i: number): Route => {
      const sign = i === 0 ? 1 : -1;
      return [...topLaunches[i].map(p => wire(p, "top")), via(bridgeVias[i], "top", "bottom", true),
        ...launches[i].map(p => wire(p)), ...paired[i].slice(1).map(p => wire(p)),
        wire({x: capVias[i].x + 0.3 - halfPitch, y: capCenter + sign * halfPitch}),
        wire(capVias[i]), via(capVias[i], "bottom", "top"), wire(capVias[i], "top"),
        wire({x: capVias[i].x + Math.abs(caps[i].y - capVias[i].y), y: caps[i].y}, "top"),
        wire(caps[i], "top")];
    };
    for (const i of [0, 1]) paths.push({
      connection: `ASM2464PDX.${balls[i]}`, route: assemble(i),
    });
  }
  return paths;
}
