// EasyEDA models often assign a different material name to every lead, even
// when all material properties match. Batch those opaque triangles by material.
export function mergeModelMaterials(model) {
  model.traverse(mesh => {
    if (!mesh.isMesh || !Array.isArray(mesh.material)) return;
    const materials = mesh.material;
    if (materials.some(material => material.transparent || material.opacity < 1)) return;
    const geometry = mesh.geometry;
    const size = geometry.index?.count ?? geometry.attributes.position.count;
    let end = 0;
    // Preserve unusual/partial/overlapping draw groups without modification.
    for (const group of geometry.groups) {
      if (group.start !== end || group.count % 3 || !materials[group.materialIndex]) return;
      end += group.count;
    }
    if (end !== size || geometry.drawRange.start || geometry.drawRange.count < size) return;
    const signatures = new Map(), unique = [], remap = [];
    for (const material of materials) {
      const data = material.toJSON();
      delete data.uuid;
      delete data.name;
      const signature = JSON.stringify(data);
      let index = signatures.get(signature);
      if (index === undefined) {
        index = unique.length;
        signatures.set(signature, index);
        unique.push(material);
      }
      remap.push(index);
    }
    if (unique.length === materials.length) return;
    const batches = unique.map(() => []);
    for (const group of geometry.groups) {
      const batch = batches[remap[group.materialIndex]];
      for (let i = group.start; i < group.start + group.count; i++) {
        batch.push(geometry.index ? geometry.index.getX(i) : i);
      }
    }
    // Leave the original vertex attributes and triangle winding untouched.
    const batched = geometry.clone();
    batched.setIndex(batches.flat());
    batched.clearGroups();
    let start = 0;
    batches.forEach((batch, index) => {
      if (batch.length) batched.addGroup(start, batch.length, index);
      start += batch.length;
    });
    mesh.geometry = batched;
    mesh.material = unique;
  });
  return model;
}
