import type {PcbSilkscreenGraphicBRep} from "circuit-json";
import artwork from "../assets/artwork/ts-mark.json";
import {transformArcRing} from "./arc-silkscreen";

// Keep exact arc geometry in Circuit JSON; SVG image conversion flattens curves.
export function tsMarkSilkscreen({pcbX, pcbY, pcbRotation = 0}: {
  pcbX: number; pcbY: number; pcbRotation?: number;
}): PcbSilkscreenGraphicBRep[] {
  const placement = {pcbX, pcbY, pcbRotation};
  return [{
    type: "pcb_silkscreen_graphic",
    pcb_silkscreen_graphic_id: "ts_mark_0",
    // Native SilkscreenGraphic uses an empty owner for board-level artwork.
    pcb_component_id: "",
    layer: "top",
    shape: "brep",
    brep_shape: {
      outer_ring: transformArcRing(artwork.outer_ring.vertices, placement),
      inner_rings: artwork.inner_rings.map(ring => transformArcRing(ring.vertices, placement)),
    },
  }];
}
