import type {FanoutTracePath} from "@tscircuit/props";
import {traceWidthsMm} from "./trace-width-rules";
import stackup from "../manufacturing/stackup/selected.json";

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
export const pcieTx2BottomLeadDrop = 0.15;

// Full-stack GND vias join L2 and L5 beside both signal transitions.
export const pcieTxBridgeReturns = [
  {x: 24.3, y: 100}, {x: 24.3, y: 97.95}, {x: 24.25, y: 100.8},
  {x: 25.8, y: 98.55}, {x: 26.35, y: 98.95},
  {x: 29.3, y: 102.8},
] as const;
// V9, Y18 and AA16 are GNDA, connected to GND. The filled/capped BGA
// process also applies to these returns and the R20/U21/AA17/Y15/AA15 signals.
export const pcieTxBgaReturns = [{x: 30.1, y: 100.5700074},
  {x: 26.28, y: 101.5400074}, {x: 27.2, y: 102.0000074}] as const;
export const pcieTxCapReturns = [98.3608, 93.3608, 89.3608, 85.3608]
  .map(y => ({x: 1.05, y}));

// Authored bottom-layer corridors, not a path-search algorithm. L5 is GND.
// The first two southbound corridors have 1.2 mm pitch. TX3's southbound
// corridor stays farther east; coordinated local launches clear TX2's copper.
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
  const y = [0, 100.0, 101.48, 102.8][lane];
  const startX = [0, 27.1, 27.15, 31.8][lane], turnY = [0, 95, 90.1, 86.7][lane];
  if (lane === 2) {
    // Descend before passing below TX3's Y15 land via. Keep the original
    // southbound corridor and all routing beyond the BGA launch region.
    const sum = 26.74 + ballY + 0.46 - pcieTx2BottomLeadDrop - Math.SQRT2 * halfPitch;
    const launchY = 100.82;
    return [{x: startX, y: sum - startX}, {x: sum - launchY, y: launchY},
      {x: x - 0.3, y: launchY}, {x, y: launchY - 0.3}, {x, y: turnY},
      {x: x - (turnY - capCenter), y: capCenter}, {x: 2.1, y: capCenter}];
  }
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
      // N now approaches the lowered launch from above. Match that lead and
      // the unchanged trunk bends with the existing P top dogbone.
      const h = (a * (1 - k) + Math.abs(b[0].x - b[1].x)
        - k * (2 * centerline[0].y - b[0].y - b[1].y) + bendSkew) / Math.SQRT2;
      topLaunches = [[b[0], {x: b[0].x + a, y: b[0].y - a},
        {x: b[0].x + a, y: b[0].y - h}], [b[1]]];
    } else if (lane === 2) {
      const t = centerline[0].y - b[0].y;
      const a = 0.14;
      const h = halfPitch + (k * (Math.abs(b[1].y - b[0].y) - 2 * t)
        + 12 * halfPitch * k + pcieTx2BottomLeadDrop * (1 - k)) / Math.SQRT2 - a;
      topLaunches = [[b[0], {x: b[0].x - a, y: b[0].y - a},
        {x: b[0].x - a, y: b[0].y - h}], [b[1]]];
    } else {
      // Identical land vias and matching first horizontal runs remove the
      // previous 3.08 mm top-versus-zero transition asymmetry. Existing trunk
      // bend skew is compensated locally on the bottom, after that fan-in.
      const cy = (b[0].y + b[1].y) / 2 + 0.16;
      const dyP = cy - halfPitch - b[0].y, dyN = cy + halfPitch - b[1].y;
      const fanInX = b[0].x + 0.19 + Math.max(dyP, dyN);
      const a = (bendSkew - k * (dyP - dyN)) / (4 * k);
      const startX = fanInX + 4 * a;
      const northeastX = 30.1 + cy - (b[0].y - 0.5) - Math.SQRT2 * halfPitch - 0.28;
      paired = [-halfPitch, halfPitch].map(d => offsetPairCenterline([
        {x: startX, y: cy}, {x: northeastX, y: cy},
        {x: northeastX + 102.8 - cy, y: 102.8},
        ...centerline.slice(1),
      ], d));
      topLaunches = [[b[0]], [b[1]]];
    }
    const bridgeVias = topLaunches.map(points => points[points.length - 1]);
    const launches = bridgeVias.map((v, i) => {
      const start = paired[i][0], dy = Math.abs(start.y - v.y);
      if (lane === 3) {
        const cy = (b[0].y + b[1].y) / 2 + 0.16, sign = i === 0 ? -1 : 1;
        const dyP = cy - halfPitch - b[0].y, dyN = cy + halfPitch - b[1].y;
        const fanInX = b[0].x + 0.19 + Math.max(dyP, dyN);
        const y = cy + sign * halfPitch, a = (bendSkew - k * (dyP - dyN)) / (4 * k);
        const entry = [v, {x: v.x + 0.19, y: v.y},
          {x: v.x + 0.19 + Math.abs(y - v.y), y}, {x: fanInX, y}];
        if (i === 1) return [...entry, start];
        return [...entry, {x: fanInX + a, y: y - a}, {x: fanInX + 2 * a, y},
          {x: fanInX + 3 * a, y: y - a}, start];
      }
      if (lane === 2 && i === 1) {
        const lead = {x: v.x, y: v.y - pcieTx2BottomLeadDrop};
        return [v, lead, {x: lead.x + Math.abs(start.y - lead.y), y: start.y}, start];
      }
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
