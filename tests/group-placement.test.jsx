import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import Board, {pcbGroupPlacements} from "../index.circuit";
import {getBoundsOfPcbElements} from "@tscircuit/circuit-json-util";
import {Children, cloneElement, isValidElement} from "react";

// Keep the regression for the native group-anchor bug without a preview cache.
function placementOnly(node) {
  if (Array.isArray(node)) return node.map(placementOnly);
  if (!isValidElement(node)) return node;
  if (["trace", "bus", "differentialpair", "via", "copperpour", "autoroutingphase", "silkscreengraphic"].includes(node.type)) return null;
  return cloneElement(node, {}, Children.map(node.props.children, placementOnly));
}

test("rotated connector placement uses its actual bottom-left bounds", {timeout: 120000}, async () => {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDisabled: true}});
  circuit.schematicDisabled = true;
  circuit.add(placementOnly(Board()));
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const source = json.find(e => e.type === "source_component" && e.name === "PCIe");
  const connector = json.find(e => e.type === "pcb_component" && e.source_component_id === source.source_component_id);
  const bounds = getBoundsOfPcbElements(json.filter(e =>
    (e.type === "pcb_component" || e.type.startsWith("pcb_courtyard_"))
    && e.pcb_component_id === connector.pcb_component_id,
  ).map(e => e.type === "pcb_component" ? {...e, rotation: 0} : e));
  assert.ok(Math.abs(bounds.minX - pcbGroupPlacements.PCIE_LINK.pcbX) < 1e-7);
  assert.ok(Math.abs(bounds.minY - pcbGroupPlacements.PCIE_LINK.pcbY) < 1e-7);
  assert.equal(connector.layer, "top");
});
