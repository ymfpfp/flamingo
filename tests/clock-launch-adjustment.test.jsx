import assert from "node:assert/strict";
import {test} from "node:test";
import {bridgeClockRules, clockCopperLength, prepareBridgeClockRouting} from "../lib/bridge-clock-routing";

const positions = {
  "ASM2464PDX.XI": {x: 32.72, y: 102.0000074},
  "ASM2464PDX.XO": {x: 32.72, y: 101.5400074},
  "ASM2464PDX.REFCLK_P0": {x: 30.88, y: 102.0000074},
  "ASM2464PDX.REFCLK_N0": {x: 30.88, y: 101.5400074},
  "C1.pin1": {x: 32.279884, y: 105.4},
  "C1.pin2": {x: 33.120116, y: 105.4},
  "XCLK.pin1": {x: 35.149989, y: 108.100074},
  "XCLK.pin3": {x: 36.850011, y: 105.899926},
  "R_PCIE_REFCLK_P.pin1": {x: 16.1, y: 101.4328},
  "R_PCIE_REFCLK_P.pin2": {x: 16.1, y: 100.5672},
  "R_PCIE_REFCLK_N.pin1": {x: 17.3, y: 101.4328},
  "R_PCIE_REFCLK_N.pin2": {x: 17.3, y: 100.5672},
  "PCIe.REFCLK_P": {x: 13.944928, y: 99.8608106},
  "PCIe.REFCLK_N": {x: 13.944928, y: 98.8608126},
};

function routesFor(points) {
  const board = {selectOne: selector => {
    const point = points[selector];
    return point && {
      _getGlobalPcbPositionBeforeLayout: () => point,
      _getGlobalPcbPositionAfterLayout: () => point,
    };
  }};
  const phase = {_parsedProps: {}, getGroup: () => ({
    _computePcbGlobalTransformBeforeLayout: () => ({a: 1, b: 0, c: 0, d: 1, e: 0, f: 0}),
  })};
  prepareBridgeClockRouting(board, phase);
  return phase._parsedProps.pcbTracePaths;
}

function refclkSkew(paths) {
  const channel = polarity => paths
    .filter(path => path.connection === `ASM2464PDX.REFCLK_${polarity}0`
      || path.connection === `PCIe.REFCLK_${polarity}`)
    .reduce((length, path) => length + clockCopperLength(path.route), 0);
  return Math.abs(channel("P") - channel("N"));
}

test("nominal REFCLK launch remains matched within its reserved excursion", () => {
  const paths = routesFor(positions);
  const p = paths.find(path => path.connection === "ASM2464PDX.REFCLK_P0").route;
  assert.ok(Math.abs(Number(p[2].x) - Number(p[0].x) - .4082691193458) < 1e-9);
  assert.ok(refclkSkew(paths) < 1e-9);
});

test("the reported negative launch adjustment keeps a legal untuned clock pair", () => {
  const points = structuredClone(positions);
  points["ASM2464PDX.REFCLK_P0"].y -= .36;
  const paths = routesFor(points);
  const p = paths.find(path => path.connection === "ASM2464PDX.REFCLK_P0").route;
  assert.equal(p[2].x, p[0].x, "P must not acquire a backwards tuning excursion");
  assert.ok(Math.abs(refclkSkew(paths) - .02177878733765) < 1e-9);
  assert.ok(refclkSkew(paths) < bridgeClockRules.refclkMaxSkew);
  assert.deepEqual(p[0], {route_type: "wire", ...points["ASM2464PDX.REFCLK_P0"],
    width: bridgeClockRules.width, layer: "top"});
  assert.ok(p.every((point, i) => !i || point.route_type !== "wire" || p[i - 1].route_type !== "wire"
    || point.x !== p[i - 1].x || point.y !== p[i - 1].y), "straight launch has no zero-length copper segments");
});

test("an untunable pair still rejects excess skew and excursions outside the reserved launch", () => {
  const tooLong = structuredClone(positions);
  tooLong["ASM2464PDX.REFCLK_P0"].y -= .6;
  assert.throws(() => routesFor(tooLong), /REFCLK P\/N skew outside/);
  const tooShort = structuredClone(positions);
  tooShort["ASM2464PDX.REFCLK_P0"].y += .04;
  assert.throws(() => routesFor(tooShort), /Clock escape adjustment outside reserved launch/);
});
