// JSON text assets work in both Bun and the browser's circuit evaluator.
// Refresh after SVG edits with: bun scripts/prepare-artwork.mjs
import {flamingo, badge} from "../assets/artwork/silkscreen.json";
import type {SilkscreenGraphic} from "tscircuit";

function filledArtworkOnly(graphic: SilkscreenGraphic | null) {
  if (!graphic) return;
  // The installed renderer also strokes every SVG contour, including cutouts.
  // The filled BRep already describes the complete artwork without that stroke.
  graphic.insertRenderableSilkscreenPaths = () => {};
}

// Keep the artwork and its placement available for later.
const showFlamingo = false;

export function BoardArtwork() {
  return <>
    {showFlamingo && <silkscreengraphic imageUrl={`data:image/svg+xml,${encodeURIComponent(flamingo)}`}
      width={17.1} height={24.48} pcbX={42} pcbY={49} pcbRotation={130} layer="top"/>}
    <silkscreengraphic {...{ref: filledArtworkOnly}} imageUrl={`data:image/svg+xml,${encodeURIComponent(badge)}`}
      width={6} height={6} pcbX={44.5} pcbY={36.5} pcbRotation={90} layer="top"/>
    <silkscreentext text="rev 1" fontSize={0.8} pcbX={48.7} pcbY={36.5}
      pcbRotation={90} anchorAlignment="center" layer="top"/>
  </>;
}
