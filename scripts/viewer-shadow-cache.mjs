// Installed only on the PCB viewer's main renderer. Orbiting the camera cannot
// change a light's view of a stationary board, so reuse its shadow maps.
export function cacheViewerShadows(renderer, scene) {
  const objects = new WeakMap();
  const materials = new WeakMap();
  let previousCount = -1;
  const metrics = {renders: 0, shadowUpdates: 0};
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.domElement.flamingoMetrics = metrics;

  function changed(cache, object, values) {
    const previous = cache.get(object);
    if (!previous || values.some((value, index) => !Object.is(value, previous[index]))) {
      cache.set(object, values);
      return true;
    }
    return false;
  }

  const render = renderer.render;
  renderer.render = function (targetScene, camera) {
    if (targetScene === scene) {
      let dirty = false, count = 0;
      scene.traverse(object => {
        count++;
        const {position: p, quaternion: q, scale: s, geometry: g, shadow} = object;
        dirty = changed(objects, object, [
          p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z,
          object.visible, object.parent?.id, object.castShadow, object.receiveShadow,
          object.material?.id, Array.isArray(object.material) ? object.material.map(m => m.id).join(",") : null,
          g?.id, g?.attributes.position?.version, g?.index?.version,
          g?.drawRange.start, g?.drawRange.count,
          object.intensity, object.color?.getHex(), object.distance, object.angle,
          object.decay, object.penumbra, shadow?.bias, shadow?.normalBias,
          shadow?.mapSize.x, shadow?.mapSize.y,
        ]) || dirty;
        if (!object.material) return;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
          dirty = changed(materials, material, [
            material.version, material.visible, material.opacity, material.transparent,
            material.side, material.shadowSide, material.alphaTest,
            material.map?.id, material.map?.version,
            material.alphaMap?.id, material.alphaMap?.version,
            material.displacementMap?.id, material.displacementMap?.version,
          ]) || dirty;
        }
      });
      if (dirty || count !== previousCount) {
        renderer.shadowMap.needsUpdate = true;
        metrics.shadowUpdates++;
      }
      previousCount = count;
      metrics.renders++;
    }
    return render.call(this, targetScene, camera);
  };
}
