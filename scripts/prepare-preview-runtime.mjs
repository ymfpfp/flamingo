import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {resolve} from "node:path";

const require = createRequire(import.meta.url);
const replacements = [
  ["!n.current&&t.current&&s$e(s,t.current)&&(n.current=!0)",
    "!n.current&&t.current&&(n.current=!0,s$e(s,t.current))"],
  ["if(!n.current&&s$e(e.current,t.current)){n.current=!0;return}",
    "if(!n.current){n.current=!0;if(s$e(e.current,t.current))return}"],
];

// cad-viewer 0.0.619 restores OrbitControls before marking the camera restored.
// update() emits change synchronously, so that order re-enters restore forever.
export function patchCameraRestore(source) {
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) {
      throw new Error("The preview runtime changed; review the saved-camera patch.");
    }
    source = source.replace(before, after);
  }
  return source;
}

const serialFileLoader = 'async function BWo(){const t=await fetch(`${g2}/files/list`),{file_list:e}=await t.json(),n=new Map;for(const o of e){if(eRe(o.file_path)){const i=await tRe(o.file_path);n.set(o.file_path,i.text_content);continue}n.set(o.file_path,"__STATIC_ASSET__")}return n}';
const parallelFileLoader = 'async function BWo(){const t=await fetch(`${g2}/files/list`),{file_list:e}=await t.json(),n=new Map(e.map(o=>[o.file_path,"__STATIC_ASSET__"])),o=e.filter(o=>eRe(o.file_path));let i=0;await Promise.all(Array.from({length:Math.min(16,o.length)},async()=>{while(i<o.length){const r=o[i++],s=await tRe(r.file_path);n.set(r.file_path,s.text_content)}}));return n}';

// runframe fetches every source and dependency file serially before rendering.
// Bound concurrency to avoid thousands of network round trips on cold starts.
export function patchFileLoading(source) {
  if (source.includes(parallelFileLoader)) return source;
  if (source.split(serialFileLoader).length !== 2) {
    throw new Error("The preview runtime changed; review the file-loading patch.");
  }
  return source.replace(serialFileLoader, parallelFileLoader);
}

const copperConnectivityReplacements = [
  ['Twt=(t,e)=>{if(Array.isArray(e)){',
    'Twt=(t,e,batch)=>{if(Array.isArray(e)){'],
  ['const m=e.map(f=>Twt(t,f)),p=new Map;',
    'const batchCache={},m=e.map(f=>Twt(t,f,batchCache)),p=new Map;'],
  ['const i=c_(t),r=V5o(t,i,n.subcircuit_id),s=J5o(t,n,r),',
    'const i=batch?(batch.global??=c_(t)):c_(t),r=batch?(batch.scoped??=V5o(t,i,n.subcircuit_id)):V5o(t,i,n.subcircuit_id),s=J5o(t,n,r),'],
];

// All pours in a batch use the same immutable board snapshot and subcircuit.
// Build connectivity once for that batch; later renders get a fresh context.
export function patchCopperPourConnectivity(source) {
  for (const [before, after] of copperConnectivityReplacements) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) {
      throw new Error("The preview runtime changed; review the copper connectivity patch.");
    }
    source = source.replace(before, after);
  }
  return source;
}

// The solver has already expanded these obstacle polygons by every clearance.
// Disjoint bounds cannot affect subtraction. Keep two geometry-grid units at
// each boundary so rounding to the solver's 1e-6 mm grid stays conservative.
export function filterCopperObstacles(outline, polygons) {
  if (!outline.length) return polygons;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of outline) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return polygons;
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
  }
  const margin = 2e-6;
  return polygons.filter(polygon => {
    let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
    for (const point of polygon) {
      // Leave invalid geometry to the native solver's validation.
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return true;
      left = Math.min(left, point.x); bottom = Math.min(bottom, point.y);
      right = Math.max(right, point.x); top = Math.max(top, point.y);
    }
    return right >= minX - margin && left <= maxX + margin &&
      top >= minY - margin && bottom <= maxY + margin;
  });
}

export function patchCopperPourObstacleFiltering(source) {
  const before = "P5o=(t,e)=>{const n=v5o(t),o=ePe(e);";
  const after = `P5o=(t,e)=>{e=(${filterCopperObstacles.toString()})(t,e);const n=v5o(t),o=ePe(e);`;
  if (source.includes(after)) return source;
  if (source.split(before).length !== 2) {
    throw new Error("The preview runtime changed; review the copper obstacle patch.");
  }
  return source.replace(before, after);
}

// The viewer also embeds its circuit evaluator as a base64 worker script.
// Apply the same optimizations there, where normal browser renders execute.
export function patchCopperPourWorker(source) {
  const replacements = [
    ['convertCircuitJsonToInputProblem=(circuitJson,optionsOrOptions)=>{',
      'convertCircuitJsonToInputProblem=(circuitJson,optionsOrOptions,batch)=>{'],
    ['let inputProblems=optionsOrOptions.map(options2=>convertCircuitJsonToInputProblem(circuitJson,options2)),padsByLayerAndId=new Map;',
      'let batchCache={},inputProblems=optionsOrOptions.map(options2=>convertCircuitJsonToInputProblem(circuitJson,options2,batchCache)),padsByLayerAndId=new Map;'],
    ['let globalConnectivityMap=getFullConnectivityMapFromCircuitJson(circuitJson),subcircuitConnectivityMap=buildSubcircuitConnectivityLookup(circuitJson,globalConnectivityMap,options.subcircuit_id),pourConnectivityKey=',
      'let globalConnectivityMap=batch?(batch.global??=getFullConnectivityMapFromCircuitJson(circuitJson)):getFullConnectivityMapFromCircuitJson(circuitJson),subcircuitConnectivityMap=batch?(batch.scoped??=buildSubcircuitConnectivityLookup(circuitJson,globalConnectivityMap,options.subcircuit_id)):buildSubcircuitConnectivityLookup(circuitJson,globalConnectivityMap,options.subcircuit_id),pourConnectivityKey='],
    ['subtractBlockersFromPour=(pourPolygon,blockerPolygons)=>{let pourSection=',
      `subtractBlockersFromPour=(pourPolygon,blockerPolygons)=>{blockerPolygons=(${filterCopperObstacles.toString()})(pourPolygon,blockerPolygons);let pourSection=`],
  ];
  for (const [before, after] of replacements) {
    if (source.includes(after)) continue;
    if (source.split(before).length !== 2) {
      throw new Error("The preview worker changed; review the copper-fill patches.");
    }
    source = source.replace(before, after);
  }
  return source;
}

export function patchEmbeddedCircuitWorker(source) {
  const pattern = /(q4n=URL\.createObjectURL\(new Blob\(\[atob\(")([A-Za-z0-9+/=]+)("\))/g;
  if ([...source.matchAll(pattern)].length !== 1) {
    throw new Error("The preview runtime changed; cannot locate its circuit worker.");
  }
  return source.replace(pattern, (_match, prefix, encoded, suffix) => {
    const worker = patchCopperPourWorker(Buffer.from(encoded, "base64").toString("utf8"));
    return prefix + Buffer.from(worker, "utf8").toString("base64") + suffix;
  });
}

if (import.meta.main) {
  const source = readFileSync(require.resolve("tscircuit/browser"), "utf8");
  mkdirSync(".tscircuit", {recursive: true});
  const output = resolve(".tscircuit/preview-runtime.min.js");
  const patched = patchEmbeddedCircuitWorker(
    patchCopperPourObstacleFiltering(patchCopperPourConnectivity(patchFileLoading(patchCameraRestore(source)))),
  );
  writeFileSync(output, patched);
  console.log("Prepared preview runtime with camera, file-loading, and copper-fill fixes.");
}
