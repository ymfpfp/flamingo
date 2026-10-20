import {createHash} from "node:crypto";
import {existsSync, mkdirSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";

// Preserve the original model formats and all alignment/scale metadata.
// Only the preview URLs change; design and fabrication data stay untouched.
export async function cachePreviewModels(json, previewDir, {fetchModel = fetch} = {}) {
  const directory = join(previewDir, "models", "remote");
  mkdirSync(directory, {recursive: true});
  const urls = new Map();
  for (const element of json) {
    if (element.type !== "cad_component") continue;
    const key = ["model_glb_url", "model_gltf_url", "model_wrl_url", "model_stl_url", "model_obj_url"]
      .find(key => element[key]);
    const url = element[key];
    // GLTF may reference external buffers/textures. Leave those URLs intact.
    if (!url || !/^https:\/\/modelcdn\.tscircuit\.com\//.test(url) || key === "model_gltf_url") continue;
    const normalized = url.replace(/&cachebust_origin=$/, "");
    const extension = new URL(normalized).pathname.match(/\.(obj|glb|wrl|stl)$/)?.[1];
    if (!extension) continue;
    const name = `${createHash("sha256").update(normalized).digest("hex")}.${extension}`;
    urls.set(url, {normalized, name, path: join(directory, name), key});
  }
  const entries = [...urls.values()];
  let next = 0, downloaded = 0;
  await Promise.all(Array.from({length: Math.min(8, entries.length)}, async () => {
    while (next < entries.length) {
      const entry = entries[next++];
      if (existsSync(entry.path)) { entry.ready = true; continue; }
      try {
        const response = await fetchModel(entry.normalized, {signal: AbortSignal.timeout(20000)});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = new Uint8Array(await response.arrayBuffer());
        if (!body.length || response.headers.get("content-type")?.includes("text/html")) throw new Error("Invalid model response");
        const temporary = `${entry.path}.${process.pid}.tmp`;
        writeFileSync(temporary, body);
        renameSync(temporary, entry.path);
        entry.ready = true;
        downloaded++;
      } catch (error) {
        console.warn(`Model cache: ${new URL(entry.normalized).pathname}: ${error.message}; using remote model.`);
      }
    }
  }));
  const cached = entries.filter(entry => entry.ready).length;
  console.log(`3D models: ${cached}/${entries.length} cached (${downloaded} downloaded)`);
  return json.map(element => {
    if (element.type !== "cad_component") return element;
    for (const [key, url] of Object.entries(element)) {
      const entry = urls.get(url);
      if (key === entry?.key && entry.ready) {
        return {...element, [key]: `/api/files/static/models/remote/${entry.name}`};
      }
    }
    return element;
  });
}
