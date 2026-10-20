import {afterEach, expect, test} from "bun:test";
import {mkdtempSync, rmSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshPhongMaterial,
  PerspectiveCamera, Scene, DirectionalLight} from "three";
import {mergeModelMaterials} from "../scripts/merge-model-materials.mjs";
import {cacheViewerShadows} from "../scripts/viewer-shadow-cache.mjs";
import {cachePreviewModels} from "../scripts/preview-model-cache.mjs";

const temporary = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, {recursive: true, force: true}); });

function triangles(mesh) {
  const result = [];
  const geometry = mesh.geometry, position = geometry.attributes.position;
  for (const group of geometry.groups) {
    const material = mesh.material[group.materialIndex];
    const properties = material.toJSON();
    delete properties.uuid;
    delete properties.name;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const triangle = [];
      for (let j = i; j < i + 3; j++) {
        const vertex = geometry.index?.getX(j) ?? j;
        triangle.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
      }
      result.push(JSON.stringify({triangle, properties}));
    }
  }
  return result.sort();
}

for (const indexed of [false, true]) test(`material batching preserves every colored triangle (${indexed ? "indexed" : "non-indexed"})`, () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(Array.from({length: 36}, (_, i) => i), 3));
  if (indexed) geometry.setIndex(Array.from({length: 12}, (_, i) => 11 - i));
  const red = new MeshPhongMaterial({color: "red", name: "lead 1"});
  const red2 = red.clone(); red2.name = "lead 2";
  const blue = new MeshPhongMaterial({color: "blue"});
  const blue2 = blue.clone(); blue2.name = "body duplicate";
  for (let i = 0; i < 4; i++) geometry.addGroup(i * 3, 3, i);
  const mesh = new Mesh(geometry, [red, blue, red2, blue2]);
  mesh.position.set(3, 4, 5); mesh.rotation.z = .4; mesh.scale.setScalar(2);
  const root = new Group(); root.add(mesh);
  const before = triangles(mesh), positions = mesh.geometry.attributes.position.array.slice();
  mergeModelMaterials(root);
  expect(mesh.material.length).toBe(2);
  expect(mesh.geometry.groups.length).toBe(2);
  expect(triangles(mesh)).toEqual(before);
  expect(mesh.geometry.attributes.position.array).toEqual(positions);
  expect(mesh.position.toArray()).toEqual([3, 4, 5]);
  expect(mesh.rotation.z).toBe(.4);
  expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
  expect(geometry.groups.length).toBe(4);
});

test("batching leaves transparent and partial geometry intact", () => {
  const geometry = new BoxGeometry();
  const material = new MeshPhongMaterial({transparent: true, opacity: .5});
  const mesh = new Mesh(geometry, Array.from({length: 6}, () => material.clone()));
  mergeModelMaterials(mesh);
  expect(mesh.geometry).toBe(geometry);
  mesh.material.forEach(m => { m.transparent = false; m.opacity = 1; });
  geometry.setDrawRange(0, 3);
  mergeModelMaterials(mesh);
  expect(mesh.geometry).toBe(geometry);
});

test("shadows survive camera movement and refresh after scene changes", () => {
  const scene = new Scene(), camera = new PerspectiveCamera();
  const mesh = new Mesh(new BoxGeometry(), new MeshPhongMaterial());
  const light = new DirectionalLight();
  mesh.castShadow = true; light.castShadow = true; scene.add(mesh, light);
  const renders = [];
  const renderer = {shadowMap: {}, domElement: {}, render(target, view) {
    renders.push({target, view, updated: this.shadowMap.needsUpdate});
    this.shadowMap.needsUpdate = false;
  }};
  cacheViewerShadows(renderer, scene);
  renderer.render(scene, camera);
  camera.position.x++;
  renderer.render(scene, camera);
  expect(renders.map(r => r.updated)).toEqual([true, false]);
  for (const change of [
    () => { mesh.position.x++; },
    () => { mesh.visible = false; },
    () => { mesh.material.opacity = .5; },
    () => { mesh.material = mesh.material.clone(); },
    () => { light.position.z++; },
    () => { mesh.geometry.attributes.position.needsUpdate = true; },
    () => { scene.remove(mesh); },
    () => { scene.add(mesh); },
  ]) {
    change();
    renderer.render(scene, camera);
    expect(renders.at(-1).updated).toBe(true);
    renderer.render(scene, camera);
    expect(renders.at(-1).updated).toBe(false);
  }
  expect(renders.every(r => r.target === scene && r.view === camera)).toBe(true);
});

test("model cache deduplicates requests, persists downloads, and preserves alignment", async () => {
  const dir = mkdtempSync(join(tmpdir(), "flamingo-model-cache-")); temporary.push(dir);
  const url = "https://modelcdn.tscircuit.com/easyeda_models/assets/C1.obj?uuid=a";
  const input = [1, 2].map(id => ({type: "cad_component", cad_component_id: String(id), model_obj_url: url,
    model_step_url: "https://example.com/fallback.step", rotation: {x: 0, y: 0, z: 90}, position: {x: 1, y: 2, z: .8}}));
  const original = structuredClone(input);
  let calls = 0;
  const fetchModel = async () => { calls++; return new Response("v 0 0 0\n"); };
  const view = await cachePreviewModels(input, dir, {fetchModel});
  expect(calls).toBe(1);
  expect(input).toEqual(original);
  expect(view[0].model_obj_url).toBe(view[1].model_obj_url);
  expect(view[0].rotation).toEqual(input[0].rotation);
  expect(view[0].position).toEqual(input[0].position);
  expect(view[0].model_step_url).toBe(input[0].model_step_url);
  const relative = view[0].model_obj_url.replace("/api/files/static/", "");
  expect(readFileSync(join(dir, relative), "utf8")).toBe("v 0 0 0\n");
  await cachePreviewModels(input, dir, {fetchModel});
  expect(calls).toBe(1);
});

test("model cache keeps remote fallback on failed requests", async () => {
  const dir = mkdtempSync(join(tmpdir(), "flamingo-model-cache-")); temporary.push(dir);
  const input = [{type: "cad_component", model_obj_url: "https://modelcdn.tscircuit.com/missing.obj"}];
  const view = await cachePreviewModels(input, dir, {fetchModel: async () => new Response("missing", {status: 404})});
  expect(view).toEqual(input);
});
