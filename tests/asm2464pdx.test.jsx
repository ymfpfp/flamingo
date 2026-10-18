import assert from "node:assert/strict";
import {test} from "node:test";
import {Children, Fragment, isValidElement} from "react";
import ASM2464PDX, {Footprint} from "../imports/ASM2464PDX";
import reference from "./fixtures/asm2464pdx-pin-map.json";

// Exercise the JSX exported by the component, rather than a second pin map.
function elements(node) {
  const result = [];
  Children.forEach(node, child => {
    if (!isValidElement(child)) return;
    const element = child;
    if (element.type === Fragment) {
      result.push(...elements(element.props.children));
    } else {
      result.push(element);
    }
  });
  return result;
}

const chip = elements(ASM2464PDX()).find(element => element.type === "chip");
const footprintElements = elements(Footprint().props.children);
const pads = footprintElements.filter(element => element.type === "smtpad").map(element => element.props);
const ballPads = Object.fromEntries(pads.map(pad => [pad.name, pad]));
const aliases = value => typeof value === "string" ? [value] : value;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("all 273 balls match the ASMedia revision 0.3 pinout", () => {
  assert.equal(pads.length, 273);
  assert.equal(Object.keys(chip.props.pinLabels).length, 273);
  assert.deepEqual(Object.keys(ballPads).sort(), Object.keys(reference.balls).sort());
  assert.equal(new Set(pads.map(pad => pad.portHints[0])).size, 273);
  for (const [ball, signal] of Object.entries(reference.balls)) {
    const pad = ballPads[ball];
    assert.ok(aliases(chip.props.pinLabels[pad.portHints[0]]).includes(signal), `${ball}: expected ${signal}`);
    assert.ok(pad.portHints.includes(ball));
    assert.equal(pad.layer, "top");
  }
});

test("ball coordinates match the top-view mixed-pitch package", () => {
  for (const [ball, x, y] of [
    ["A1", -4.6, 4.6], ["A21", 4.6, 4.6], ["AA1", -4.6, -4.6], ["AA21", 4.6, -4.6],
    ["B2", -4.14, 4.14], ["Y20", 4.14, -4.14],
    ["D4", -3.25, 3.25], ["D18", 3.25, 3.25], ["V4", -3.25, -3.25], ["V18", 3.25, -3.25],
    ["L11", 0, 0],
  ]) {
    near(ballPads[ball].pcbX, x);
    near(ballPads[ball].pcbY, y);
  }
  assert.equal(new Set(pads.map(pad => `${pad.pcbX.toFixed(6)},${pad.pcbY.toFixed(6)}`)).size, 273);
  for (const [a, b] of [["A1", "A2"], ["A2", "A3"], ["B1", "C1"], ["D4", "D5"], ["D5", "D6"], ["D4", "E4"]]) {
    const distance = Math.hypot(ballPads[a].pcbX - ballPads[b].pcbX, ballPads[a].pcbY - ballPads[b].pcbY);
    near(distance, a.startsWith("D") ? 0.65 : 0.46);
  }
});

test("outer lands match ASMedia's 7 by 13 mil pattern and AA1 exception", () => {
  let horizontal = 0;
  let vertical = 0;
  for (const pad of pads) {
    const ball = pad.name;
    const [, row, column] = ball.match(/^([A-Z]+)(\d+)$/);
    const col = Number(column);
    const isHorizontal = (col === 1 && row !== "A") || (col === 21 && row !== "A" && row !== "AA");
    const isVertical = (row === "A" || row === "AA") && col > 1 && col < 21;
    if (isHorizontal || isVertical) {
      assert.equal(pad.shape, "pill", ball);
      assert.equal(pad.radius, "0.0889mm", ball);
      assert.equal(pad.width, isHorizontal ? "0.3302mm" : "0.1778mm", ball);
      assert.equal(pad.height, isHorizontal ? "0.1778mm" : "0.3302mm", ball);
      isHorizontal ? horizontal++ : vertical++;
    } else {
      assert.equal(pad.shape, "circle", ball);
      // Engineering candidate; ASMedia does not specify the circular land diameter.
      assert.equal(pad.radius, 0.1, ball);
    }
  }
  assert.equal(horizontal, 39);
  assert.equal(vertical, 38);
});

test("power groups and active-low reset directions are preserved", () => {
  for (const [ball, signal] of Object.entries(reference.balls)) {
    const logicalPin = ballPads[ball].portHints[0];
    if (["GND", "GNDA", "VCCH", "VCCL", "VDD"].includes(signal)) {
      assert.equal(chip.props.connections[logicalPin], `net.${signal}`, ball);
    }
    if (signal.startsWith("NC_")) assert.ok(chip.props.noConnect.includes(signal), ball);
  }
  for (const [ball, name] of [["A2", "SPI_CS"], ["H1", "RST"], ["G21", "PERST0"], ["F21", "PERST1"], ["E21", "PERST2"], ["D21", "PERST3"]]) {
    assert.deepEqual(chip.props.pinLabels[ballPads[ball].portHints[0]], [`${name}_N`, name]);
  }
  assert.equal(chip.props.pinAttributes.RST.isInput, true);
  for (let i = 0; i < 4; i++) assert.equal(chip.props.pinAttributes[`PERST${i}`].isOutput, true);
  assert.equal(chip.props.pinAttributes.VBUS.isInput, true);
  assert.equal(chip.props.pinAttributes.VDD.requiresVoltage, "1.13V");
  const body = footprintElements.find(element => element.type === "fabricationnoterect");
  assert.equal(body.props.width, "10mm");
  assert.equal(body.props.height, "10mm");
});
