import assert from "node:assert/strict";
import {test} from "node:test";
import {pcb_silkscreen_graphic} from "circuit-json";
import {configureSilkscreenFont, outlineSilkscreenText} from "../lib/silkscreen-font";
import {Children} from "react";
import {RootCircuit} from "tscircuit";
import {BoardArtwork} from "../components/BoardArtwork";
import {UartHeader} from "../components/UartHeader";
import {SpiProgrammingHeader} from "../components/SpiProgrammingHeader";

const label = (props = {}) => ({
  type: "pcb_silkscreen_text", pcb_silkscreen_text_id: "test", pcb_component_id: "component",
  font: "tscircuit2024", font_size: 0.8, layer: "top", text: "H",
  anchor_position: {x: 10, y: 20}, anchor_alignment: "center", ...props,
});
const vertices = shapes => shapes.flatMap(s => s.brep_shape.outer_ring.vertices);
const bounds = points => ({
  minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)),
  minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)),
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("font outlines retain counters and use valid filled silkscreen records", () => {
  const shapes = outlineSilkscreenText(label({text: "O8"}));
  assert.equal(shapes.length, 2);
  assert.equal(shapes[0].brep_shape.inner_rings.length, 1);
  assert.equal(shapes[1].brep_shape.inner_rings.length, 2);
  for (const shape of shapes) pcb_silkscreen_graphic.parse(shape);
  const b = bounds(vertices(outlineSilkscreenText(label())));
  near(b.maxY - b.minY, 0.8);
});

test("all nine ink anchors stay at the existing PCB label position", () => {
  for (const alignment of ["top_left", "top_center", "top_right", "center_left", "center", "center_right", "bottom_left", "bottom_center", "bottom_right"]) {
    const b = bounds(vertices(outlineSilkscreenText(label({text: "UART_TX", anchor_alignment: alignment}))));
    near(alignment.endsWith("_left") ? b.minX : alignment.endsWith("_right") ? b.maxX : (b.minX + b.maxX) / 2, 10);
    near(alignment.startsWith("top_") ? b.maxY : alignment.startsWith("bottom_") ? b.minY : (b.minY + b.maxY) / 2, 20);
  }
});

test("rotation and bottom-side reflection apply to every contour", () => {
  const original = outlineSilkscreenText(label({text: "R8"}));
  const rotated = outlineSilkscreenText(label({text: "R8", ccw_rotation: 90}));
  const mirrored = outlineSilkscreenText(label({text: "R8", layer: "bottom"}));
  for (let i = 0; i < original.length; i++) {
    const rings = s => [s.brep_shape.outer_ring, ...s.brep_shape.inner_rings];
    rings(original[i]).forEach((ring, j) => ring.vertices.forEach((p, k) => {
      const r = rings(rotated[i])[j].vertices[k];
      near(r.x, 10 - (p.y - 20)); near(r.y, 20 + (p.x - 10));
      const m = rings(mirrored[i])[j].vertices.at(-1 - k);
      near(m.x, 20 - p.x); near(m.y, p.y);
    }));
  }
});

test("font atlas covers printable ASCII and fails clearly for missing glyphs", () => {
  for (let code = 32; code < 127; code++) {
    const shapes = outlineSilkscreenText(label({text: String.fromCharCode(code)}));
    for (const shape of shapes) pcb_silkscreen_graphic.parse(shape);
  }
  assert.deepEqual(outlineSilkscreenText(label({text: "   "})), []);
  assert.throws(() => outlineSilkscreenText(label({text: "Ω"})), /Missing Iosevka/);
});

test("board rendering converts resolved header and revision labels to Iosevka outlines", async () => {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDisabled: true}});
  circuit.schematicDisabled = true;
  let resolvedLabels = [];
  circuit.add(<board width={60} height={60} pcbRelative routeRemaining={false} ref={board => {
    if (!board) return;
    const originalCadRender = board.doInitialCadModelRender.bind(board);
    board.doInitialCadModelRender = () => {
      originalCadRender();
      resolvedLabels = [...board.root.db.pcb_silkscreen_text.list()];
    };
    configureSilkscreenFont(board);
    configureSilkscreenFont(board);
  }}>
    <UartHeader name="UART" pcbX={-15} pcbY={0} pcbRotation={90}/>
    <SpiProgrammingHeader name="SPI" pcbX={10} pcbY={0} pcbRotation={90}/>
    <silkscreentext text="rev 1" pcbX={0} pcbY={-15} pcbRotation={90} fontSize={0.8}/>
  </board>);
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  for (const expected of ["UART", "SPI", "UART_TX", "RST_N", "MOSI", "rev 1"]) {
    assert.ok(resolvedLabels.some(label => label.text === expected), `missing resolved label ${expected}`);
  }
  assert.equal(json.filter(element => element.type === "pcb_silkscreen_text").length, 0);
  const graphics = json.filter(element => element.type === "pcb_silkscreen_graphic"
    && element.pcb_silkscreen_graphic_id.startsWith("iosevka_"));
  assert.equal(graphics.length, resolvedLabels.flatMap(outlineSilkscreenText).length);
  const artwork = Children.toArray(BoardArtwork().props.children);
  assert.equal(artwork.length, 1, "only the badge is enabled; the flamingo stays hidden");
});
