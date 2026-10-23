import {layoutDigest} from "./layout-geometry.mjs";

// Restore only exact recorded moves before comparing the original assembly.
// This keeps the baseline useful and rejects any unrecorded placement drift.
export function checkAssemblyRework(placements, originalDigest, rework) {
  const failures = [], restored = structuredClone(placements);
  if (placements.some(p => p.layer !== "top")) failures.push("All assembled components must remain on top");
  if (new Set(placements.map(p => p.name)).size !== placements.length) failures.push("Duplicate assembled component names");
  const changes = rework?.changes ?? [];
  const additions = rework?.additions ?? [];
  if ((changes.length || additions.length) && !rework.authorized) failures.push("Component moves or additions are not authorized");
  if (new Set(changes.map(c => c.name)).size !== changes.length) failures.push("Duplicate component move records");
  if (new Set([...changes, ...additions].map(c => c.name)).size !== changes.length + additions.length) failures.push("Duplicate component rework records");
  for (const addition of additions) {
    const index = restored.findIndex(p => p.name === addition.name);
    if (index < 0 || addition.after?.name !== addition.name || addition.after.layer !== "top"
      || layoutDigest(restored[index]) !== layoutDigest(addition.after)) {
      failures.push(`Component addition does not match its exact record: ${addition.name}`);
      continue;
    }
    restored.splice(index, 1);
  }
  for (const change of changes) {
    const index = restored.findIndex(p => p.name === change.name);
    if (index < 0 || change.before?.name !== change.name || change.after?.name !== change.name
      || change.before.layer !== "top" || change.after.layer !== "top"
      || layoutDigest(restored[index]) !== layoutDigest(change.after)) {
      failures.push(`Component move does not match its exact record: ${change.name}`);
      continue;
    }
    restored[index] = change.before;
  }
  if (layoutDigest(restored) !== originalDigest) failures.push("Unrecorded assembled placement change");
  return failures;
}
