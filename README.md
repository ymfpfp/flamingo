# Flamingo

Flamingo is a USB4/Thunderbolt-to-PCIe adapter project built around the ASMedia ASM2464PDX bridge.
The schematic and PCB use TypeScript and TSX with tscircuit.
The board uses an ATX power supply and a mechanical x16 slot with four connected PCIe lanes.

## Status

The schematic includes bridge supplies and decoupling, USB4 and PCIe connections, slot power switches, reset, and programming access.
Ground nets `GNDA` and `GND` connect to the ATX PSU COM pins.
Bridge decoupling parts and catalog footprints are selected.

The PCB configuration now specifies six layers and a thickness of 1.6 mm.
The bridge footprint and assembly process are candidates pending vendor acceptance.
Automatic packing supplies preliminary positions, and routing is disabled.
Hardware operation and throughput remain unmeasured.

[index.circuit.tsx](index.circuit.tsx) contains five schematic sheets:

| Sheet | Contents |
| --- | --- |
| `bridge` | ASM2464PDX, SPI flash, crystal, REXT, configuration resistors, reset, UART, and SPI access |
| `bridge_decoupling` | Capacitor banks for VCCH, VCCA33, VCCL, and VDD |
| `power` | ATX input, automatic PSU start, PSU status LED, buck converters, and enable supervisor |
| `usb` | USB-C receptacle, USB4 coupling and ESD protection, and VBUS sensing |
| `pcie` | PCIe x4 data and control signals, card presence, slot power switches, and slot decoupling |

## Development

Install dependencies:

```sh
bun install --frozen-lockfile
```

| Command | Purpose |
| --- | --- |
| `bun run dev` | Open the tscircuit development viewer |
| `bun run build` | Build the circuit from the selected local part definitions |
| `bun run build:supplier` | Check the optional supplier-enabled build; a USB cutout placement error remains open |
| `bun test ./tests` | Run the circuit tests |
| `bun run typecheck` | Run the TypeScript check |
| `bun run check:bga` | Audit the isolated bridge copper, mask, paste and local escape geometry |
| `bun run check:drc` | Build fresh PCB geometry and run the local JLCPCB checks |
| `bun run check:drc:routed` | Add routing connectivity checks |
| `bun run sim:setup` | Download and cache the pinned ngspice runtime once |
| `bun run sim:power-reset` | Run power/reset SPICE scenarios and write reports |
| `bun run check:slot-power` | Screen the original switches and report remaining startup checks |
| `bun run sim:slot-driver` | Check selected driver RC loading and compare the previous drivers |
| `bun run sim:check` | Run the scenarios and fail when electrical findings remain |
| `bun run audit:schematic` | Build the board and audit connectivity, BOM coverage, ratings, and datasheet hashes |
| `bun run snapshot` | Run the snapshot checks |
| `bun run snapshot:update` | Update the snapshots |

The tests cover bridge pins and footprints, ground connectivity, buck circuits, USB4, VBUS sensing, PCIe, and slot power.
Passing tests do not establish complete PCB connectivity, signal integrity, or hardware operation.
The SPICE tests require `bun run sim:setup` before their first run.

### Power/reset simulation

[simulations/power-reset/](simulations/power-reset/README.md) contains 28 tscircuit/ngspice scenarios.
They reuse the production reset RC and supervisor passive network, with an approximate supervisor model.
Buck outputs are prescribed waveforms; these tests do not simulate the TPS62903 regulators.
These 28 simulations do not check converter behavior, bridge firmware, or clocks.
The [original slot-switch review](docs/reviews/original-slot-switch-review-2026-10-18.md) screens conduction loss, gate timing, and startup stress.
NX3008NBK,215 drivers meet the low-voltage drive selection check. Power-switch startup SOA remains open.
Earlier protected-switch simulations do not apply.

The eighteen normal-startup sensitivity cases pass, with at least 16.8 ms of modeled reset margin under their stated assumptions.
The reference RC reset remains the baseline. Actual buck settling and capacitor behavior still require checks.
Deliberately failed-rail cases show the RC's limits; they do not establish a normal-startup defect.
Reports distinguish ASMedia timing limits from conservative project goals for reset behavior.
The simulation guide records model limitations, commands, and the next checks.

The [TPS62903 review](docs/reviews/tps62903-return-2026-10-18.md) records the current buck circuits and their selection limits.
The [power BOM closure report](docs/reviews/power-bom-closure-2026-10-16.md) records the filter analysis and the superseded protected-slot design.
The [original-switch review](docs/reviews/original-slot-switch-review-2026-10-18.md) records the current slot-power decision.
The earlier [schematic review](docs/reviews/schematic-review-2026-10-16.md) records connectivity coverage and historical findings.
The [layout BOM baseline](bom/layout-baseline.json) fixes selected parts and footprints for the first prototype.
Hardware qualification and the BGA fabrication decision remain open.

### JLCPCB design rules

[jlcpcb-clearance-rules.json](jlcpcb-clearance-rules.json) records the project rules and their source.
The rules assume six copper layers, 1 oz outer copper, ENIG, green mask, and Standard PCBA.
The proposed BGA-region through vias use epoxy filling and copper caps; vendor confirmation remains pending.
The board uses conservative 0.10 mm trace width and spacing targets.
JLCPCB lists 0.09 mm multilayer trace width and spacing, with local 3 mil traces in BGA fan-outs.
Those local limits remain reference values. They do not enable a routing exception.
See the [JLCPCB capabilities](https://jlcpcb.com/capabilities/pcb-capabilities).

The local checks cover circular bridge pads, trace widths, via dimensions, placement, and copper clearances.
Existing traces receive clearance checks even before routing is complete.
The routed command also checks missing connections.
Each command writes `dist/jlcpcb-drc.json` and exits with code 1 for detected errors.
To inspect an existing Circuit JSON file, run `bun run check:drc path/to/circuit.json`.

The bridge candidate has 196 circular lands at 0.20 mm diameter, meeting JLCPCB's published ENIG minimum.
Its 77 outer oblongs retain ASMedia's 7 × 13 mil dimensions and AA1 orientation.
Mask margins and 1:1 paste apertures are now explicit.
The proposed 0.06 mm local step stencil has a minimum calculated aperture area ratio of 0.833.
The [bridge process review](manufacturing/bridge-bga/README.md) records geometry, sources, and a draft vendor request.
**Vendor acceptance is pending; the bridge manufacturing gate remains open.**
ASMedia does not specify a circular land diameter in the available document.
Changing the circular lands does not establish solder-joint reliability or approve the custom mask/stencil process.
The exact dielectric stackup and impedance widths still need selection before routing.

The report keeps fabrication readiness separate from a geometry result.
An unrouted board cannot establish fabrication readiness.
The checks do not cover solder-mask registration, stencil apertures, impedance, current capacity, or every drill-to-copper rule.
Before fabrication, run the Gerber shorts check and obtain the JLCPCB DFM review.

## Main components

| Function | Selected part |
| --- | --- |
| USB4/Thunderbolt bridge | ASM2464PDX |
| SPI flash | W25Q32JVSSIQ |
| Crystal | XXCBCLNANF-25M, 25 MHz, with a 10 pF capacitor across XI/XO |
| USB-C receptacle | GT-USB-7087B, 24 contacts |
| PCIe slot | X1618WVS-164-9TV30, x16 SMT connector with lanes 0–3 connected |
| ATX input | Molex 39301240, 24 pins |
| Bridge buck supplies | Two TPS62903RPJR converters with 1 µH inductors |
| Buck enable supervisor | TPS389001DSER |
| Slot power switches | DMP2008UFG-7 for 3.3 V; AO4407A for 12 V; two NX3008NBK,215 gate drivers (JLCPCB C179399) |
| USB4 ESD clamps | Eight ESD150B1W0201E6327XTSA1 devices |
| PSU status indicator | SN74AHCT1G14DBVR and XL-1608UWC-04 white LED |

[imports/](imports/) contains the component definitions.
The following inventories record detailed part selections and reference substitutions:

- [Bridge decoupling parts](bridge-decoupling-parts.json): 44 capacitors and the VCCA33 supply link.
- [Slot power parts](slot-power-parts.json): Original P-channel switches, gate drivers, RC networks, discharge resistors, and slot decoupling.
- [Datasheet source index](datasheets/sources.json): document sources, hashes, selection notes, and earlier research.

These inventories and the table above do not replace a manufacturing bill of materials.

## Power and reset

The main ATX 3.3 V rail supplies `VCCH` and feeds `VCCA33` through a 0 Ω link.
The two buck converters use the main ATX 5 V rail.
ATX standby 5 V remains separate from the main 5 V rail.

| Bridge rail | Nominal voltage | Supply |
| --- | ---: | --- |
| `VCCH` | 3.3 V | Main ATX 3.3 V |
| `VCCA33` | 3.3 V | VCCH through a 0 Ω link |
| `VCCL` | 1.894 V | TPS62903 with 26.1 kΩ / 12.1 kΩ feedback divider |
| `VDD` | 1.131 V | TPS62903 with 10.7 kΩ / 12.1 kΩ feedback divider |

Both TPS62903 regulators use 2.5 MHz forced PWM, a 1 µH Coilcraft XGL4020-102MEC inductor, and two local 10 µF output capacitors.
Each 8.87 kΩ MODE resistor selects external feedback and disables active output discharge.
Including bridge decoupling, nominal capacitance is 74.20 µF for VCCL and 75.08 µF for VDD.
Both converters support up to 3 A. Actual bridge current remains unmeasured.

The static component calculation gives 1.8648–1.9239 V for VCCL and 1.1153–1.1459 V for VDD.
These intervals include feedback accuracy, divider tolerance, temperature drift, and feedback leakage.
PCB voltage drop, ripple, and load changes must fit the remaining margins of at least 14 mV.
The [TPS62903 review](docs/reviews/tps62903-return-2026-10-18.md) records the filter assumptions and remaining measurements.
The [reference-regulator review](docs/reviews/reference-buck-restoration-2026-10-18.md) records the earlier RT8059 and iD8225B evaluation.

The supervisor enables both bucks at approximately 3.031 V on rising `VCCH`.
Both `PG` outputs remain unused. Both `SS/TR` pins remain open for the fastest internal soft start.
[BridgeReset.tsx](components/BridgeReset.tsx) uses a 100 kΩ pull-up, a 1 µF capacitor, and a reset button.
This reset circuit does not monitor rail readiness.

The populated `R_PSU_ON` link connects ATX `PS_ON#` to ground for automatic PSU startup.
USB disconnection does not stop the PSU.
The white `PSU OK` LED indicates ATX `PWR_OK`, not local regulator readiness or a USB link.

[SlotPower.tsx](components/SlotPower.tsx) switches the slot 3.3 V and 12 V supplies from bridge `HDDPC`.
HDDPC high enables both supplies. HDDPC low disables both supplies.
Both paths use the original P-channel MOSFET switches and source-to-gate RC networks.
They have no local current limit, power limit, or fault latch.
The 75 W combined card budget remains a selection constraint rather than a circuit-enforced limit.
Independent conduction checks use 5.5 A at 12 V and 3 A at 3.3 V.
The [original-switch review](docs/reviews/original-slot-switch-review-2026-10-18.md) records the low-voltage driver substitution, conditional conduction margins, and open startup checks.
Install and remove cards with power off.
[SlotDecoupling.tsx](components/SlotDecoupling.tsx) connects the following capacitors from each switched output to `GND`:

| Slot rail | Bulk capacitor | Ceramic capacitors |
| --- | --- | --- |
| `SLOT_12V` | Panasonic 25SVPK470M, 470 µF, 25 V, ±20%, polymer | Two Samsung CL10B104KB8NNNC, 100 nF, 50 V, X7R, 0603 |
| `SLOT_3V3` | Chemi-Con APXJ6R3ARA561MF80G, 560 µF, 6.3 V, ±20%, polymer | One Samsung CL10B104KB8NNNC, 100 nF, 50 V, X7R, 0603 |

The nominal capacitances and quantities match ASMedia reference sheet 6.
Bulk positive terminals connect to the slot rails, and negative terminals connect to `GND`.
The Panasonic part uses the manufacturer F12 land dimensions. The Chemi-Con part uses the manufacturer F80 land dimensions.
The Panasonic ripple limit is 5 A at or below 105 °C and 1.59 A above 105 °C, at 100 kHz.
Its endurance rating is 1000 hours at 125 °C. Slot thermal and transient qualification remain incomplete.
Final placement belongs beside the slot power contacts, with short rail connections and nearby ground vias.
The local banks alone draw approximately 0.564 A at 12 V and 0.185 A at 3.3 V during a linear 10 ms ramp.
This example excludes card capacitance and load current.
The closure report includes startup and MOSFET safe-operating-area calculations with the reviewed card-capacitance allowance.
Measure gate completion, discharge, reset timing, temperature, and transients on the prototype.

PCIe `V3V3_AUX` is intentionally unconnected. Standby wake is not supported, and no auxiliary regulator is fitted.

## USB4 and PCIe

[Usb4Lanes.tsx](components/Usb4Lanes.tsx) includes four 220 nF TX capacitors and four 330 nF RX capacitors.
Each conductor has a separate ESD clamp on the bridge side and a 220 kΩ discharge resistor on the connector side.
All six connector shell contacts connect to `GND`.

The selected USB4 capacitors use 0201 packages and X5R dielectric.
This selection is accepted for the first prototype, although the ASMedia layout guideline specifies X7R.
RX initial tolerance spans 297–363 nF, before bias, temperature, and aging effects, against the specified 300–363 nF range.
Effective capacitance and channel performance still need checks before production.

[UsbVbusSense.tsx](components/UsbVbusSense.tsx) uses a 4.7 kΩ / 10 kΩ divider and a 1 µF filter capacitor.
Cable VBUS remains separate from the ATX rails.
Powered-off sensing and system protection performance remain unqualified.
Extra USB2 protection is deferred for this prototype.

The PCIe link includes eight Samsung CL05B224KO5NNNC transmitter capacitors: 220 nF, 16 V, X7R, 0402.
It also includes reference clock pair 0, reset, clock request, wake, and card presence.
The card supplies its own transmitter coupling capacitors.
The x16 connector provides four connected lanes. Firmware behavior, hot-plug operation, and measured throughput remain open work.

## Programming access

| Access | Pin order | Notes |
| --- | --- | --- |
| UART | GND, TX, RX | 3.3 V logic, board perspective, custom 2.54 mm footprint |
| SPI | RST_N, GND, V3V3, CS_N, CLK, MOSI, MISO | Programmer perspective, custom 1x7 footprint, 2.54 mm pitch |

Both access connectors use `doNotPlace` and provide unpopulated footprints.
UART adapter RX connects to board TX, and adapter TX connects to board RX.
SPI MOSI connects to flash DI, and MISO connects to flash DO.
The SPI header shares the bridge bus without a bus switch.
The adjacent RST_N and GND holes provide jumper access to hold the bridge in reset.
The V3V3 pin connects directly to the board supply.
For external programming, power the board normally and leave the programmer power output disconnected.
Bridge SPI output release during reset remains unverified and requires a hardware check before external programming.

## Remaining work

The buck-filter selections remain current. The original power switches use low-voltage drivers and require the startup checks in the current review.
Use the layout BOM baseline and carry these requirements into placement and prototype validation.

1. Check power sequencing, reset release, shutdown, and brownout behavior.
2. Place the selected buck filters correctly; measure startup, ripple, and load-step response on the prototype.
3. Check slot-switch startup/shutdown SOA, temperature, PSU fault clearing, and actual card capacitance.
4. Establish the bridge firmware and configuration, boot straps, and SPI programming isolation.
5. Check USB VBUS sensing with the bridge unpowered.
6. Freeze the board outline, connector positions, card support, mounting, stackup, impedance rules, and fabrication capabilities.
7. Check the custom bridge footprint and BGA escape plan before final placement.
   The 0.20 mm circular lands and mask/stencil proposal need written vendor acceptance before the bridge footprint is frozen.
8. Preserve passing schematic and netlist checks through placement, ground planes, routing, matching, and fabrication checks.
   The circular BGA size check now passes. The oblong and assembly-process review remains open; the PSU indicator clearance issue is corrected.
9. Check prototype power timing, USB attachment, PCIe enumeration, throughput, and temperature on hardware.
   Check part stock and assembly availability before an order.

## Design references

[datasheets/](datasheets/) retains current component documents, characteristics, and design references.
The [source index](datasheets/sources.json) preserves URLs and hashes for removed historical documents.

- [ASM2464PDX datasheet](datasheets/ASM2464PDX_DataSheet_R0_3.pdf)
- [ASMedia reference schematic](datasheets/ASM2464PDX_TI_R03.pdf)
- [ASMedia PCB guideline](datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf)
- [USB4 specification](datasheets/USB4-Specification-2.0-November-2025.pdf)
- [ATX power supply guide](datasheets/research/ATX-Power-Supply-Design-Guide.pdf)
- [Bridge footprint reference](https://github.com/openchips/JITx-ASM2464PDX_design/blob/main/components/Asmedia/ASM2464PDX.stanza)
