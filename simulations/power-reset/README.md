# Power and reset simulation

This directory contains tscircuit SPICE experiments for the bridge power and reset circuits.
The experiments use the ngspice engine through tscircuit's simulation API.
They reuse the production `BridgeReset` and `BuckEnable` components.
The optional `spiceModel` property on `BuckEnable` changes simulation behavior only.

## Run the simulations

After dependency installation, download the pinned runtime once:

```sh
bun run sim:setup
```

This command requires network access and downloads approximately 21 MB.
The runtime stays in the ignored `.tscircuit/spice/` directory.
The runner checks its SHA-256 hash before use.
Subsequent simulations run without network access.

Run all 28 scenarios:

```sh
bun run sim:power-reset
```

This command exits successfully when simulation and report generation succeed.
Electrical findings remain visible in the report.
For an exit code of 1 when findings remain, run:

```sh
bun run sim:check
```

This strict report mode also flags deliberately invalid supply stimuli.
It is not a complete board-acceptance test or a CI readiness gate.

Run the regression tests:

```sh
bun test ./tests/power-reset-simulation.test.jsx
```

The tests check analytical RC behavior, model integration, and detection of known circuit limitations.
Passing tests do not mean that the electrical design passes every scenario.

## Outputs

The runner writes these files under `dist/power-reset/`:

- `report.json`: requirements, measured timing intervals, and findings.
- `report.md`: a readable summary of every check.
- `<scenario>.cir`: the actual SPICE netlist submitted by tscircuit.
- `<scenario>.simulation.json`: the nominal circuit and simulation results.
- `<scenario>.waveforms.json`: named voltage samples and timestamps in milliseconds.

The output directory is ignored by Git.
The `.simulation.json` suffix prevents the CLI from discovering the reports as additional circuit entrypoints.
The project build command also names `index.circuit.tsx` explicitly.

Corner runs change `R_RST` and `C_RST` values in the exported SPICE netlist before execution.
The report records each original value, scale factor, and simulated value.
The Circuit JSON retains nominal component values so it still identifies the production parts.
The submitted `.cir` file records the actual values used for that run.

For plots, install Matplotlib in a Python environment, then run:

```sh
python3 scripts/plot-power-reset.py
```

The plot script writes `sequencing.png` and `sequencing.svg` beside the reports.
Matplotlib is optional. The simulation runner does not require Python.

## Model scope

The reset resistor, capacitor, supervisor divider, pull-up, and bypass capacitor come from the production components.
The supervisor model approximates nominal thresholds, hysteresis, open-drain behavior, and its 25 us release delay.
It is a project model, not a TI model.
Its internal timer is a numerical approximation, not an additional BOM capacitor.

Each supply uses an ideal piecewise-linear source.
In particular, `VCCL` and `VDD` are prescribed waveforms, not simulated TPS62903 outputs.
`BUCK_EN` does not generate these waveforms.
The nominal rail values match the selected feedback dividers.
Changes to those dividers require corresponding changes to the prescribed scenarios.
`VCCA33` is assumed equal to `VCCH` through its zero-ohm link.
These experiments omit supply wiring impedance and capacitor charging currents.

The TPS62903 vendor library uses Cadence encryption and cannot run in ngspice.
[model-sources.json](model-sources.json) records the archive URL, hash, and model limitations.
An unencrypted compatible model is necessary for converter-level checks.
A separately checked behavioral converter model is another option, with a narrower scope.

The bridge has no behavioral model in these experiments.
The reset input has no clamp or internal pull-up model.
Its input does not load the reset RC, except in the separate leakage sensitivity scenario.
That scenario applies a constant 1 uA source into reset.
The datasheet specifies this leakage only at zero input voltage, so the scenario is a sensitivity check.

The reset button is not operated in these experiments.
The experiments also omit firmware, clock generation, PCIe reset, slot switches, and card loads.
Component tolerance and effective-capacitance sweeps remain open work.

## Requirements and interpretation

[requirements.json](requirements.json) records voltage ranges and timing limits from the ASMedia datasheet.
Sections 6.2, 6.3.7, and 7 supply these limits.
The runner measures startup timing at 90% of nominal voltage, as specified in section 7.
It uses main ATX 5 V for the figure's `5V or VBUS` source.
The separate input-order check follows Figure 4; the table gives no explicit minimum for `t5V2VCCH`.

Two additional checks are conservative project goals:

1. All bridge rails are valid from the earliest possible reset release until the reset input reaches its guaranteed-high voltage.
2. After initial operation, reset becomes guaranteed low within 1 ms of a rail fault.

These goals are not additional timing limits quoted from ASMedia.
The 1 ms fault allowance is an initial review target.
The reset circuit must be reviewed against the actual bridge requirements before a schematic change.

Results use four states:

| State | Meaning |
| --- | --- |
| `pass` | The modeled waveform meets the applicable check. |
| `fail` | The modeled waveform violates the check. |
| `not_observed` | A required startup event does not occur within the simulation window. |
| `not_exercised` | The scenario does not exercise an operational rail fault. |

Missing, truncated, nonfinite, or erroneous simulator results stop the runner.
Normal scenarios use 50 us output spacing.
The supervisor regression uses 1 us spacing to check its approximate release delay.
These are requested output intervals, not guaranteed internal solver steps.

## Initial findings

The following results use the nominal 100 kohm resistor and 1 uF capacitor.
The illustrative VCCH ramp rises from zero to 3.3 V between 3 ms and 5 ms.

| Scenario | Result |
| --- | --- |
| Nominal startup | The possible reset-release threshold crosses at about 69.2 ms. The input reaches 2.0 V at about 97.2 ms. |
| Late VCCL | The prescribed arrival misses the 10 ms limit. |
| Late VDD | The prescribed arrival misses the 90 ms limit and trails possible reset release. |
| Missing VDD | Reset still rises, although the core rail remains at zero. |
| VDD brownout | Reset stays high because its RC supply remains present. |
| Short power cycle | The unclamped RC retains charge across the 10 ms outage. Actual input-clamp behavior remains unknown. |
| Slow VCCH | The prescribed ramp misses the 5 V-to-VCCH timing limit. |
| Late ATX 5 V | The prescribed input order and low-voltage rail timing fail the startup checks. |
| Reset leakage sensitivity | A 1 uA pull-up moves possible reset release earlier. |
| VDD within its arrival window | VDD meets the 90 ms limit but arrives after possible reset release. The conservative project goal fails. |

The RC time constant is 100 ms. It is not a guaranteed 100 ms reset hold time.
The results support further review of rail-qualified reset control.
They do not establish a particular replacement circuit or qualify the board.

## Next checks

1. Check the normal-startup assumptions against the actual PSU, capacitor, and regulator behavior before changing the reference reset circuit.
2. Obtain a compatible buck model, then connect output behavior to the actual enable circuit and complete capacitor banks.
3. Add component tolerances, effective capacitance, supply variation, and bridge input leakage or clamp information.
4. Add reset-button, extended shutdown, brownout, and restart scenarios with those models.
5. Extend the experiments to slot power and externally specified PCIe reset timing.
6. Check model predictions against prototype measurements.

## Normal-startup sensitivity review, 2026-10-16

Eighteen additional cases check supply voltage at 95%, 100%, and 105% of nominal.
Each case uses matched 5 V and 3.3 V ramps of 0.2 ms, 2 ms, or 20 ms.
Each ramp runs with nominal reset RC values and with 99 kohm plus 0.5 uF.
The half-capacitance case is a sensitivity test, not a guaranteed capacitance bound.

The prescribed outputs allow 1 ms for supervisor release and 5 ms for buck startup and settling.
The supervisor threshold includes its positive accuracy limit and opposing divider tolerances.
The 1 ms allowance is a test assumption because the available supervisor timing table does not supply a maximum release delay.
The 5 ms settling allowance also requires verification under the real bridge load.

All eighteen cases pass the implemented startup checks.
The smallest modeled interval between all rails becoming valid and possible reset release is approximately 16.8 ms.
This result supports retaining the reference RC during the schematic review.
It does not qualify actual regulator stability, firmware behavior, or supply-fault recovery.
