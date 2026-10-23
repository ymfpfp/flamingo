import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {test} from "node:test";
import {patchCameraRestore} from "../scripts/prepare-preview-runtime.mjs";

const source = readFileSync(createRequire(import.meta.url).resolve("tscircuit/browser"), "utf8");

function exerciseRestore(bundle, controlsReadyOnCreate) {
  const start = bundle.indexOf("jMi=()=>{");
  const end = bundle.indexOf(";function $Mi", start);
  assert.ok(start > 0 && end > start, "locate the installed viewer's camera hook");
  const hookSource = bundle.slice(start + "jMi=".length, end);
  let hook, restores = 0;
  const controls = {update() { hook.handleControlsChange(); }};
  const controlsRef = {current: controlsReadyOnCreate ? controls : null};
  const react = {useRef: value => ({current: value}), useCallback: callback => callback};
  const restore = (_camera, orbit) => { restores++; orbit.update(); return true; };
  hook = new Function("q", "jS", "s$e", "Mmn", "setTimeout", "clearTimeout",
    `return (${hookSource})();`)(react, () => ({controlsRef}),
    restore, () => {}, () => 0, () => {});
  hook.handleCameraCreated({});
  controlsRef.current = controls;
  controls.update();
  return restores;
}

test("saved-camera restoration does not re-enter through OrbitControls change events", () => {
  for (const controlsReady of [false, true]) {
    assert.throws(() => exerciseRestore(source, controlsReady), RangeError, "reproduce the bundled viewer bug");
    assert.equal(exerciseRestore(patchCameraRestore(source), controlsReady), 1);
  }
});

test("the preview camera patch is idempotent and rejects an unknown runtime", () => {
  const patched = patchCameraRestore(source);
  assert.equal(patchCameraRestore(patched), patched);
  assert.throws(() => patchCameraRestore("unknown viewer"), /runtime changed/);
});
