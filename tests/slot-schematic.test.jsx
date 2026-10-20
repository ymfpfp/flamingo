import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import {checkSchematicPlacement} from "@tscircuit/checks";
import {SlotPower} from "../components/SlotPower";

test("slot power shows three MOSFET terminals without PCB route labels", async () => {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, pcbDisabled: true}});
  circuit.add(<board><schematicsheet name="pcie"><SlotPower/></schematicsheet></board>);
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  assert.deepEqual(json.filter(e => e.type.endsWith("_error")), []);
  assert.deepEqual(checkSchematicPlacement(json), []);
  for (const [name, count] of [["Q_SLOT_3V3", 5], ["Q_SLOT_12V", 8]]) {
    const component = json.find(e => e.type === "source_component" && e.name === name);
    const ports = json.filter(e => e.type === "source_port" && e.source_component_id === component.source_component_id);
    assert.equal(ports.length, count, "all package terminals remain in the netlist");
    const ids = new Set(ports.map(p => p.source_port_id));
    const visible = json.filter(e => e.type === "schematic_port" && ids.has(e.source_port_id));
    assert.deepEqual(visible.map(p => p.pin_number).sort((a, b) => a - b), [1, 4, 5]);
    assert.ok(visible.every(p => p.is_connected));
  }
  assert.ok(json.some(e => e.type === "source_trace" && e.name === "SP_12V_GATE_OFF"),
    "saved PCB paths retain their source trace names");
  assert.ok(!json.some(e => e.type.startsWith("schematic_") && /SP_(3V3|12V|HDDPC)/.test(e.text ?? "")),
    "PCB identifiers must not create labels or dangling label stubs");
});
