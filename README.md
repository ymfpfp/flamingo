# Flamingo

Flamingo is a USB4/Thunderbolt-to-PCIe adapter project built around the ASMedia ASM2464PDX bridge.
The schematic and PCB use TypeScript and TSX with tscircuit.
The board uses an ATX power supply and a mechanical x16 slot with four connected PCIe lanes.

## Status

The schematic includes bridge supplies and decoupling, USB4 and PCIe connections, slot power switches, reset, and programming access.
Ground nets `GNDA` and `GND` connect to the ATX PSU COM pins.
Bridge decoupling parts and catalog footprints are selected.

The PCB configuration specifies four layers and a thickness of 1.6 mm.
Automatic packing supplies preliminary positions, and routing is disabled.
Hardware operation and throughput remain unmeasured.

[index.circuit.tsx](index.circuit.tsx) contains five schematic sheets:

| Sheet | Contents |
| --- | --- |
| `bridge` | ASM2464PDX, SPI flash, crystal, REXT, configuration resistors, reset, UART, and SPI access |
| `bridge_decoupling` | Capacitor banks for VCCH, VCCA33, VCCL, and VDD |
| `power` | ATX input, automatic PSU start, PSU status LED, buck converters, and enable supervisor |
| `usb` | USB-C receptacle, USB4 coupling and ESD protection, and VBUS sensing |
| `pcie` | PCIe x4 data and control signals, card presence, and slot power switches |

## Development

Install dependencies:

```sh
bun install --frozen-lockfile
```

| Command | Purpose |
| --- | --- |
| `bun run dev` | Open the tscircuit development viewer |
| `bun run build` | Build the circuit and generate previews |
| `bun test ./tests` | Run the circuit tests |
| `bun run typecheck` | Run the TypeScript check |
| `bun run check:drc` | Build fresh PCB geometry and run the local JLCPCB checks |
| `bun run check:drc:routed` | Add routing connectivity checks |
| `bun run snapshot` | Run the snapshot checks |
| `bun run snapshot:update` | Update the snapshots |

The tests cover bridge pins and footprints, ground connectivity, buck circuits, USB4, VBUS sensing, PCIe, and slot power.
Passing tests do not establish complete PCB connectivity, signal integrity, or hardware operation.

### JLCPCB design rules

[jlcpcb-clearance-rules.json](jlcpcb-clearance-rules.json) records the project rules and their source.
The rules assume four copper layers, 1 oz outer copper, ENIG, and Standard PCBA.
The board uses conservative 0.10 mm trace width and spacing targets.
JLCPCB lists 0.09 mm multilayer trace width and spacing, with local 3 mil traces in BGA fan-outs.
Those local limits remain reference values. They do not enable a routing exception.
See the [JLCPCB capabilities](https://jlcpcb.com/capabilities/pcb-capabilities).

The local checks cover circular bridge pads, trace widths, via dimensions, placement, and copper clearances.
Existing traces receive clearance checks even before routing is complete.
The routed command also checks missing connections.
Each command writes `dist/jlcpcb-drc.json` and exits with code 1 for detected errors.
To inspect an existing Circuit JSON file, run `bun run check:drc path/to/circuit.json`.

The current bridge has 196 circular pads with a 0.18 mm diameter.
These pads fail the 0.20 mm minimum in the general JLCPCB capabilities table.
The 77 oblong pads receive a separate process-review warning.
That warning requires JLCPCB acceptance of the exact copper, mask, and stencil geometry.
The local checks do not establish assembly reliability or resolve the separate four-layer BGA process limits.

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
| Bridge buck supplies | Two TPS62903RPJR converters with SLW5040S2R2MST 2.2 µH inductors |
| Buck enable supervisor | TPS389001DSET |
| Slot power switches | DMP2008UFG-7 for 3.3 V and AO4407A for 12 V, with 2N7002K-7 drivers |
| USB4 ESD clamps | Eight ESD150B1W0201E6327XTSA1 devices |
| PSU status indicator | SN74AHCT1G14DBVR and XL-1608UWC-04 white LED |

[imports/](imports/) contains the component definitions.
The following inventories record detailed part selections and reference substitutions:

- [Bridge decoupling parts](bridge-decoupling-parts.json): 44 capacitors and the VCCA33 supply link.
- [Slot power parts](slot-power-parts.json): MOSFETs, gate networks, discharge resistors, and slot decoupling.
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

Each buck uses external feedback, 1 MHz forced PWM, a 2.2 µH inductor, and a local 22 µF output capacitor.
The bridge decoupling banks add capacitance to these outputs.
Complete output-bank compatibility and startup behavior still need checks.

The supervisor enables both bucks at approximately 3.031 V on rising `VCCH`.
Both buck `PG` outputs remain unused, and their `SS/TR` pins remain open for fastest startup.
[BridgeReset.tsx](components/BridgeReset.tsx) uses a 100 kΩ pull-up, a 1 µF capacitor, and a reset button.
This reset circuit does not monitor rail readiness.

The populated `R_PSU_ON` link connects ATX `PS_ON#` to ground for automatic PSU startup.
USB disconnection does not stop the PSU.
The white `PSU OK` LED indicates ATX `PWR_OK`, not local regulator readiness or a USB link.

[SlotPower.tsx](components/SlotPower.tsx) switches the slot 3.3 V and 12 V supplies from bridge `HDDPC`.
HDDPC high enables both supplies. HDDPC low disables both supplies.
The switches include gate RC networks and output discharge resistors, but no current limiting.
[SlotDecoupling.tsx](components/SlotDecoupling.tsx) connects the following capacitors from each switched output to `GND`:

| Slot rail | Bulk capacitor | Ceramic capacitors |
| --- | --- | --- |
| `SLOT_12V` | Nichicon PCR1E471MCL1GS, 470 µF, 25 V, ±20%, polymer | Two Samsung CL10B104KB8NNNC, 100 nF, 50 V, X7R, 0603 |
| `SLOT_3V3` | Chemi-Con APXJ6R3ARA561MF80G, 560 µF, 6.3 V, ±20%, polymer | One Samsung CL10B104KB8NNNC, 100 nF, 50 V, X7R, 0603 |

The nominal capacitances and quantities match ASMedia reference sheet 6.
Bulk positive terminals connect to the slot rails, and negative terminals connect to `GND`.
The Nichicon part uses its exact supplier footprint. The Chemi-Con part uses the manufacturer F80 land dimensions.
Final placement belongs beside the slot power contacts, with short rail connections and nearby ground vias.
The local banks alone draw approximately 0.564 A at 12 V and 0.185 A at 3.3 V during a linear 10 ms ramp.
This example excludes card capacitance and load current. The actual rise time, MOSFET safe operating area, and discharge timing still need checks.

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

The PCIe link includes eight 220 nF transmitter capacitors, reference clock pair 0, reset, clock request, wake, and card presence.
The card supplies its own transmitter coupling capacitors.
The x16 connector provides four connected lanes. Firmware behavior, hot-plug operation, and measured throughput remain open work.

## Programming access

| Access | Pin order | Notes |
| --- | --- | --- |
| UART | GND, TX, RX | 3.3 V logic, board perspective, custom 2.54 mm footprint |
| SPI | GND, V3V3, CS_N, CLK, MOSI, MISO | Programmer perspective, custom 2.54 mm footprint |

Both access connectors use `doNotPlace` and provide unpopulated footprints.
UART adapter RX connects to board TX, and adapter TX connects to board RX.
SPI MOSI connects to flash DI, and MISO connects to flash DO.
The SPI header shares the bridge bus and connects directly to board 3.3 V.
Programmer power and bus isolation need checks before external programming.

## Remaining work

Preliminary mechanical placement can proceed alongside the following checks.
Detailed routing depends on the decisions that affect parts, footprints, and board constraints.

1. Check power sequencing, reset release, shutdown, and brownout behavior.
2. Check regulator compatibility with the complete decoupling banks, effective capacitance, ripple, and transient response.
3. Complete the power budget, slot-switch inrush and thermal checks, and cooling requirements.
4. Establish the bridge firmware and configuration, boot straps, and SPI programming isolation.
5. Check USB VBUS sensing with the bridge unpowered.
6. Freeze the board outline, connector positions, card support, mounting, stackup, impedance rules, and fabrication capabilities.
7. Check the custom bridge footprint and BGA escape plan before final placement.
   The 0.18 mm circular lands remain a community-reference assumption rather than a manufacturer-specified land diameter.
8. Complete schematic and netlist checks, then placement, ground planes, routing, matching, and fabrication checks.
   Resolve the previously reported pad-clearance errors in the PSU indicator footprint before fabrication.
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
