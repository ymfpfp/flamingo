import assert from "node:assert/strict";
import {test} from "node:test";
import {Children, isValidElement} from "react";
import {createEngine} from "../simulations/power-reset/engine.mjs";
import {simulateScenario} from "../simulations/power-reset/run.mjs";
import {scenarios, startupEnvelopeScenarios} from "../simulations/power-reset/scenarios";
import {valueAt, crossing, extractGraphs} from "../simulations/power-reset/analyze.mjs";
import Board from "../index.circuit";
import {BridgeReset} from "../components/BridgeReset";
import {BuckEnable} from "../components/BuckEnable";

const engine = await createEngine();
const runs = new Map();
// The ngspice WASM instance and fetch-cache adapter are intentionally serial.
for (const scenario of scenarios) runs.set(scenario.name, await simulateScenario(engine, scenario));
for (const scenario of startupEnvelopeScenarios) runs.set(scenario.name, await simulateScenario(engine, scenario));
const nominal = runs.get("nominal");
const result = (name, id) => runs.get(name).analysis.checks.find(c => c.id === id);

test("ngspice solves the production reset RC consistently with its analytical ramp response", () => {
  const parts = nominal.circuitJson.filter(e => e.type === "source_component");
  const resistance = parts.find(e => e.name === "R_RST").resistance;
  const capacitance = parts.find(e => e.name === "C_RST").capacitance;
  const tauMs = resistance * capacitance * 1000;
  const endOfRampV = 3.3 * (1 - tauMs / 2 * (1 - Math.exp(-2 / tauMs)));
  const expectedAt50Ms = 3.3 - (3.3 - endOfRampV) * Math.exp(-(50 - 5) / tauMs);
  assert.ok(Math.abs(valueAt(nominal.graphs.ASM_RST_N, 50) - expectedAt50Ms) < 0.001);
  const expectedHighMs = 5 - tauMs * Math.log((3.3 - 2) / (3.3 - endOfRampV));
  assert.ok(Math.abs(crossing(nominal.graphs.ASM_RST_N, 2) - expectedHighMs) < 0.1);
  assert.deepEqual(nominal.analysis.failed, []);
  assert.equal(result("nominal", "reset_during_rail_fault").status, "not_exercised");
});

test("the production board and simulation use the same reset and supervisor components", () => {
  const elements = [];
  function visit(node) {
    Children.forEach(node, child => {
      if (!isValidElement(child)) return;
      elements.push(child);
      visit(child.props.children);
    });
  }
  visit(Board());
  assert.equal(elements.filter(e => e.type === BridgeReset).length, 1);
  assert.equal(elements.filter(e => e.type === BuckEnable).length, 1);
  assert.equal(elements.find(e => e.type === BuckEnable).props.spiceModel, undefined);
  const modeled = nominal.circuitJson.filter(e => e.type === "source_component");
  for (const name of ["R_RST", "C_RST", "R_BUCK_EN_TOP", "R_BUCK_EN_BOTTOM", "R_BUCK_EN_PU", "C_BUCK_EN"]) {
    assert.equal(modeled.filter(e => e.name === name).length, 1, name);
  }
  assert.match(nominal.netlist, /RR_RST VCCH ASM_RST_N 100K/i);
  assert.match(nominal.netlist, /CC_RST ASM_RST_N 0 1U/i);
  assert.match(nominal.netlist, /VCCH VCCH_SENSE VCCH BUCK_EN \S+ 0 FLAMINGO_TPS389001/);
});

test("the approximate supervisor releases near its nominal threshold plus 25 us delay", async () => {
  const scenario = {...scenarios[0], name: "supervisor-detail", durationMs: 8, stepMs: 0.001};
  const run = await simulateScenario(engine, scenario);
  const thresholdTime = crossing(run.graphs.VCCH_SENSE, 1.157);
  const enableTime = crossing(run.graphs.BUCK_EN, 2);
  assert.ok(enableTime - thresholdTime > 0.020 && enableTime - thresholdTime < 0.035);
  assert.ok(valueAt(run.graphs.BUCK_EN, 4.7) < 0.01);
  assert.ok(valueAt(run.graphs.BUCK_EN, 5.1) > 3.2);
});

test("a missing core rail does not prevent the current RC from releasing bridge reset", () => {
  const run = runs.get("missing-vdd");
  assert.equal(valueAt(run.graphs.VDD, 200), 0);
  assert.ok(valueAt(run.graphs.ASM_RST_N, 200) > 2.7);
  assert.equal(result("missing-vdd", "tVCCH2VDD").status, "not_observed");
  assert.equal(result("missing-vdd", "reset_release_after_valid_rails").status, "fail");
});

test("a VDD waveform inside the datasheet arrival window can still miss the conservative reset goal", () => {
  assert.equal(result("vdd-within-datasheet-window", "tVCCH2VDD").status, "pass");
  assert.equal(result("vdd-within-datasheet-window", "reset_release_after_valid_rails").status, "fail");
});

test("a core-rail brownout leaves bridge reset high with VCCH present", () => {
  const run = runs.get("vdd-brownout");
  assert.equal(valueAt(run.graphs.VDD, 225), 0);
  assert.ok(valueAt(run.graphs.ASM_RST_N, 225) > 2.8);
  assert.equal(result("vdd-brownout", "reset_during_rail_fault").status, "fail");
});

test("the unclamped RC model retains reset charge across a short power cycle", () => {
  const run = runs.get("short-power-cycle");
  assert.equal(valueAt(run.graphs.VCCH, 260), 0);
  assert.ok(valueAt(run.graphs.ASM_RST_N, 260) > 1.37);
  assert.equal(result("short-power-cycle", "reset_during_rail_fault").status, "fail");
});

test("late rails and reversed ATX input order reach the relevant timing checks", () => {
  assert.equal(result("late-vccl", "tVCCH2VCCL").status, "fail");
  assert.equal(result("late-vdd", "tVCCH2VDD").status, "fail");
  assert.equal(result("late-atx-5v", "5v_before_vcch").status, "fail");
});

test("a 1 uA pull-up sensitivity run moves the reset threshold crossing earlier", () => {
  const run = runs.get("reset-pullup-leakage");
  assert.ok(crossing(run.graphs.ASM_RST_N, 1.58) < crossing(nominal.graphs.ASM_RST_N, 1.58));
});

test("missing and nonfinite simulation results cannot produce passing reports", () => {
  assert.throws(() => extractGraphs([], scenarios[0]), /Expected one/);
  const damaged = structuredClone(nominal.circuitJson);
  damaged.find(e => e.type === "simulation_transient_voltage_graph").voltage_levels[2] = NaN;
  assert.throws(() => extractGraphs(damaged, scenarios[0]), /Invalid or truncated/);
});

test("normal-startup envelope retains positive reset margin across 18 supply, ramp, and RC sensitivity cases", () => {
  assert.equal(startupEnvelopeScenarios.length, 18);
  for (const scenario of startupEnvelopeScenarios) {
    const run = runs.get(scenario.name);
    assert.deepEqual(run.analysis.failed, [], scenario.name);
    assert.ok(run.analysis.startupMarginMs > 0, scenario.name);
    if (scenario.resetCapacitanceScale === 0.5) {
      assert.equal(run.analysis.appliedOverrides.C_RST.simulatedValue, 0.5e-6);
      assert.match(run.netlist, /^CC_RST\s+\S+\s+\S+\s+5e-7$/m);
    }
  }
});
