import {test, expect} from "bun:test";
import {checkAssemblyRework} from "../lib/assembly-rework.mjs";
import {layoutDigest} from "../lib/layout-geometry.mjs";

const original = [
  {name: "R_CS", center: {x: 1, y: 2}, rotation: 0, layer: "top"},
  {name: "USBC", center: {x: 9, y: 8}, rotation: 90, layer: "top"},
];
const moved = structuredClone(original);
moved[0].center.x = .7;
const rework = {authorized: true, changes: [{name: "R_CS", before: original[0], after: moved[0]}]};
const check = (placements, authorization = rework) => checkAssemblyRework(placements, layoutDigest(original), authorization);

test("accepts the exact recorded top-side move without replacing the baseline", () => {
  expect(check(moved)).toEqual([]);
  expect(check(original, {authorized: true, changes: []})).toEqual([]);
});
test("rejects unrecorded drift, stale records and moved connector placement", () => {
  expect(check(moved, {authorized: true, changes: []}).length).toBeGreaterThan(0);
  const drift = structuredClone(moved); drift[0].center.y += .01;
  expect(check(drift).length).toBeGreaterThan(0);
  const connector = structuredClone(moved); connector[1].center.x += .01;
  expect(check(connector).length).toBeGreaterThan(0);
});
test("rejects bottom-side components and duplicate or unauthorized move records", () => {
  const bottom = structuredClone(moved); bottom[0].layer = "bottom";
  expect(check(bottom).length).toBeGreaterThan(0);
  expect(check(moved, {...rework, authorized: false}).length).toBeGreaterThan(0);
  expect(check(moved, {...rework, changes: [...rework.changes, ...rework.changes]}).length).toBeGreaterThan(0);
});
test("accepts only the exact authorized top-side addition and retains the original baseline", () => {
  const addition = {name: "C136", center: {x: 47.05, y: 118}, rotation: 0, layer: "top"};
  const authorization = {...rework, additions: [{name: "C136", after: addition}]};
  expect(check([...moved, addition], authorization)).toEqual([]);
  expect(check(moved, authorization).length).toBeGreaterThan(0);
  expect(check([...moved, {...addition, layer: "bottom"}], authorization).length).toBeGreaterThan(0);
  expect(check([...moved, {...addition, center: {x: 47, y: 118}}], authorization).length).toBeGreaterThan(0);
  expect(check([...moved, addition], {...authorization, authorized: false}).length).toBeGreaterThan(0);
});
