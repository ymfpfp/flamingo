import {test, expect} from 'bun:test';
import {sourceInterruption, restartSensitivityCases} from '../simulations/slot-power/restart-cases.mjs';

test('a 50 us interruption includes a real low interval and chronological edges', () => {
  const p = sourceInterruption({supplyV: 3.465, offMs: .05, endMs: 75});
  expect(p.every((q, i) => !i || q[0] > p[i - 1][0])).toBe(true);
  expect(p[3][1]).toBe(0);
  expect(p[4][1]).toBe(0);
  expect(p[4][0] - p[3][0]).toBeGreaterThan(0);
});

test('restart coverage includes sub-millisecond dips with both card-capacitance bounds', () => {
  const cases = restartSensitivityCases('3V3');
  for (const cardUF of [1000, 2000]) for (const sourceControl of ['stays-high', 'goes-low'])
    expect(cases.some(q => q.offMs < 1 && q.cardUF === cardUF && q.sourceControl === sourceControl)).toBe(true);
  expect(cases.some(q => q.lowFraction === .7 && q.temp === 125)).toBe(true);
  for (const q of cases) {
    const p = sourceInterruption({supplyV: 3.465, offMs: q.offMs, endMs: 80,
      lowFraction: q.lowFraction ?? 0});
    expect(p.every((v, i) => !i || v[0] > p[i - 1][0])).toBe(true);
  }
});
