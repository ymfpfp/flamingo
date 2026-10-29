import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "bun:test";
import {Resvg} from "@resvg/resvg-js";
import {PNG} from "pngjs";
import {pcb_silkscreen_graphic} from "circuit-json";
import {RootCircuit} from "tscircuit";
import {BoardArtwork} from "../components/BoardArtwork";
import {badge} from "../assets/artwork/silkscreen.json";

test("badge cutouts preserve the original logo's dot and letter shapes", () => {
  const reference = PNG.sync.read(readFileSync(new URL("../assets/artwork/ts-mark-reference.png", import.meta.url)));
  const actual = PNG.sync.read(new Resvg(badge, {fitTo: {mode: "width", value: reference.width}}).render().asPng());
  assert.equal(actual.height, reference.height);
  // Compare each cutout separately so a large matching background cannot hide
  // changed lettering, terminals, or spacing.
  for (const [name, x0, y0, x1, y1, minimumOverlap] of [
    ["dot", 45, 50, 110, 115, 0.98],
    ["t", 115, 135, 210, 325, 0.99],
    ["s", 210, 170, 340, 325, 0.98],
  ]) {
    let intersection = 0, union = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const offset = (y * reference.width + x) * 4;
      const expectedCutout = reference.data[offset + 3] > 127 && reference.data[offset] >= 155;
      const actualCutout = actual.data[offset + 3] < 128;
      intersection += Number(expectedCutout && actualCutout);
      union += Number(expectedCutout || actualCutout);
    }
    assert.ok(intersection / union >= minimumOverlap, `${name} contour differs from the original logo`);
  }
});

test("badge renders as a filled 6 mm graphic with three cutouts and no contour strokes", async () => {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDisabled: true}});
  circuit.schematicDisabled = true;
  circuit.add(<board width={52.5} height={123.62} pcbRelative routeRemaining={false}
    boardAnchorAlignment="bottom_left" boardAnchorPosition={{x: 0, y: 0}}>
    <BoardArtwork/>
    <silkscreenpath route={[{x: 1, y: 1}, {x: 2, y: 1}]} strokeWidth={0.15}/>
  </board>);
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const graphics = json.filter(element => element.type === "pcb_silkscreen_graphic");
  assert.equal(graphics.length, 1);
  const graphic = pcb_silkscreen_graphic.parse(graphics[0]);
  assert.equal(graphic.layer, "top");
  assert.equal(graphic.brep_shape.inner_rings.length, 3, "dot, t and s remain open");
  const points = graphic.brep_shape.outer_ring.vertices;
  for (const [actual, expected] of [
    [Math.min(...points.map(p => p.x)), 41.5],
    [Math.max(...points.map(p => p.x)), 47.5],
    [Math.min(...points.map(p => p.y)), 33.5],
    [Math.max(...points.map(p => p.y)), 39.5],
  ]) assert.ok(Math.abs(actual - expected) < 1e-8);
  const paths = json.filter(element => element.type === "pcb_silkscreen_path");
  assert.equal(paths.length, 1, "only the unrelated explicit stroke should remain");
  assert.equal(paths[0].stroke_width, 0.15);
});
