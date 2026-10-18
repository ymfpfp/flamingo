import type {Point} from "./models";

export type Scenario = {
  name: string;
  description: string;
  durationMs: number;
  stepMs: number;
  rails: Record<"V5V" | "VCCH" | "VCCL" | "VDD", readonly Point[]>;
  resetLeakageUa?: number;
  resetResistanceScale?: number;
  resetCapacitanceScale?: number;
  assumptions?: string[];
};

const ramp = (volts: number, start: number, rise = 2): Point[] => [[0, 0], [start, 0], [start + rise, volts]];
const base = {V5V: ramp(5, 1, 1), VCCH: ramp(3.3, 3), VCCL: ramp(1.894214876, 5), VDD: ramp(1.130578512, 5)};
const cycle = (points: Point[]): Point[] => {
  const nominal = points[points.length - 1][1];
  return [...points, [250, nominal], [251, 0], [261, 0], [263, nominal]];
};
export const scenarios: Scenario[] = [
  {name: "nominal", description: "Illustrative startup; buck outputs are prescribed, not predicted.", durationMs: 300, stepMs: 0.05, rails: base},
  {name: "late-vccl", description: "VCCL reaches 90% after the ASMedia 10 ms limit.", durationMs: 300, stepMs: 0.05,
    rails: {...base, VCCL: ramp(1.894214876, 20)}},
  {name: "late-vdd", description: "VDD arrives after reset can deassert and after the 90 ms limit.", durationMs: 300, stepMs: 0.05,
    rails: {...base, VDD: ramp(1.130578512, 110, 5)}},
  {name: "missing-vdd", description: "VDD never starts, while VCCH and the reset RC start normally.", durationMs: 300, stepMs: 0.05,
    rails: {...base, VDD: [[0, 0], [300, 0]]}},
  {name: "vdd-brownout", description: "VDD collapses for 30 ms after startup; VCCH stays present.", durationMs: 350, stepMs: 0.05,
    rails: {...base, VDD: [...base.VDD, [220, 1.130578512], [221, 0], [251, 0], [253, 1.130578512]]}},
  {name: "short-power-cycle", description: "ATX rails turn off for 10 ms; reset capacitance retains charge.", durationMs: 400, stepMs: 0.05,
    rails: {V5V: cycle(base.V5V), VCCH: cycle(base.VCCH), VCCL: cycle(base.VCCL), VDD: cycle(base.VDD)}},
  {name: "slow-vcch", description: "VCCH takes 100 ms to rise; test rail timing and reset behavior.", durationMs: 400, stepMs: 0.05,
    rails: {...base, VCCH: ramp(3.3, 3, 100), VCCL: ramp(1.894214876, 95), VDD: ramp(1.130578512, 95)}},
  {name: "late-atx-5v", description: "ATX 3.3 V starts before 5 V; buck rails follow the late 5 V supply.", durationMs: 350, stepMs: 0.05,
    rails: {...base, V5V: ramp(5, 100), VCCL: ramp(1.894214876, 103), VDD: ramp(1.130578512, 103)}},
  {name: "reset-pullup-leakage", description: "A 1 uA source into reset bounds the datasheet pull-up leakage at VIN=0 only.", durationMs: 300, stepMs: 0.05,
    rails: base, resetLeakageUa: 1},
  {name: "vdd-within-datasheet-window", description: "VDD meets the 90 ms arrival window but starts after reset's earliest Schmitt threshold crossing.", durationMs: 300, stepMs: 0.05,
    rails: {...base, VDD: ramp(1.130578512, 84, 5)}},
];

/** Normal-startup sensitivity envelope; these are bounded test inputs, not a buck model. */
export const startupEnvelopeScenarios: Scenario[] = [0.95, 1, 1.05].flatMap(scale =>
  [0.2, 2, 20].flatMap(riseMs => [false, true].map(fastReset => {
    // Upper SENSE threshold and opposing +/-0.1% divider tolerances.
    const threshold = 1.157 * 1.01 * (1 + 16200 * 1.001 / (10000 * 0.999));
    const vcch = 3.3 * scale;
    const thresholdMs = 1 + riseMs * threshold / vcch;
    // Test assumptions: allow 1 ms after threshold for supervisor release,
    // then 4 ms delay plus a 1 ms ramp for each low-voltage rail.
    const outputStartMs = thresholdMs + 1 + 4;
    return {
      name: `startup-${Math.round(scale * 100)}pct-${riseMs}ms-${fastReset ? "half-c" : "nominal-rc"}`,
      description: `Matched ATX ramps, ${Math.round(scale * 100)}% supply voltage, ${riseMs} ms rise, ${fastReset ? "50% reset capacitance and -1% resistance" : "nominal reset RC"}.`,
      durationMs: 400, stepMs: 0.05,
      rails: {V5V: ramp(5 * scale, 1, riseMs), VCCH: ramp(vcch, 1, riseMs),
        VCCL: ramp(1.894214876, outputStartMs, 1), VDD: ramp(1.130578512, outputStartMs, 1)},
      resetResistanceScale: fastReset ? 0.99 : 1,
      resetCapacitanceScale: fastReset ? 0.5 : 1,
      assumptions: [
        "5 V and 3.3 V have matched start and rise times, with matching +/-5% endpoint variation.",
        "Supervisor release occurs within 1 ms of the calculated high threshold. This is a test allowance, not a datasheet maximum.",
        "Both buck outputs reach their targets within 5 ms after that release, with no overshoot.",
        "Reset effective capacitance is at least 0.5 uF. This is a sensitivity floor, not a guaranteed manufacturer limit.",
        "Bridge loading, regulator stability, input clamps and capacitor nonlinearities are not simulated.",
      ],
    } satisfies Scenario;
  })));
