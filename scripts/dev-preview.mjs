import {cpSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, watch, writeFileSync} from "node:fs";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {canReusePlacement, readPreviewInput} from "./preview-source.mjs";
import {updatePlacementPreview} from "./placement-preview.ts";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const previewDir = join(projectDir, "dist", "preview");
const cacheFile = join(projectDir, "dist", "placement-preview-cache.json");
const portIndex = process.argv.indexOf("--port");
const port = portIndex < 0 ? "3020" : process.argv[portIndex + 1];
if (!/^\d+$/.test(port ?? "") || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid preview port");
mkdirSync(previewDir, {recursive: true});
writeFileSync(join(previewDir, "package.json"), JSON.stringify({name: "flamingo-preview", private: true, main: "circuit.json"}));

let cache;
try { cache = JSON.parse(readFileSync(cacheFile, "utf8")); } catch {}
let stopped = false, dirty = false, running = false, timer, builder, viewer;
let lastInputKey;

function atomicWrite(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}

function viewerJson(json) {
  return json.map(element => {
    if (element.type !== "cad_component") return element;
    return Object.fromEntries(Object.entries(element).map(([key, value]) => {
      if (key.startsWith("model_") && key.endsWith("_url") && typeof value === "string" && value.startsWith(`${projectDir}/`)) {
        return [key, `/api/files/static/${relative(projectDir, value).replaceAll("\\", "/")}`];
      }
      return [key, value];
    }));
  });
}

function runBuilder(output) {
  return new Promise((resolveBuild, reject) => {
    builder = spawn(process.execPath, [join(projectDir, "scripts", "render-preview.mjs"), output], {cwd: projectDir, stdio: "inherit"});
    builder.on("error", reject);
    builder.on("exit", code => {
      builder = undefined;
      code === 0 ? resolveBuild() : reject(new Error(`Preview build exited with code ${code}`));
    });
  });
}

async function refresh() {
  if (running || stopped) { dirty = true; return; }
  running = true;
  try {
    do {
      dirty = false;
      const input = readPreviewInput(projectDir);
      if (input.inputKey === lastInputKey) continue;
      const start = performance.now();
      let json;
      if (canReusePlacement(cache, input)) {
        const unchanged = JSON.stringify(cache.placements) === JSON.stringify(input.placements);
        json = unchanged ? cache.circuitJson : await updatePlacementPreview(cache, input.placements);
        console.log(`${unchanged ? "Cached preview" : "Placement update (no circuit rebuild)"}: ${Math.round(performance.now() - start)} ms`);
      } else {
        console.log("Circuit or layout changed. Building preview...");
        const output = join(projectDir, "dist", `preview-build-${process.pid}.json`);
        try {
          await runBuilder(output);
          const built = JSON.parse(readFileSync(output, "utf8"));
          const candidate = {...built, sourceHash: input.sourceHash};
          const latest = readPreviewInput(projectDir);
          if (latest.inputKey !== input.inputKey && !canReusePlacement(candidate, latest)) { dirty = true; continue; }
          cache = candidate;
          atomicWrite(cacheFile, JSON.stringify(cache));
          // Moves during the first build reuse its result on the next iteration.
          if (latest.inputKey !== input.inputKey) { dirty = true; continue; }
          json = cache.circuitJson;
          if (existsSync(join(projectDir, "models"))) cpSync(join(projectDir, "models"), join(previewDir, "models"), {recursive: true});
        } finally {
          if (existsSync(output)) unlinkSync(output);
        }
      }
      if (stopped) return;
      if (readPreviewInput(projectDir).inputKey !== input.inputKey) { dirty = true; continue; }
      atomicWrite(join(previewDir, "circuit.json"), JSON.stringify(viewerJson(json)));
      lastInputKey = input.inputKey;
    } while (dirty && !stopped);
  } catch (error) {
    console.error(error);
    if (!existsSync(join(previewDir, "circuit.json"))) throw error;
    const json = structuredClone(cache?.circuitJson ?? []);
    json.push({type: "source_runtime_error", error_type: "source_runtime_error", message: `Preview update failed. Showing the last full build. ${error.message}`});
    atomicWrite(join(previewDir, "circuit.json"), JSON.stringify(viewerJson(json)));
  } finally {
    running = false;
    if (dirty && !stopped) schedule();
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { void refresh(); }, 150);
}

// Watch before the first build so edits made during a build are not lost.
const watcher = watch(projectDir, {recursive: true}, (_event, filename) => {
  const path = String(filename ?? "").replaceAll("\\", "/");
  if (!path || path.split("/").some(part => part.startsWith(".") || ["dist", "node_modules"].includes(part))) return;
  dirty = true;
  schedule();
});

function stop() {
  if (stopped) return;
  stopped = true;
  watcher.close();
  clearTimeout(timer);
  builder?.kill("SIGTERM");
  viewer?.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  await refresh();
  if (!stopped) {
    if (existsSync(join(projectDir, "models"))) cpSync(join(projectDir, "models"), join(previewDir, "models"), {recursive: true});
    console.log("Edit pcbGroupPlacements in index.circuit.tsx. X/Y moves reuse the circuit and schematic.");
    viewer = spawn(process.execPath, [join(projectDir, "node_modules", ".bin", "tsci"), "dev", "circuit.json", "--port", port], {
      cwd: previewDir, stdio: "inherit",
    });
    viewer.on("error", error => { console.error(error); process.exitCode = 1; stop(); });
    viewer.on("exit", code => { process.exitCode = code ?? 0; stop(); });
  }
} catch (error) {
  stop();
  throw error;
}
