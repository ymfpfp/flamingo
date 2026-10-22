// JSON text assets work in both Bun and the browser's circuit evaluator.
// Refresh after SVG edits with: bun scripts/prepare-artwork.mjs
import {flamingo, badge} from "../assets/artwork/silkscreen.json";

export function BoardArtwork() {
  return <>
    <silkscreengraphic imageUrl={`data:image/svg+xml,${encodeURIComponent(flamingo)}`}
      width={17.1} height={24.48} pcbX={42} pcbY={49} pcbRotation={130} layer="top"/>
    <silkscreengraphic imageUrl={`data:image/svg+xml,${encodeURIComponent(badge)}`}
      width={6} height={6} pcbX={44.5} pcbY={36.5} pcbRotation={90} layer="top"/>
  </>;
}
