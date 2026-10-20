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
The board outline is 52.5 × 123.62 mm.
The PCIe courtyard has 5 mm of space from ATX below and about 5 mm from the top and left edges.
Automatic packing supplies preliminary positions for the other components, and routing is disabled.
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
| `bun run dev` | Open the cached PCB placement preview |
| `bun run dev:full` | Open the source editor and full tscircuit development viewer |
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

### Connector placement

[index.circuit.tsx](index.circuit.tsx) defines the board size and the `pcbGroupPlacements` map.
The preview uses the same circuit, footprints, and schematic as the normal build.

1. Run `bun run dev` to open the circuit preview.
2. Select the PCB view to examine the top view.
3. Edit `pcbX` or `pcbY` in the `pcbGroupPlacements` map in `index.circuit.tsx`.
4. Save the file to update the preview.
5. Select the 3D view to examine connector access.
6. Run `bun run build` to produce a fresh full build.

Coordinates use millimeters and place the bottom-left corner of each group footprint or courtyard.
The board origin is its bottom-left corner. Positive X points right, and positive Y points up.
Keys with `/` place a subgroup relative to its parent.
`pcbRotation` specifies counterclockwise degrees. `offBoard: true` permits a group outside the board during placement.

The first preview creates a full build. Later X/Y edits reuse the rendered circuit and schematic.
Each move updates pads, courtyards, group bounds, and 3D models, then repeats the placement checks.
The preview reads the original cache for each move to prevent accumulated coordinate drift.
Generated preview files remain in `dist/`. `index.circuit.tsx` remains the circuit source.

Rotations, grid changes, board dimensions, footprints, connections, and other source changes trigger a full build.
Expressions in the placement map also use a full build. The cached path requires literal numeric X/Y values and disabled routing.
Routed geometry always uses a full build. A failed update reports an error in the viewer and retains the previous full build.
`bun run dev:full` retains the original source editor and full rebuild behavior.
`bun run dev --port 3023` selects a different preview port.

### 3D preview performance

The preview caches remote component models in `dist/preview/models/remote/`.
The first run downloads each model once. Later runs use these local files.
A failed download retains the remote URL.

The preview combines identical opaque materials and reuses shadows during camera movement.
Scene changes refresh the shadows. Component geometry, colors, dimensions, and placement stay the same.
The canvas uses a maximum pixel ratio of 1.5. Board surface textures use a maximum of one megapixel per layer.
These limits reduce display detail at extreme zoom.

The preview generates its viewer bundle in `dist/viewer/` through the documented CLI override.
It does not edit installed packages.
An incompatible viewer update stops preparation with an error.
`FLAMINGO_3D_ORIGINAL=1 bun run dev` uses the original viewer and remote model URLs.

The profiler requires Playwright and Chrome.
`PLAYWRIGHT_MODULE` can point to an existing Playwright module.

1. Run `bun run dev`.
2. Run `bun run profile:3d -- --url http://localhost:3020/#file=circuit.json --label optimized`.
3. Open the reports and screenshots in `dist/3d-profile/`.

The reports include model-ready time, tab-reopen time, rotation frame time, CPU profiles, and geometry counts.
The profiler uses a 1280 × 900 viewport with a pixel ratio of 2.

### PCIe mechanical zones

`lib/pcie-mechanical.ts` defines the XKB assembly keepout and the CEM component height zones.
The PCB view shows their boundaries and a color legend on the PCB notes layer.
These notes do not appear on the manufactured silkscreen.
The zones move with the PCIe connector, including cached placement updates.
The board outline clips each zone.

| Zone | Basis | Restriction |
| --- | --- | --- |
| XKB assembly | 89 mm housing, 8.80 mm body width, 92 mm hold-down span, 9.20 mm signal land span | No other components on the connector side |
| CEM card area | CEM Figure 86, adapted to the XKB housing boundary | 15.24 mm maximum component height |
| CEM front strip | CEM Figure 86, from -10.16 mm to +5.09 mm relative to the chassis mounting datum | 5.08 mm maximum component height |
| CEM anti-misinsertion feature | 2.50 mm width, centered on the slot, for 10.30 mm ahead of the XKB housing | 6.35 mm maximum component height |

The XKB source is [the connector drawing](datasheets/X1618WVS-164-9TV30.pdf), pages 1-2.
The CEM source is [Revision 4.0, Version 0.9](https://whycan.com/files/members/1761/PCIe_CEM_SPEC_R4_V9_12072018_NCB.pdf), Figures 33 and 86, pages 90 and 158.
This public CEM copy is a draft.
Its microATX illustration supplies the reference envelope, not a required microATX outline for this board.
Datum A coincides with the first locator axis, 1.65 mm after A11.
The key center precedes that axis by 0.15 mm.
The transverse height envelope extends to the actual XKB housing boundary on row A.

At the current connector position, the 5.08 mm strip lies beyond the top board edge.
Its definition remains available for later connector positions.
The XKB drawing has no retention latch.
A different connector or an added retention mechanism requires a new mechanical review.

The placement checks reject components inside the XKB assembly keepout.
`bun run check:drc` also compares reviewed maximum component heights with the CEM limits.
Unknown heights produce `pcie_height_unreviewed` warnings.
`pcieComponentHeightsMm` records reviewed heights by manufacturer part number.
The current ATX header uses a conservative 10 mm limit from its Molex drawing.
This limit covers the bare header, not the attached cable.
The checks use component and courtyard bounds and apply only on the connector side of the board.
Copper traces, vias, and ground pours remain available in these mechanical zones.
Card coolers, cables, supports, and enclosure clearances still require an assembly review.

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
The project sets general minimum trace width and spacing to 0.10 mm.
JLCPCB lists 0.09 mm multilayer trace width and spacing, with local 3 mil traces in BGA fan-outs.
The USB4 routes use 0.1234 mm traces, with matched 0.0762 mm necks at the direct top-layer RX1 and TX2 BGA escapes.
Only the scoped USB4, PCIe RX3 and clock traces within their BGA escape areas receive this width exception.
All copper clearances retain the global limits.
See the [JLCPCB capabilities](https://jlcpcb.com/capabilities/pcb-capabilities).
The [JLCPCB trace-width guide](https://jlcpcb.com/blog/pcb-trace-width-guide) gives 0.15–0.25 mm as the common range for signal and logic traces.

The [shared trace widths](lib/trace-width-rules.ts) define the active classes:

| Class | Width | Use |
| --- | --- | --- |
| General | 0.25 mm (about 10 mil) | Low-current logic, status, LED, and local supply connections |
| Surface differential | 0.1234 mm | USB4 and PCIe pairs with an 85 Ω target on the selected stackup |
| USB4 BGA neck | 0.0762 mm (3 mil) | Short, matched top-layer RX1 and TX2 launches within the BGA escape area |

New low-current connections use the general width by default.
High-speed widths come from the stackup calculation and retain their specified pair gap.
Power distribution requires separate width calculations for rail current, voltage drop, copper thickness, and temperature rise.
The general width does not establish a current rating for power distribution.

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
The selected stackup is [JLC06161H-3313](manufacturing/stackup/JLC06161H-3313.json).
The nominal order thickness is 1.6 mm. The current manufacturer calculator lists a finished thickness of 1.54 mm ±10%.
L1 carries high-speed signals. L2 and L5 are continuous ground planes. L3 and L4 carry power regions.
L6 carries control signals and selected USB4 and PCIe trace sections.
The outer dielectric thickness is 0.0994 mm. The outer copper thickness is 0.035 mm. The inner copper thickness is 0.0152 mm.
The manufacturer calculator gives a 0.1234 mm trace width and 0.1001 mm pair gap for 85 Ω surface differential pairs.
This result uses a non-coplanar model with solder mask and L2 as the reference plane.
Nearby copper, BGA necks, and pad launches require separate checks before these dimensions become routing rules.
The requested fabrication impedance tolerance is ±10%. The calculator's ±0.5% search tolerance does not specify fabrication accuracy.
The [calculator guide](https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator) specifies Nan Ya NP-155F for four to eight layers.
The fabrication specification now requires this family, with the exact core and prepreg variants pending factory identification.
The [laminate research](manufacturing/stackup/laminate-research.json) records supplier data and the remaining factory questions.
The supplier sheets give typical loss values at 1 GHz. They do not establish a production loss limit at 10 GHz.
The USB4 routing target is at most 20 mm of copper per conductor.
The [loss screen](scripts/screen-usb4-loss.mjs) estimates 2.60-3.47 dB at 10 GHz for a 20 mm route under explicit assumptions.
This estimate uses an assumed Df of 0.020, a conductor-loss multiplier of one to two, and an assumed 1 dB component allowance.
These assumptions are not measured bounds. Component models, exact material data, and routed geometry must establish the final channel loss.
The circuit retains its nominal six-layer, 1.6 mm model. The separate stackup file records the fabrication recipe.

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

The fixed routing pass covers TX1, TX2, RX1, and RX2.
The ESD, capacitor, and discharge banks sit on L1 (`top`), referenced to L2 (`inner1`) GND.
TX1 and RX2 escape the BGA on L6 (`bottom`), referenced to L5 (`inner4`), and return to L1 before the ESD pads.
TX2 and RX1 escape the BGA on L1 and use short L6 paths to reach the far connector row.
TX1 and RX2 reach the near connector row on L1.

[The high-speed rules](lib/high-speed-rules.ts) set 0.1234 mm copper width, 0.1001 mm pair gap, and a 0.10 mm channel skew target.
The planar copper-length target is 20 mm.
ASMedia's USB4 20 Gb/s table states "VIA hole Max. <=2". The project interprets this as two signal vias per conductor.
The user also requires this maximum. All eight conductors use two signal vias each, and the audit rejects any excess.
ASMedia also requires less than 1 mil of skew in every segment; the project target is 0.025 mm.
All four pairs meet the copper-length targets for each segment and the whole channel.
The audit also measures the local BGA launch before the coupled corridor, so later segments cannot hide an unequal launch.
The direct RX1 and TX2 BGA escapes use equal lengths of 0.0762 mm neck copper on P and N.
The neck exception applies only to four named top-layer traces inside the BGA escape area. Pad-to-trace clearance remains 0.10 mm.
The outer stackup is nominally symmetric. The length audit excludes package delays, capacitor pad spans, and via depth.
The geometry results do not establish matched electrical delay or USB4 compliance.

USB2 D+/D− also reaches both USB-C contact rows.
Each conductor uses four signal vias, which meets the ASMedia USB2 maximum.
The near-row copper lengths match within 0.001 mm. The far-row mismatch is approximately 0.0244 mm.
Both results meet the 0.5 mm project target and the ASMedia 20 mil limit.

Ground guard bands on both outer layers shield the USB routes.
Their authored outlines replace the large rectangular surface fill. Native pour solving applies the required clearances.
The ground fences use hole spacing of at most 1.0 mm. Native stitching adds ground vias where both pours permit them.
Each connected shield region touches a ground via. Each authored fence via contacts a surface guard band.
The USB checks also enforce drill clearance between nearby vias and the rotated USB-C mounting slots.
The coupled trunks pass the ASMedia copper-isolation limits outside the disclosed BGA, component, and connector launches.
The inner ground pours also pass the trace-width projection and drill-clearance checks.

Each TX1 and RX2 conductor uses a 0.15 mm drill / 0.25 mm copper BGA via and a 0.20 mm drill / 0.40 mm copper return via.
Each TX2 and RX1 conductor uses two 0.20 mm drill / 0.40 mm copper vias at the connector.
The TX1 and RX2 inner signal balls use filled/capped vias in their lands. Their outer balls reach matching vias through short top-layer launches.
The via copper expands the effective inner lands to 0.25 mm. The combined lands, vias, mask, and stencil require vendor DFM/DFA acceptance.
The [BGA process proposal](manufacturing/bridge-bga/process.json) records these details and the pending vendor decision.

L2 (`inner1`) and L5 (`inner4`) contain GND pours.
GND vias flank the BGA launches and connector transitions.
Power routing and the remaining bridge power/GND fanout still need routing.
The surface pours connect nearby shunt ground pads. The remaining ground connections need routing.
The analog bypass, VBUS filter, and nearby return vias sit outside the coupled USB corridors.

Run `bun run check:usb4` to rebuild the routed stage, audit its copper, and render previews in `dist/usb4-routing/`.
The command reports the USB4 geometry result and the full-board DRC separately. Errors in either result produce a nonzero exit.
The draft does not establish complete board routing or USB4 compliance.
Native saved routing phases apply the manual paths. `routeRemaining={false}` disables implicit routing of the remaining connections.

Run `USB_SI_PYTHON=/path/to/si-venv/bin/python bun run check:usb` for the combined USB2 and USB4 layout checks.
Use the Python environment from `simulations/pcie-tx/requirements.txt`.

The command covers fabrication DRC, connectivity, lengths, via counts, coupled geometry, copper isolation, shield attachment, and ground support.
Native shorts and PCB style checks remain separate requirements before export.

The selected USB4 capacitors use 0201 packages and X5R dielectric.
The user reconfirmed this prototype selection. It remains an explicit exception to the ASMedia X7R requirement.
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

All four PCIe TX pairs now have routes from the bridge through the coupling capacitors to the slot.
The bridge sections use bottom copper, with short top launches and two full-stack signal vias per conductor.
L5 provides the ground reference. The symmetric outer stackup uses the same 0.1234 mm width and 0.1001 mm pair gap.
Ground return vias connect L2 and L5 within 1 mm of each signal via.
The bottom trunks follow constant-offset pairs without individual tuning loops.
Local BGA escapes balance P/N copper lengths within the 0.025 mm target, including the existing top routes to the slot.
The bridge vias use 0.25 mm copper and 0.15 mm holes. The capacitor vias use 0.30 mm copper and 0.20 mm holes.
The filled/capped signal land vias and offset ground land via are recorded in `manufacturing/bridge-bga/process.json`.
All four PCIe RX pairs also have routes from the slot to the bridge, with no polarity or lane swaps.
RX0–2 use short bottom sections and two signal vias per conductor. RX3 stays on top without signal vias.
The coupled trunks use the same surface width and gap. RX3 uses short 0.0762 mm BGA necks with 0.10 mm pad clearance.
The necks, pad flares and vias are launch discontinuities. Their geometry does not establish 85 Ω impedance through each transition.
The TX3 local escape now uses an AA15 land via to make room for RX3. All TX pairs retain matched lengths and coupled trunks.
The bridge clocks now have explicit saved routes in `lib/bridge-clock-routing.tsx`.
The 25 MHz XI/XO traces stay on top and use no signal vias.
The 10 pF capacitor remains across XI/XO, as shown in the ASMedia reference schematic.
Both metal-cover lands on the crystal connect directly to GND through filled and capped vias.
The PCIe REFCLK pair uses the bottom layer between two matched transitions per conductor.
All assembled components remain on top.

The ASMedia PCB guideline (R1.0, page 5) specifies 85 Ω ±15% for both clock circuits.
The coupled sections use the selected stackup dimensions: 0.1234 mm width and 0.1001 mm edge gap.
The XI/XO trace limit is 12.7 mm per conductor.
The connector REFCLK limit is 177.8 mm, with less than 0.127 mm P/N length mismatch.
The available XI/XO table does not specify a length-matching limit or a maximum via count.

`bun run check:clocks` checks the current preview copper against these limits.
Set `PCIE_SI_PYTHON` to a Python environment with the dependencies from `simulations/pcie-tx/requirements.txt`.
The checks also measure pair geometry, foreign copper spacing, and L2/L5 reference support.
The clock checks require more than 0.7952 mm spacing in the documented coupled sections.
This distance also exceeds the 0.762 mm crystal spacing recommendation.
The pad, via and BGA launches retain fabrication checks, but they still require the final SI review.
Drawn trace lengths exclude package delay and component internal paths.
Crystal startup, frequency accuracy and load-capacitance performance require the final oscillator review and hardware measurements.

Run `bun run check:pcie-tx` to build the board and check the emitted TX copper.
The command saves lengths, skew, geometry checks, and top/bottom previews in `dist/pcie-tx-routing/`.
The geometry audit samples the emitted bottom trunks to reject separated loops even when their P/N lengths match.
The first 3 mm after each BGA via and final 0.4 mm before the capacitor via are launch regions.
These checks exclude capacitor pad span, via delay, and package delay. They do not establish channel impedance or PCIe compliance.

Run `bun run check:pcie-rx` to check RX endpoints, widths, P/N skew, via counts, ground returns, and coupled trunk spacing.
The command saves the rendered board and geometry audit in `dist/pcie-rx-routing/`.
The RX audit excludes short launch regions and rejects separated loops even when their added P/N lengths match.
RX0–3 drawn lengths are approximately 13.285, 21.013, 29.652 and 36.562 mm per conductor, with less than 0.001 mm P/N skew.
Final launch, via, crosstalk, loss and electrical-delay validation remains part of the agreed SI review after routing.
The `simulations/pcie-tx/check_reference_planes.py` script checks TX/RX trace-width projections against the rendered ground planes.
It excludes each route's own via apertures. It does not model the surrounding electromagnetic field or return loss.

ASMedia's PCIe Gen4 table calls for S1 > 8h outside each coupled pair.
The selected 0.0994 mm outer dielectric gives a minimum isolation gap of 0.7952 mm.
The layout now clears that distance to unrelated copper along the checked TX/RX coupled routes, including ground vias and component lands.
All assembled components must remain on the top layer. Bottom copper routing and vias are allowed.
The fabrication DRC rejects bottom-side component placement, and a regression test checks this requirement.
The VDD and VCCL bypasses occupy top-side pockets outside the PCIe corridors; the fast VDD capacitors sit below the bridge.
The CLKREQ links and nearby return vias moved clear of the signal corridors. Bypass quantities and values are unchanged.
These banks still need their power connections routed and their power-distribution performance reviewed.

Run `PCIE_SI_PYTHON=/path/to/si-venv/bin/python bun run check:pcie` for the combined layout checks.
Use the environment installed from `simulations/pcie-tx/requirements.txt`. An optional Circuit JSON argument avoids rebuilding.
This command runs fabrication DRC, TX/RX geometry, 8h isolation, and ground-plane projection checks.
The isolation report is `dist/pcie-rx-routing/asmedia-spacing.json`; its regression check rejects the original capacitor intrusion.
Native shorts and PCB style checks remain separate required checks before export.
The isolation check reports top BGA pad-to-via escapes separately, with a 3.2 mm project limit.
It also excludes the first 3 mm after each BGA via on bottom, 1 mm at a via/capacitor, and 2 mm at the slot.
These regions retain fabrication clearance checks. Their pad pitch prevents a uniform 8h gap, so final launch/via SI remains open.
The result establishes the checked coupled-route layout rules; it does not establish full PCIe compliance or factory DFM acceptance.
Run `PCIE_SI_PYTHON=/path/to/si-venv/bin/python bun scripts/refresh-pcie-preview.mjs` to rebuild and validate the visible board preview.

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
