import type {PcbSilkscreenGraphicBRep} from "circuit-json";
import artwork from "../assets/artwork/flamingo-paths.json";
import {strokeArc, transformArcRing} from "./arc-silkscreen";

export function flamingoSilkscreen(placement: {
  pcbX: number; pcbY: number; pcbRotation?: number;
}): PcbSilkscreenGraphicBRep[] {
  return artwork.paths.flatMap(path => path.segments.map((segment, index) => {
    const shape = strokeArc(segment, artwork.strokeWidth);
    return {
      type: "pcb_silkscreen_graphic",
      pcb_silkscreen_graphic_id: `flamingo_${path.id}_${index}`,
      pcb_component_id: "",
      layer: "top",
      shape: "brep",
      brep_shape: {outer_ring: transformArcRing(shape.outer_ring.vertices, placement), inner_rings: []},
    };
  }));
}
