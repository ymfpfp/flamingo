import type {AnyCircuitElement} from "circuit-json";
import {categorizeErrorOrWarning} from "@tscircuit/circuit-json-util";
import {runAllPlacementChecks} from "@tscircuit/checks";
import {applyPcbGroupPlacements, type PcbGroupPlacement, type PcbPlacementGroups} from "../lib/pcb-group-placement";

// These placement results are not categorized by the installed utility yet.
const additionalPlacementTypes = new Set([
  "pcb_pad_pad_clearance_error", "pcb_keepout_overlap_warning", "pcb_component_missing_courtyard_warning",
]);

export async function updatePlacementPreview(cache: {
  circuitJson: AnyCircuitElement[];
  groups: PcbPlacementGroups;
}, placements: Record<string, PcbGroupPlacement>) {
  const json = structuredClone(cache.circuitJson).filter(e =>
    !(e.type.endsWith("_error") || e.type.endsWith("_warning"))
      || (categorizeErrorOrWarning(e) !== "placement" && !additionalPlacementTypes.has(e.type)),
  );
  applyPcbGroupPlacements(json, placements, cache.groups);
  // Keep diagnostics current instead of carrying the previous position's errors.
  const diagnostics = await runAllPlacementChecks(json);
  for (const [index, diagnostic] of diagnostics.entries()) {
    const idKey = `${diagnostic.type}_id`;
    json.push({[idKey]: `preview_${index}`, ...diagnostic} as AnyCircuitElement);
  }
  return json;
}
