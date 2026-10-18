# Gate-driver simulation

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
It applies the calculations in `lib/power-qualification.mjs` to two tscircuit behavioral switch models.
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
