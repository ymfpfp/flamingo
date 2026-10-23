import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit, orderedRenderPhases} from "tscircuit";
import {configurePreviewPlatform} from "../lib/preview-platform";
import Board from "../index.circuit";

async function renderWithPartEngine(localOnly) {
  const calls = [];
  const circuit = new RootCircuit({platform: {partsEngine: {
    findPart: async () => { calls.push("findPart"); return {}; },
    fetchPartCircuitJson: async () => { calls.push("fetchPartCircuitJson"); return []; },
  }}});
  circuit.add(<board width={12} height={10} routingDisabled
    ref={board => { if (board && localOnly) configurePreviewPlatform(board); }}>
    <chip name="U1" footprint="soic8" manufacturerPartNumber="TEST_LOCAL_CHIP"
      supplierPartNumbers={{jlcpcb: ["C12345"]}}
      pinLabels={{pin1: "VCC", pin2: "GND"}}
      pinAttributes={{VCC: {requiresPower: true}, GND: {requiresGround: true}}}/>
  </board>);
  await circuit.renderUntilSettled();
  return {calls, json: circuit.getCircuitJson()};
}

test("local previews finish without supplier requests and retain authored geometry and BOM", async () => {
  const supplier = await renderWithPartEngine(false);
  assert.ok(supplier.calls.includes("fetchPartCircuitJson"), "fixture exercises the blocking metadata lookup");
  const local = await renderWithPartEngine(true);
  assert.deepEqual(local.calls, []);
  for (const type of ["pcb_component", "pcb_smtpad", "cad_component"]) {
    assert.deepEqual(local.json.filter(e => e.type === type), supplier.json.filter(e => e.type === type));
  }
  const chip = local.json.find(e => e.type === "source_component");
  assert.equal(chip.manufacturer_part_number, "TEST_LOCAL_CHIP");
  assert.deepEqual(chip.supplier_part_numbers, {jlcpcb: ["C12345"]});
});

test("the main preview is local and full builds can opt into supplier and copper checks", () => {
  for (const preview of [false, true]) {
    const circuit = new RootCircuit({platform: {partsEngineDisabled: false, routingDrcChecksDisabled: false}});
    circuit.add(Board({preview}));
    const board = circuit._getBoard();
    board.parent = circuit;
    board.runRenderPhaseForChildren(orderedRenderPhases[0]);
    assert.equal(circuit.platform.partsEngineDisabled, preview);
    assert.equal(circuit.platform.routingDrcChecksDisabled, preview);
  }
});
