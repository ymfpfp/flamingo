// Source interruptions must keep PWL times in chronological order even when
// the interruption is shorter than the nominal 100 us falling edge.
export function sourceInterruption({supplyV, offMs, endMs, lowFraction = 0}) {
  if (!(offMs > 0) || !(supplyV > 0) || lowFraction < 0 || lowFraction >= 1)
    throw Error('Invalid source interruption');
  const off = 40, restart = off + offMs;
  if (!(endMs > restart + .1)) throw Error('Source-cycle end precedes recovery');
  const fallMs = Math.min(.1, offMs / 3);
  return [[0, 0], [.1, supplyV], [off, supplyV],
    [off + fallMs, supplyV * lowFraction], [restart, supplyV * lowFraction],
    [restart + .1, supplyV], [endMs, supplyV]];
}

export function restartSensitivityCases(rail) {
  const cases = [];
  for (const offMs of [.05, .1, .2, .3, .5, .7, 1, 1.5, 2, 3, 5])
    for (const gateFactor of [.5, .8, 1.1]) for (const cardUF of [1000, 2000])
      for (const sourceControl of ['stays-high', 'goes-low'])
        cases.push({rail, kind: 'source-restart', offMs, gateFactor, cardUF,
          sourceControl, load: 'resistive', sensitivity: 'short-source-interruption'});
  for (const offMs of [.2, .5, 1, 5]) for (const lowFraction of [.5, .7])
    for (const temp of [85, 125])
      cases.push({rail, kind: 'source-restart', offMs, lowFraction, temp,
        sourceControl: 'stays-high', load: 'resistive', cardUF: 1000,
        sensitivity: 'partial-source-dip'});
  return cases;
}
