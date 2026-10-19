import {writeFileSync} from "node:fs";
import {RootCircuit} from "tscircuit";
import Board, {getRenderedPlacementGroups, pcbGroupPlacements} from "../index.circuit.tsx";

// A separate process avoids module caches after changes to circuit source.
const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
const start = performance.now();
circuit.add(Board());
await circuit.renderUntilSettled();
writeFileSync(process.argv[2], JSON.stringify({
  version: 1,
  translationOnly: circuit._getBoard()?.props.routingDisabled === true,
  placements: pcbGroupPlacements,
  groups: getRenderedPlacementGroups(),
  circuitJson: circuit.getCircuitJson(),
}));
console.log(`Full preview build: ${Math.round(performance.now() - start)} ms`);
