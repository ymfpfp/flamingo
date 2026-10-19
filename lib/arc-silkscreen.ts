import type {PcbSilkscreenGraphicBRep} from "circuit-json";

export type ArcVertex = {x: number; y: number; bulge?: number};
type Segment = {start: ArcVertex; end: ArcVertex; bulge: number};

// Bulges encode exact circular arcs: tan(counterclockwise sweep / 4).
export function transformArcRing(vertices: ArcVertex[], {pcbX, pcbY, pcbRotation = 0}: {
  pcbX: number; pcbY: number; pcbRotation?: number;
}): {vertices: ArcVertex[]} {
  const angle = pcbRotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return {vertices: vertices.map(p => ({
    ...p, x: pcbX + p.x * cos - p.y * sin, y: pcbY + p.x * sin + p.y * cos,
  }))};
}

function reverse(vertices: ArcVertex[]): ArcVertex[] {
  return [...vertices].reverse().map((p, i) => ({
    x: p.x, y: p.y,
    bulge: -(vertices[(vertices.length - 2 - i + vertices.length) % vertices.length].bulge ?? 0),
  }));
}

// An arc stroke is bounded by two concentric arcs and two semicircular caps.
// A straight stroke has two parallel sides and the same semicircular caps.
export function strokeArc(segment: Segment, width: number): PcbSilkscreenGraphicBRep["brep_shape"] {
  const {start, end, bulge} = segment, half = width / 2;
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length < 1e-10) throw new Error("Cannot stroke a zero-length artwork segment");
  if (!bulge) {
    const nx = -dy / length * half, ny = dx / length * half;
    return {outer_ring: {vertices: [
      {x: start.x + nx, y: start.y + ny},
      {x: end.x + nx, y: end.y + ny, bulge: -1},
      {x: end.x - nx, y: end.y - ny},
      {x: start.x - nx, y: start.y - ny, bulge: -1},
    ]}, inner_rings: []};
  }
  const offset = (1 - bulge * bulge) / (4 * bulge);
  const center = {x: (start.x + end.x) / 2 - dy * offset, y: (start.y + end.y) / 2 + dx * offset};
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  if (radius <= half) throw new Error("Artwork arc radius must exceed half its stroke width");
  const side = (p: ArcVertex, amount: number, b: number): ArcVertex => ({
    x: p.x + (p.x - center.x) / radius * amount,
    y: p.y + (p.y - center.y) / radius * amount,
    bulge: b,
  });
  const sign = Math.sign(bulge);
  const vertices = [side(start, half, bulge), side(end, half, sign), side(end, -half, -bulge), side(start, -half, sign)];
  return {outer_ring: {vertices: sign > 0 ? reverse(vertices) : vertices}, inner_rings: []};
}
