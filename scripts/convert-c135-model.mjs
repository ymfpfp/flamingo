import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {Box3, Float32BufferAttribute, FrontSide, Group, Mesh, MeshStandardMaterial, Vector3} from "three";
import {VRMLLoader} from "three/examples/jsm/loaders/VRMLLoader.js";
import {GLTFExporter} from "three/examples/jsm/exporters/GLTFExporter.js";

// GLTFExporter uses the browser FileReader API for its binary buffer.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(result => {
      this.result = result;
      this.onloadend?.();
    }).catch(error => this.onerror?.(error));
  }
};

const modelFile = name => fileURLToPath(new URL(`../models/${name}`, import.meta.url));
const sourceScene = new VRMLLoader().parse(
  readFileSync(modelFile("C135-CP_Elec_6.3x7.7.wrl"), "utf8"), "",
);
// Export a Group: glTF scenes themselves cannot carry a transform.
const scene = new Group();
scene.add(...sourceScene.children);
// KiCad VRML units are 0.1 inch. Preserve the original model's dimensions.
scene.scale.setScalar(2.54);
scene.updateMatrixWorld(true);
const nativeBounds = new Box3().setFromObject(scene);
console.log(JSON.stringify({
  nativeBoundsMm: {min: nativeBounds.min.toArray(), max: nativeBounds.max.toArray()},
  sizeMm: nativeBounds.getSize(new Vector3()).toArray(),
}));

scene.traverse(object => {
  if (!object.isMesh) return;
  const material = object.material;
  const isMetal = material.color.r > 0.3;
  object.material = new MeshStandardMaterial({
    color: material.color,
    metalness: isMetal ? 0.75 : 0,
    roughness: isMetal ? 0.32 : 0.65,
    side: material.side,
  });
});
// glTF uses Y up: native +Z becomes +Y, and native +Y becomes -Z.
scene.rotation.x = -Math.PI / 2;
scene.updateMatrixWorld(true);
// Bake transforms into vertices for viewers that do not read glTF node matrices.
const bakedModel = new Group();
scene.traverse(object => {
  if (object.isMesh) {
    const transformed = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    // The circuit renderer drops glTF's doubleSided flag. Encode both windings
    // so that KiCad's two-sided surfaces remain visible after that conversion.
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.getAttribute(name);
      const values = Array.from(attribute.array);
      const reverse = [];
      for (let vertex = 0; vertex < attribute.count; vertex += 3) {
        for (const corner of [2, 1, 0]) {
          for (let axis = 0; axis < attribute.itemSize; axis++) {
            const value = attribute.array[(vertex + corner) * attribute.itemSize + axis];
            reverse.push(name === "normal" ? -value : value);
          }
        }
      }
      geometry.setAttribute(name, new Float32BufferAttribute([...values, ...reverse], attribute.itemSize));
    }
    object.material.side = FrontSide;
    bakedModel.add(new Mesh(geometry, object.material));
  }
});
const glb = await new GLTFExporter().parseAsync(bakedModel, {binary: true});
writeFileSync(modelFile("C135-CP_Elec_6.3x7.7.glb"), new Uint8Array(glb));
