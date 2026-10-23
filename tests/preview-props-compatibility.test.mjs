import assert from "node:assert/strict";
import {test} from "node:test";
import {fileURLToPath} from "node:url";

test("the preview builds when @tscircuit/props has no runtime schema exports", async () => {
  const result = await Bun.build({
    entrypoints: ["index.circuit.tsx", "lib/power-distribution.tsx", "lib/vcch-routing.tsx",
      "lib/slot-power-routing.tsx"].map(file => fileURLToPath(new URL(`../${file}`, import.meta.url))),
    target: "browser",
    external: ["react", "react/jsx-runtime", "tscircuit", "@tscircuit/circuit-json-util",
      "@tscircuit/math-utils", "transformation-matrix"],
    plugins: [{name: "preview-props", setup(build) {
      build.onResolve({filter: /^@tscircuit\/props$/}, () => ({
        path: "props", namespace: "preview-props",
      }));
      build.onLoad({filter: /.*/, namespace: "preview-props"}, () => ({
        contents: "export {};", loader: "js",
      }));
    }}],
  });
  assert.ok(result.success, result.logs.map(log => log.message).join("\n"));
});
