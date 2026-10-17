import {Circuit} from "tscircuit";
import {createElement} from "react";
import PowerResetSimulation from "./PowerResetSimulation.tsx";
import {extractGraphs, analyze} from "./analyze.mjs";

export async function simulateScenario(engine, scenario) {
  let deck;
  const circuit = new Circuit({platform: {spiceEngineMap: {ngspice: {
    async simulate(netlist) { deck = netlist; return engine.simulate(netlist); },
  }}}});
  circuit.pcbDisabled = true;
  circuit.schematicDisabled = true;
  circuit.add(createElement(PowerResetSimulation, {scenario}));
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const graphs = extractGraphs(json, scenario);
  if (!deck) throw new Error("tscircuit did not submit a SPICE netlist.");
  return {scenario, circuitJson: json, netlist: deck, graphs, analysis: analyze(graphs, scenario)};
}
