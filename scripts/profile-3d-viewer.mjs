import {mkdirSync, writeFileSync} from "node:fs";
import {resolve, join} from "node:path";

// Optional profiling dependency: install Playwright, or set PLAYWRIGHT_MODULE
// to an existing installation. No browser instrumentation ships in the viewer.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const argument = (key, fallback) => {
  const index = process.argv.indexOf(key);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = argument("--url", "http://localhost:3020/#file=circuit.json");
const label = argument("--label", "viewer");
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error("Use letters, numbers, and hyphens for the profile label.");
const directory = resolve(argument("--output", "dist/3d-profile"));
mkdirSync(directory, {recursive: true});
const save = (suffix, data) => writeFileSync(join(directory, `${label}-${suffix}.json`), JSON.stringify(data, null, 2));
const browser = await chromium.launch({headless: true, channel: "chrome"});
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 900}, deviceScaleFactor: 2});
  const errors = [], network = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("requestfailed", request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", response => network.push({url: response.url(), status: response.status()}));
  // Expose the main renderer in both versions without changing its behavior.
  await page.route("**/standalone.min.js", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const pattern = /window\.__TSCIRCUIT_THREE_OBJECT=(\w+)\.current,(\w+)\(\{scene:(\w+),camera:(\w+),renderer:(\w+),rootObject:/;
    if (!pattern.test(source)) throw new Error("Cannot instrument this viewer version.");
    const body = source.replace(pattern, (_, root, setContext, scene, camera, renderer) =>
      `window.__TSCIRCUIT_THREE_OBJECT=${root}.current,window.__captureRenderer(${renderer},${scene},${camera}),${setContext}({scene:${scene},camera:${camera},renderer:${renderer},rootObject:`);
    await route.fulfill({response, body});
  });
  await page.addInitScript(() => {
    localStorage.setItem("cadViewerAutoRotate", "false");
    const state = window.__benchmark = {startedAt: 0, readyMs: null, renders: [], longTasks: []};
    new PerformanceObserver(list => state.longTasks.push(...list.getEntries().map(e => ({start: e.startTime, duration: e.duration}))))
      .observe({type: "longtask", buffered: true});
    window.__captureRenderer = (renderer, scene, camera) => {
      state.renderer = renderer;
      state.scene = scene;
      state.camera = camera;
      const render = renderer.render;
      renderer.render = function (target, view) {
        const start = performance.now();
        const value = render.call(this, target, view);
        if (target === scene && state.startedAt) {
          state.renders.push({start, cpuMs: performance.now() - start, calls: renderer.info.render.calls});
          if (state.readyMs === null) {
            const cache = window.TSCIRCUIT_OBJ_LOADER_CACHE;
            const ready = state.expectedObj === 0 || cache && cache.size >= state.expectedObj && [...cache.values()].every(entry => entry.result);
            const root = window.__TSCIRCUIT_THREE_OBJECT;
            if (ready && root?.getObjectByName("board-geom") && root?.getObjectByName("top-board-texture-plane")) {
              state.readyMs = performance.now() - state.startedAt;
            }
          }
        }
        return value;
      };
    };
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await page.goto(url, {waitUntil: "domcontentloaded"});
  await page.getByText(/@tscircuit\/pcb-viewer@/).waitFor();
  const response = await page.request.get(new URL("/api/files/get?file_path=circuit.json", url).href);
  const file = await response.json();
  const content = file.file?.text_content ?? file.content ?? file;
  const json = typeof content === "string" ? JSON.parse(content) : content;
  if (!Array.isArray(json)) throw new Error("The preview entrypoint must contain prebuilt Circuit JSON.");
  const expectedObj = new Set(json.filter(e => e.type === "cad_component" && e.model_obj_url && !e.model_glb_url && !e.model_gltf_url)
    .map(e => e.model_obj_url.replace(/&cachebust_origin=$/, ""))).size;
  async function begin() {
    await page.evaluate(expected => {
      const state = window.__benchmark;
      state.startedAt = performance.now(); state.readyMs = null; state.expectedObj = expected; state.renders = []; state.longTasks = [];
    }, expectedObj);
    await cdp.send("Profiler.start");
    await page.getByRole("tab", {name: "3D", exact: true}).click();
    await page.waitForFunction(() => window.__benchmark.readyMs !== null, null, {timeout: 60000});
    const profile = await cdp.send("Profiler.stop");
    return profile.profile;
  }
  save("load-cpu", await begin());
  const load = await page.evaluate(() => {
    const {readyMs, renders, longTasks} = window.__benchmark;
    return {readyMs, renders, longTasks};
  });
  await page.waitForTimeout(500);
  await page.screenshot({path: join(directory, `${label}.png`)});
  const canvases = await page.locator("canvas").all();
  const boxes = await Promise.all(canvases.map(async canvas => ({canvas, box: await canvas.boundingBox()})));
  boxes.sort((a, b) => (b.box?.width ?? 0) * (b.box?.height ?? 0) - (a.box?.width ?? 0) * (a.box?.height ?? 0));
  const {box} = boxes[0];
  await page.evaluate(() => { window.__benchmark.renders = []; });
  await cdp.send("Profiler.start");
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5);
  await page.mouse.down();
  for (let i = 0; i < 180; i++) {
    await page.mouse.move(box.x + box.width * (.4 + .2 * Math.sin(i / 15)), box.y + box.height * (.5 + .15 * Math.cos(i / 15)));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const rotationProfile = (await cdp.send("Profiler.stop")).profile;
  save("rotation-cpu", rotationProfile);
  const rotation = await page.evaluate(() => window.__benchmark.renders);
  const geometry = await page.evaluate(() => {
    let meshes = 0, vertices = 0, triangles = 0;
    window.__TSCIRCUIT_THREE_OBJECT.traverse(object => {
      if (!object.isMesh) return;
      meshes++; vertices += object.geometry.attributes.position.count;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    return {meshes, vertices, triangles};
  });
  await page.getByRole("tab", {name: "PCB", exact: true}).click();
  save("reopen-cpu", await begin());
  const reopenMs = await page.evaluate(() => window.__benchmark.readyMs);
  const percentile = (numbers, fraction) => [...numbers].sort((a, b) => a - b)[Math.floor((numbers.length - 1) * fraction)];
  const frames = rotation.map((render, i) => i ? render.start - rotation[i - 1].start : null).slice(1);
  const summary = {
    url, viewport: {width: 1280, height: 900, deviceScaleFactor: 2},
    readyMs: load.readyMs, reopenMs,
    rotation: {frames: rotation.length, medianFrameMs: percentile(frames, .5), p95FrameMs: percentile(frames, .95),
      medianRenderCpuMs: percentile(rotation.map(r => r.cpuMs), .5), p95RenderCpuMs: percentile(rotation.map(r => r.cpuMs), .95),
      medianDrawCalls: percentile(rotation.map(r => r.calls), .5)},
    geometry, errors,
    remoteModelRequests: network.filter(r => r.url.startsWith("https://modelcdn.tscircuit.com/")).length,
  };
  save("summary", summary); save("load", load); save("rotation", rotation); save("network", network);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await browser.close();
}
