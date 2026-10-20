import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {createRequire} from "node:module";
import {join} from "node:path";
import {cacheViewerShadows} from "./viewer-shadow-cache.mjs";
import {mergeModelMaterials} from "./merge-model-materials.mjs";

const require = createRequire(import.meta.url);

export function prepare3dViewer(outputDir) {
  // Use the CLI's documented standalone override rather than editing packages
  // in node_modules. This smaller bundle is sufficient for prebuilt Circuit JSON.
  let source = readFileSync(require.resolve("@tscircuit/runframe/standalone"), "utf8");
  function replaceOnce(before, after, description) {
    const matches = [...source.matchAll(new RegExp(before.source, before.flags.includes("g") ? before.flags : before.flags + "g"))];
    if (matches.length !== 1) throw new Error(`3D viewer changed: cannot apply ${description} (${matches.length} matches). Use FLAMINGO_3D_ORIGINAL=1 for the original viewer.`);
    source = source.replace(before, after);
  }

  // These patches target runframe 0.0.2963's bundled 3d-viewer 0.0.619.
  // Fail on a changed upstream structure instead of silently patching other code.
  replaceOnce(/(\w+)\.setPixelRatio\(window\.devicePixelRatio\),(\w+)\.current\.appendChild\(\1\.domElement\)/,
    "$1.setPixelRatio(Math.min(window.devicePixelRatio,1.5)),$1.debug.checkShaderErrors=false,$2.current.appendChild($1.domElement)", "main canvas pixel ratio");
  replaceOnce(/(\w+)\.add\((\w+)\.current\),window\.__TSCIRCUIT_THREE_OBJECT=\2\.current,(\w+)\(\{scene:\1,camera:(\w+),renderer:(\w+),rootObject:/,
    (_, scene, root, setContext, camera, renderer) => `${scene}.add(${root}.current),(${cacheViewerShadows.toString()})(${renderer},${scene}),window.__TSCIRCUIT_THREE_OBJECT=${root}.current,${setContext}({scene:${scene},camera:${camera},renderer:${renderer},rootObject:`, "shadow cache");
  // Surface maps are generated with several full CPU pixel scans. One megapixel
  // retains the board artwork while avoiding four-megapixel cosmetic maps.
  replaceOnce(/maxTexturePixels:(\w+)=(\w+),maxTextureDimension:/,
    "maxTexturePixels:$1=1e6,maxTextureDimension:", "surface texture budget");
  replaceOnce(/const (\w+)=(\w+)\(\)\.then\((\w+)=>\(\3 instanceof Error\|\|(\w+)\.set\((\w+),\{\.\.\.\4\.get\(\5\),result:\3\}\),\3\)\);/,
    (_, promise, load, result, cache, key) => `const ${promise}=${load}().then(${result}=>(${result} instanceof Error||((${mergeModelMaterials.toString()})(${result}),${cache}.set(${key},{...${cache}.get(${key}),result:${result}})),${result}));`, "OBJ material batching");

  mkdirSync(outputDir, {recursive: true});
  const output = join(outputDir, "viewer.min.js");
  writeFileSync(output, source);
  return output;
}
