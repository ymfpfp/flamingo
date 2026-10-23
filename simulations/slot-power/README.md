# Gate-driver simulation

## Same-footprint 12 V replacement study

The 22 October replacement study identifies Si4497DY-T1-GE3 as the preferred SO-8 candidate.
Its source, gate and drain pins match the existing AO4407A footprint.
The study uses the official Vishay electrical model and retains the original model archive.

The 23 October board applies Si4497DY-T1-GE3 and changes both 12 V gate resistors to 10 kohm.
It retains the exact original lands, placement, routing, 10 uF source-to-gate capacitor and NX3008NBK driver.
The 3.3 V switch and gate network remain unchanged.
The analytical and copper DC screens select electrical limits from the compiled MOSFET part number.
At 85 C preheat, control cycles with 1000 uF added card capacitance clear the full-duration estimated thermal bound.
The 125 C preheat cases and fast supply-return cases still need a circuit change or a narrower validated operating envelope.
This substitution does not resolve the existing 3.3 V hot turn-off issue.

```sh
SLOT_CONFIGS=dropin,rc5k,rc10k SLOT_REPLACEMENT_OUT=dist/slot-mosfet-focused-2026-10-22 bun simulations/slot-power/check-replacement.mjs --focus
SLOT_CONFIGS=rc10k SLOT_REPLACEMENT_OUT=dist/slot-mosfet-source-study-2026-10-22 bun simulations/slot-power/check-replacement.mjs --source-study
bun simulations/slot-power/check-replacement-numerics.mjs
MPLCONFIGDIR=/tmp/flamingo-mpl OPENBLAS_NUM_THREADS=1 /tmp/flamingo-pcie-si-venv/bin/python simulations/slot-power/render-replacement.py
```

The first study retains 138 cases. The second study adds 18 cases with a blocking supply diode.
The blocking diode checks a supply that cannot absorb reverse current. Its forward drop changes the delivered voltage.
The original study uses a stiff supply that can absorb current. Neither model represents a measured ATX supply.
Both studies identify retained gate charge during brief input interruptions.
The vendor model contains typical values. The hot SOA extension remains an engineering estimate.
Five finer-time-step checks compare peak power and peak current. All pass within 3%.
Charge-balance residuals remain below 0.25%.

The report appears in `dist/slot-mosfet-selection-2026-10-22/report.html`.
The permanent record is `manufacturing/slot-power-routing/mosfet-replacement-review-2026-10-22.json`.
The applied change and fresh validation are recorded in `manufacturing/slot-power-routing/si4497-swap-review-2026-10-23.json`.
The source manifest is `datasheets/research/slot-mosfet-startup-2026-10-22/source-manifest.json`.
Both studies save their exact runner as `runner.mjs` in their output folder.
The renderer checks the snapshot hashes against the recorded results.

## Startup and hot-restart SOA review

The 22 October review screens the pre-substitution power switches. It does not modify the circuit.
Its AO4407A runner intentionally rejects a Si4497DY board; use the saved pre-swap board for historical comparisons.

```sh
bun simulations/slot-power/check-startup-soa.mjs dist/board.circuit.json dist/slot-startup-soa-2026-10-22
OPENBLAS_NUM_THREADS=1 /tmp/flamingo-pcie-si-venv/bin/python simulations/slot-power/check-soa-ramp-envelope.py
bun simulations/slot-power/check-soa-timestep.mjs
MPLCONFIGDIR=/tmp/flamingo-mpl OPENBLAS_NUM_THREADS=1 /tmp/flamingo-pcie-si-venv/bin/python simulations/slot-power/render-startup-soa.py
```

The Python commands use the existing local scientific environment. NumPy and Matplotlib are required.
The report appears in `dist/slot-startup-soa-2026-10-22/report.html`.
The permanent decision record appears in `manufacturing/slot-power-routing/startup-soa-review-2026-10-22.json`.

The electrical cases include startup at 25°C, 85°C and 125°C.
Control cycles retain gate charge and capacitor charge across disable and re-enable.
Separate source cycles include a 100 µs supply ramp and an approximate driver body diode.
The main card-capacitance allowance is an assumed 1,000 µF per rail.
The two rail loads are independent stress cases. They do not permit more than 75 W combined card power.

The DMP2008UFG model comes from Diodes. Runtime adaptations retain the original vendor file.
The AO4407A model is an approximate transfer fit. It is not a manufacturer model.
The runner retains selected SPICE decks with the solver settings that completed each case.
The checks include capacitor charge balance, finer time steps, and independent prescribed output ramps.

The SOA screen uses equivalent pulse duration, log interpolation and temperature derating.
The manufacturer SOA curves refer to test boards at 25°C. Hot derating is an estimate.
The DMP2008UFG curve uses -8 V gate drive. This board provides approximately -3.3 V.
These differences prevent a guaranteed hot-SOA claim for the assembled board.
Fixed-temperature models omit electrothermal feedback and accumulated heat from repeated cycles.
Source-cycle reverse current depends on an assumed supply that can absorb current.
The forward SOA check does not qualify body-diode pulses, auxiliary-power backfeed, live insertion, or hard shorts.

The review recommends a change to the 12 V switching path before Rev 1 fabrication.
The existing slow turn-off also needs a faster path or an operating restriction for hot control cycles.
The circuit remains unchanged until that separate design work occurs.

`bun run sim:slot-driver` tests the selected NX3008NBK drivers with the compiled gate RC values and retains historical 2N7002K comparisons.
The runner uses a 2.8 ohm on-state envelope with a conservative 10 mA sink ceiling.
This avoids extrapolating the 1.8 V / 10 mA / 25 C resistance limit to the initial 25 mA ideal demand.
The envelope assumes monotonic conduction above the specified operating point.
A separate 5.6 ohm case checks resistance sensitivity; it is not a guaranteed hot limit.
The historical comparisons use the Diodes model and an explicitly labeled threshold-fit sensitivity variant.
The 28 cases sweep control voltage from 2.4 V to 3.3 V at 25 C.
Each run applies control at 1 ms and removes it at 100 ms.
Results and generated SPICE decks appear in `dist/slot-power/driver/`.

The selected on-state envelope drives both gates at 2.4 V control. It does not validate off-state subthreshold behavior.
The historical 2N7002K model drives the gates at 3.3 V control and leaves them off at 2.4 V control.
Its VTO parameter differs from the datasheet threshold test definition.
The threshold-fit sensitivity also shows substantial delay on the 12 V gate at 2.4 V control.
These results identify sensitivity. They do not prove physical failure or qualify power-MOSFET startup SOA.
The [current review](../../docs/reviews/original-slot-switch-review-2026-10-18.md) explains the result and its limits.

## Historical protected-slot simulations

The original discrete switches replaced this active-protection design on 2026-10-18.
The runner and behavioral switch model are retired.
The following results describe the superseded topology and do not qualify the current switches.

Current review: [original slot switches](../../docs/reviews/original-slot-switch-review-2026-10-18.md).
Current command: `bun run build` followed by `bun run check:slot-power`.
The retained vendor-model files are research material.

# Slot-power startup envelope

The following description records the retired simulation. Its command is no longer available.

The runner reads the actual compiled BOM from `dist/index/circuit.json`.
It applies the calculations in `tests/audits/power-qualification.mjs` to two tscircuit behavioral switch models.
The pinned ngspice engine runs 12 combinations: supply ±5% and nominal, idle/full rail stress load, and 0/1,000 µF added card capacitance.
Each output must settle within 60 ms. The separate analytical checks compare 12 V startup against its minimum fault timer.
Results, generated SPICE decks, and simulation Circuit JSON appear in `dist/slot-power/`.

The user selected a 75 W combined steady card budget.
Applying 5.5 A at 12 V and 3 A at 3.3 V simultaneously exceeds that budget and provides a conservative independent-rail stress case.
The 1,000 µF effective card capacitance per rail is an engineering assumption, not a verified property of an unspecified card.

The models impose minimum current/power limits and the slowest calculated 3.3 V slew.
They do not model controller internals, converter regulation, gate charge, cable inductance, fault latch timing, or temperature.
They cannot establish hot-start reliability or arbitrary card compatibility.
The [closure report](../../docs/reviews/power-bom-closure-2026-10-16.md) records separate SOA, timing, and thermal calculations and required bench tests.

## Vendor-model evaluation

`vendor/tps24720_trans.lib` is the unmodified TI unencrypted PSpice transient model from SLVM222B.
Its copyright and license notices are retained.
Source: [TI SLVM222B model package](https://www.ti.com/lit/zip/slvm222).
The exact model hash is recorded in [model-sources.json](model-sources.json).

A direct test with the project's ngspice engine fails with `Undefined parameter [_u2_u625]`.
The vendor model therefore contributes no passing result to this review.
A future adaptation needs explicit PSpice-compatibility validation before its waveforms can support electrical decisions.
The 12 successful runs use the documented behavioral envelope instead.
