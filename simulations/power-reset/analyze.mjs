import {readFileSync} from "node:fs";
export const requirements = JSON.parse(readFileSync(new URL("./requirements.json", import.meta.url), "utf8"));
const railNames = Object.keys(requirements.rails);
const nominal = {V5V: 5, ASM_RST_N: 3.3, ...Object.fromEntries(railNames.map(n => [n, requirements.rails[n].nominal]))};

export function extractGraphs(json, scenario) {
  const errors = json.filter(e => e.type.endsWith("_error"));
  if (errors.length) throw new Error(JSON.stringify(errors));
  return Object.fromEntries(["V5V", ...railNames, "ASM_RST_N", "BUCK_EN", "VCCH_SENSE"].map(name => {
    const graphs = json.filter(e => e.type === "simulation_transient_voltage_graph" && e.name === name);
    if (graphs.length !== 1) throw new Error(`Expected one ${name} waveform, received ${graphs.length}.`);
    const graph = graphs[0];
    const time = graph.timestamps_ms;
    const volts = graph.voltage_levels;
    if (!time || time.length !== volts?.length || time.length < 3 || time[0] !== 0 ||
        time[time.length - 1] < scenario.durationMs - 2 * scenario.stepMs ||
        !time.every((t, i) => Number.isFinite(t) && (i === 0 || t > time[i - 1])) ||
        !volts.every(Number.isFinite)) throw new Error(`Invalid or truncated ${name} waveform.`);
    return [name, {timeMs: time, volts}];
  }));
}

export function valueAt(graph, timeMs) {
  let lo = 0, hi = graph.timeMs.length - 1;
  if (timeMs < graph.timeMs[0] || timeMs > graph.timeMs[hi]) throw new Error("Requested time is outside the simulated waveform.");
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (graph.timeMs[mid] <= timeMs) lo = mid; else hi = mid;
  }
  const f = (timeMs - graph.timeMs[lo]) / (graph.timeMs[hi] - graph.timeMs[lo]);
  return graph.volts[lo] + f * (graph.volts[hi] - graph.volts[lo]);
}

export function crossing(graph, threshold) {
  for (let i = 1; i < graph.volts.length; i++) {
    if (graph.volts[i - 1] < threshold && graph.volts[i] >= threshold) {
      const f = (threshold - graph.volts[i - 1]) / (graph.volts[i] - graph.volts[i - 1]);
      return graph.timeMs[i - 1] + f * (graph.timeMs[i] - graph.timeMs[i - 1]);
    }
  }
  return null;
}

export function analyze(graphs, scenario) {
  const crossed90 = Object.fromEntries(Object.entries(nominal).map(([name, v]) => [name, crossing(graphs[name], 0.9 * v)]));
  const checks = requirements.timing.map(rule => {
    const from = crossed90[rule.from], to = crossed90[rule.to];
    const elapsed = from === null || to === null ? null : to - from;
    return {id: rule.id, category: "datasheet_timing_on_prescribed_rails", status: elapsed === null ? "not_observed" :
      (rule.min_ms !== undefined && elapsed < rule.min_ms - scenario.stepMs) ||
      (rule.max_ms !== undefined && elapsed > rule.max_ms + scenario.stepMs) ? "fail" : "pass",
      measuredMs: elapsed, minMs: rule.min_ms, maxMs: rule.max_ms};
  });
  const inputOrder = crossed90.V5V === null || crossed90.VCCH === null ? null : crossed90.VCCH - crossed90.V5V;
  checks.push({id: "5v_before_vcch", category: "datasheet_figure_order_on_prescribed_rails",
    status: inputOrder === null ? "not_observed" : inputOrder < -scenario.stepMs ? "fail" : "pass", measuredMs: inputOrder});
  const release = crossing(graphs.ASM_RST_N, requirements.reset.rising_threshold_min_v);
  const high = crossing(graphs.ASM_RST_N, requirements.reset.guaranteed_high_v);
  const allRailsValidMs = Math.max(...railNames.map(n => crossing(graphs[n], requirements.rails[n].min) ?? Infinity));
  const outside = t => railNames.filter(n => {
    const v = valueAt(graphs[n], t), r = requirements.rails[n];
    return v < r.min || v > r.max;
  });
  const times = graphs.ASM_RST_N.timeMs;
  // Check the complete uncertain transition window, not only one nominal threshold.
  const releaseTimes = release === null ? [] : [release, ...times.filter(t => t > release && (high === null || t <= high))];
  const unsafeRelease = releaseTimes.find(t => outside(t).length);
  checks.push({id: "reset_release_after_valid_rails", category: "engineering_goal",
    status: release === null ? "not_observed" : unsafeRelease !== undefined ? "fail" : "pass",
    earliestReleaseMs: release, guaranteedHighMs: high,
    firstViolationMs: unsafeRelease, invalidRails: unsafeRelease === undefined ? [] : outside(unsafeRelease)});

  let operated = false, faultExercised = false, faultStart = null, violation;
  for (const t of times) {
    const invalid = outside(t);
    if (!invalid.length) {
      if (valueAt(graphs.ASM_RST_N, t) >= requirements.reset.guaranteed_high_v) operated = true;
      faultStart = null;
    } else if (operated) {
      faultExercised = true;
      faultStart ??= t;
      if (t - faultStart >= requirements.engineering_goals.fault_response_allowance_ms &&
          valueAt(graphs.ASM_RST_N, t) > requirements.reset.guaranteed_low_v) {
        violation = {timeMs: t, faultStartMs: faultStart, invalidRails: invalid, resetV: valueAt(graphs.ASM_RST_N, t)};
        break;
      }
    }
  }
  checks.push({id: "reset_during_rail_fault", category: "engineering_goal",
    status: violation ? "fail" : !faultExercised ? "not_exercised" : "pass", violation});
  return {name: scenario.name, description: scenario.description, checks, crossed90Ms: crossed90,
    startupMarginMs: release === null || !Number.isFinite(allRailsValidMs) ? null : release - allRailsValidMs,
    buckEnableAt2VMs: crossing(graphs.BUCK_EN, 2),
    failed: checks.filter(c => c.status === "fail" || c.status === "not_observed").map(c => c.id)};
}
