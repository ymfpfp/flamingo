import type {PcbSilkscreenGraphicBRep, PcbSilkscreenText, Point} from "circuit-json";
import atlas from "../assets/fonts/iosevka-term-ascii.json";

type Glyph = {advance: number; shapes: {outer: number[][]; holes: number[][][]}[]};
const glyphs: Record<string, Glyph> = atlas.glyphs;

// Filled contours preserve the font's weight and counters. A silkscreenpath is
// stroke-only, so tracing a TrueType outline with it would produce hollow letters.
export function outlineSilkscreenText(text: PcbSilkscreenText): PcbSilkscreenGraphicBRep[] {
  if (text.layer !== "top" && text.layer !== "bottom") throw new Error(`Invalid silkscreen layer: ${text.layer}`);
  if (text.is_knockout) throw new Error("Iosevka silkscreen does not support knockout text");
  const shapes: {outer: Point[]; holes: Point[][]}[] = [];
  let x = 0, y = 0;
  for (const char of text.text) {
    if (char === "\n") { x = 0; y -= atlas.unitsPerEm * 1.4; continue; }
    const glyph = glyphs[char];
    if (!glyph) throw new Error(`Missing Iosevka Term silkscreen glyph: ${JSON.stringify(char)}`);
    const offset = (ring: number[][]) => ring.map(([px, py]) => ({x: x + px, y: y + py}));
    for (const shape of glyph.shapes) shapes.push({outer: offset(shape.outer), holes: shape.holes.map(offset)});
    x += glyph.advance;
  }
  const points = shapes.flatMap(shape => shape.outer);
  if (!points.length) return [];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const alignment = text.anchor_alignment;
  const anchorX = alignment.endsWith("_left") ? minX : alignment.endsWith("_right") ? maxX : (minX + maxX) / 2;
  const anchorY = alignment.startsWith("top_") ? maxY : alignment.startsWith("bottom_") ? minY : (minY + maxY) / 2;
  // Use the specified size as cap height, matching the existing PCB label height.
  const scale = text.font_size / atlas.capHeight;
  const angle = (text.ccw_rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const mirrored = text.layer === "bottom" || text.is_mirrored === true;
  const transform = (point: Point): Point => {
    const dx = (point.x - anchorX) * scale * (mirrored ? -1 : 1);
    const dy = (point.y - anchorY) * scale;
    return {x: text.anchor_position.x + dx * cos - dy * sin, y: text.anchor_position.y + dx * sin + dy * cos};
  };
  const ring = (points: Point[]) => {
    const vertices = points.map(transform);
    // Reflection reverses contour winding; keep outer CW and counters CCW.
    return {vertices: mirrored ? vertices.reverse() : vertices};
  };
  return shapes.map((shape, index) => ({
    type: "pcb_silkscreen_graphic",
    pcb_silkscreen_graphic_id: `iosevka_${text.pcb_silkscreen_text_id}_${index}`,
    pcb_component_id: text.pcb_component_id ?? "",
    pcb_group_id: text.pcb_group_id,
    subcircuit_id: text.subcircuit_id,
    layer: text.layer as "top" | "bottom",
    shape: "brep",
    brep_shape: {outer_ring: ring(shape.outer), inner_rings: shape.holes.map(ring)},
  }));
}
