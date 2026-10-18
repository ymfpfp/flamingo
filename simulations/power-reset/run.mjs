import {Circuit} from "tscircuit";
import {createElement} from "react";
import PowerResetSimulation from "./PowerResetSimulation.tsx";
import {extractGraphs, analyze} from "./analyze.mjs";

export async function simulateScenario(engine, scenario) {
  let deck;
  const appliedOverrides = {};
  const circuit = new Circuit({platform: {spiceEngineMap: {ngspice: {
    async simulate(netlist) {
      // Read the public database directly inside the render callback. Calling
      // getCircuitJson here can initiate another render before the first settles.
      const parts = circuit.db.toArray().filter(e => e.type === "source_component");
      for (const [name, property, factor] of [["R_RST", "resistance", scenario.resetResistanceScale], ["C_RST", "capacitance", scenario.resetCapacitanceScale]]) {
        if (factor === undefined || factor === 1) continue;
        if (!Number.isFinite(factor) || factor <= 0) throw new Error("Invalid reset corner scale.");
        const original = parts.find(p => p.name === name)?.[property];
        if (!Number.isFinite(original) || original <= 0) throw new Error(`Missing reset value for ${name}.`);
        const pattern = new RegExp(`^(${name[0]}${name}\\s+\\S+\\s+\\S+\\s+)\\S+\\s*$`, "gm");
        if ([...netlist.matchAll(pattern)].length !== 1) throw new Error(`Cannot identify ${name} in the exported SPICE netlist.`);
        const value = original * factor;
        netlist = netlist.replace(pattern, (_, prefix) => `${prefix}${value}`);
        appliedOverrides[name] = {original, factor, simulatedValue: value, unit: property === "resistance" ? "ohm" : "F"};
      }
      deck = netlist;
      return engine.simulate(netlist);
    },
  }}}});
  circuit.pcbDisabled = true;
  circuit.schematicDisabled = true;
  circuit.add(createElement(PowerResetSimulation, {scenario}));
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const graphs = extractGraphs(json, scenario);
  if (!deck) throw new Error("tscircuit did not submit a SPICE netlist.");
  return {scenario, circuitJson: json, netlist: deck, graphs, analysis: {...analyze(graphs, scenario), appliedOverrides, assumptions: scenario.assumptions ?? []}};
}
