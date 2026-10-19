import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import Board, {getRenderedPlacementGroups, pcbGroupPlacements} from "../index.circuit";
import {applyPcbGroupPlacements} from "../lib/pcb-group-placement";
import {updatePlacementPreview} from "../scripts/placement-preview";
import {canReusePlacement, parsePlacementSource, placementLayoutKey} from "../scripts/preview-source.mjs";
import {getBoundsOfPcbElements} from "@tscircuit/circuit-json-util";

function parse(body) {
  return parsePlacementSource(`export const pcbGroupPlacements = ${body} satisfies Record<string, Placement>;\nconst unrelated = 1;`);
}

test("only literal X/Y changes qualify for cached placement", () => {
  const original = parse('{A: {pcbX: 1, pcbY: -2, pcbRotation: 90, offBoard: true}}');
  const moved = parse('{A: {pcbX: 5, pcbY: -4, pcbRotation: 90, offBoard: true}}');
  const cache = {version: 1, translationOnly: true, sourceHash: original.source, placements: original.placements, circuitJson: []};
  const input = parsed => ({sourceHash: parsed.source, placements: parsed.placements});
  assert.equal(canReusePlacement(cache, input(moved)), true);
  for (const changed of [
    '{A: {pcbX: 5, pcbY: -4, pcbRotation: 180, offBoard: true}}',
    '{A: {pcbX: 5, pcbY: -4, pcbRotation: 90, offBoard: false}}',
    '{A: {pcbX: 5, pcbY: -4, pcbRotation: 90, offBoard: true, pcbGrid: true}}',
    '{A: {pcbX: calculate(), pcbY: -4}}',
    '{A: {pcbX: NaN, pcbY: -4}}',
    '{A: {pcbX: 5, pcbY: -4}, B: {pcbX: 1, pcbY: 1}}',
  ]) assert.equal(canReusePlacement(cache, input(parse(changed))), false, changed);
  assert.equal(canReusePlacement({...cache, translationOnly: false}, input(moved)), false);
  assert.equal(canReusePlacement({...cache, circuitJson: [{type: "pcb_trace"}]}, input(moved)), false);
  assert.equal(canReusePlacement(cache, {...input(moved), sourceHash: "changed footprint"}), false);
  assert.equal(placementLayoutKey(original.placements), placementLayoutKey(moved.placements));
});

function rounded(value) {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === "number" ? Math.round(v * 1e7) / 1e7 : v));
}

test("placement updates discard stale clearance and keepout diagnostics", async () => {
  const circuitJson = ["pcb_pad_pad_clearance_error", "pcb_keepout_overlap_warning", "pcb_component_missing_courtyard_warning"]
    .map(type => ({type, message: "stale diagnostic", [`${type}_id`]: "stale"}));
  const updated = await updatePlacementPreview({circuitJson, groups: {members: {}, nativeGroupIds: {}, looseOffsets: {}}}, {});
  assert.equal(updated.some(e => e.message === "stale diagnostic"), false);
});

test("cached root and nested moves match a fresh circuit render", {timeout: 120000}, async () => {
  const render = async () => {
    const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
    circuit.add(Board());
    await circuit.renderUntilSettled();
    return {circuitJson: structuredClone(circuit.getCircuitJson()), groups: structuredClone(getRenderedPlacementGroups())};
  };
  const baseline = await render();
  const original = structuredClone(pcbGroupPlacements);
  const pcieSource = baseline.circuitJson.find(e => e.type === "source_component" && e.name === "PCIe");
  const pcie = baseline.circuitJson.find(e => e.type === "pcb_component" && e.source_component_id === pcieSource.source_component_id);
  const pcieBounds = getBoundsOfPcbElements(baseline.circuitJson.filter(e =>
    e.type === "pcb_component" && e.pcb_component_id === pcie.pcb_component_id
    || e.type.startsWith("pcb_courtyard_") && e.pcb_component_id === pcie.pcb_component_id,
  ).map(e => e.type === "pcb_component" ? {...e, rotation: 0} : e));
  assert.ok(Math.abs(pcieBounds.minX - original.PCIE_LINK.pcbX) < 1e-7, "rotated footprint must use the requested left anchor");
  assert.ok(Math.abs(pcieBounds.minY - original.PCIE_LINK.pcbY) < 1e-7, "rotated footprint must use the requested bottom anchor");
  const unchanged = structuredClone(baseline.circuitJson);
  applyPcbGroupPlacements(unchanged, original, baseline.groups);
  const geometry = json => json.filter(e => e.type.startsWith("pcb_") && !e.type.endsWith("_error") && !e.type.endsWith("_warning") || e.type === "cad_component");
  assert.deepEqual(rounded(geometry(unchanged)), rounded(geometry(baseline.circuitJson)), "reapplying anchors must not move geometry");

  const moved = structuredClone(original);
  moved.ATX.pcbX += 0.25;
  moved.ATX.pcbY += 0.5;
  moved.BRIDGE_CORE.pcbX += 7;
  moved["BRIDGE_CORE/OSCILLATOR"].pcbY += 3;
  moved.BRIDGE_UART.pcbX += 4; // Rotated loose parts, including their CAD models.
  moved.PCIE_LINK.pcbX += 2; // Mechanical zones must follow the connector and clip again.
  moved.PCIE_LINK.pcbY -= 1;
  const start = performance.now();
  const updated = await updatePlacementPreview(baseline, moved);
  console.log(`Cached preview including placement checks: ${Math.round(performance.now() - start)} ms`);
  const electricalAndSchematic = json => json.filter(e => e.type.startsWith("source_") || e.type.startsWith("schematic_"));
  assert.deepEqual(electricalAndSchematic(updated), electricalAndSchematic(baseline.circuitJson));
  try {
    for (const [name, placement] of Object.entries(moved)) Object.assign(pcbGroupPlacements[name], placement);
    const fresh = await render();
    assert.deepEqual(rounded(geometry(updated)), rounded(geometry(fresh.circuitJson)), "cached geometry must match a full render");
    // Starting from the cache for each update must avoid drift after repeated moves.
    const restored = await updatePlacementPreview(baseline, original);
    assert.deepEqual(rounded(geometry(restored)), rounded(geometry(baseline.circuitJson)));
  } finally {
    for (const [name, placement] of Object.entries(original)) Object.assign(pcbGroupPlacements[name], placement);
  }
});
