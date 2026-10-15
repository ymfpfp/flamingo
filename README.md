# Flamingo

Flamingo is a PCB project for a USB4/Thunderbolt-to-PCIe adapter around the ASMedia ASM2464PDX bridge.
The project uses TypeScript and TSX with tscircuit to describe the schematic and PCB.
The design includes a PCIe slot and an ATX power connector.

## Current design

Documentation refresh: October 15, 2026.
The status below describes the circuit source. Hardware performance remains unmeasured.

The main circuit is in [index.circuit.tsx](index.circuit.tsx).
It contains four schematic sheets:

- `bridge`: the bridge, SPI flash, UART and SPI access, configuration resistors, crystal, and reset circuit.
- `power`: the ATX connector, PSU indicator, two complete buck circuits, and their shared enable supervisor.
- `usb`: the GT-USB-7087B receptacle, USB4 coupling capacitors, ESD clamps, and discharge resistors.
- `pcie`: the x4 link, reference clock, reset, wake, clock request, card presence, and slot power switches.

The board configuration specifies four layers and a thickness of 1.6 mm.
Automatic packing supplies preliminary component positions. PCB routing is disabled.

The SPI flash uses the 3.3 V `VCCH` supply, separate pull-ups, and a local 100 nF bypass capacitor.
The controller output connects to flash `DI`. Flash `DO` connects to the controller input.
The bridge has a 12.1 kΩ REXT resistor, configuration resistors, and an RC reset circuit with a reset button.
The PCIe x4 data lanes and control signals connect to the bridge.
Both TPS62903 converters include input capacitors, an inductor, an output capacitor, a feedback divider, and a MODE resistor.
The supervisor enables both converters after `VCCH` reaches its threshold. Complete startup timing still needs a check.

The USB-C connector has ground, USB2, CC, SBU, and VBUS-sense connections to the bridge.
USB VBUS remains separate from the ATX supply rails.
All four USB4 differential pairs connect to the bridge through eight AC-coupling capacitors.
Each conductor has a separate ESD clamp to ground and a connector-side discharge resistor.
All six connector shell pads connect directly to `GND`, as in the ASMedia reference schematic.
The PCB still needs short copper connections and nearby ground vias at the receptacle.
The PSU starts automatically through a removable link on `PS_ON#`.
A white `PSU OK` LED indicates that the PSU asserts `PWR_OK`.
The design remains in development, with no established hardware performance results.

## Remaining work

The order below puts missing supply connections before layout and prototype checks.

1. Connect bridge `VCCA33` to its 3.3 V supply and add the bridge decoupling network.
   The current source leaves `VCCA33` unconnected and does not include local bypass capacitors for the bridge supply pins.
2. Add the `V3V3_AUX` regulator from `V5VSB` for the PCIe slot.
   The net and slot connection exist, but no regulator supplies this rail.
3. Check startup, shutdown, and brownout timing for the bridge rails, reset, and slot power.
   The reset RC does not monitor rail readiness. Both buck `PG` outputs remain unused.
4. Complete the power budget and checks for ripple, transients, capacitor bias, inductor margins, and temperature.
   Check slot-switch inrush and safe operating area with the intended card load.
   The slot switches do not provide current limiting.
5. Check USB VBUS sensing with the bridge unpowered.
   Decide whether USB2, CC, SBU, and VBUS need additional external protection for the intended product.
   Preserve the accepted X5R prototype selection until electrical or thermal results require a change.
6. Establish the bridge firmware image and configuration, including the intended x4 mode and hot-plug behavior.
   Check boot straps and SPI bus isolation before external programming.
   The programming supply connects directly to the board supply.
7. Complete test access, board outline, connector positions, card support, mounting, and cooling provisions.
8. Complete BGA escape, power distribution, controlled-impedance routing, length matching, and short protection-device ground returns.
   Check the bridge footprint assumptions before fabrication.
9. Complete schematic, netlist, placement, and routing checks before fabrication exports.
   Check prototype supply timing, USB attachment, PCIe enumeration, throughput, and temperature on hardware.
   Check stock and assembly availability before an order.

## Components

The following table lists the main components in the board and its circuit blocks.
Support-part groups follow the table. These lists do not replace a manufacturing bill of materials.

| Component | Quantity | Role | Definition |
| --- | ---: | --- | --- |
| ASM2464PDX | 1 | USB4/Thunderbolt-to-PCIe bridge with a custom BGA footprint | [ASM2464PDX.tsx](imports/ASM2464PDX.tsx) |
| RC0402FR-0712K1L | 1 | 12.1 kΩ, ±1% REXT reference resistor to GND | [RC0402FR_0712K1L.tsx](imports/RC0402FR_0712K1L.tsx) |
| W25Q32JVSSIQ | 1 | SPI flash connected to the bridge | [W25Q32JVSSIQ.tsx](imports/W25Q32JVSSIQ.tsx) |
| XXCBCLNANF-25M | 1 | 25 MHz crystal | [XXCBCLNANF_25M.tsx](imports/XXCBCLNANF_25M.tsx) |
| TCC0402COG100J500AT | 1 | 10 pF capacitor in the crystal circuit | [TCC0402COG100J500AT.tsx](imports/TCC0402COG100J500AT.tsx) |
| X1618WVS-164-9TV30 | 1 | PCIe 4.0 x16 SMT connector, 30 microinch gold, C21263101 | [X1618WVS_164_9TV30.tsx](imports/X1618WVS_164_9TV30.tsx) |
| 39301240 | 1 | 24-pin ATX power connector | [A_39301240.tsx](imports/A_39301240.tsx) |
| TPS62903RPJR | 2 | 3 A buck converters named `VCCL_BUCK` and `VDD_BUCK`; C2866502 | [TPS62903RPJR.tsx](imports/TPS62903RPJR.tsx) |
| TPS389001DSET | 1 | VCCH supervisor driving both buck EN pins; C2066907 | [TPS389001DSET.tsx](imports/TPS389001DSET.tsx) |
| RT0402BRD0716K2L | 1 | Supervisor divider top, 16.2 kΩ, ±0.1%; C852557 | [RT0402BRD0716K2L.tsx](imports/RT0402BRD0716K2L.tsx) |
| RT0402BRD0710KL | 1 | Supervisor divider bottom, 10 kΩ, ±0.1%; C190095 | [RT0402BRD0710KL.tsx](imports/RT0402BRD0710KL.tsx) |
| CL21A226MAYNNNE | 2 | Buck output capacitors, 22 µF, 25 V, ±20%, X5R, 0805; C602037 | [CL21A226MAYNNNE.tsx](imports/CL21A226MAYNNNE.tsx) |
| RT0402BRD0726K1L | 1 | VCCL feedback top resistor, 26.1 kΩ, ±0.1%, 0402; C728557 | [RT0402BRD0726K1L.tsx](imports/RT0402BRD0726K1L.tsx) |
| RT0402BRD0710K7L | 1 | VDD feedback top resistor, 10.7 kΩ, ±0.1%, 0402; C852482 | [RT0402BRD0710K7L.tsx](imports/RT0402BRD0710K7L.tsx) |
| RT0402BRD0712K1L | 2 | Feedback bottom resistors, 12.1 kΩ, ±0.1%, 0402; C281773 | [RT0402BRD0712K1L.tsx](imports/RT0402BRD0712K1L.tsx) |
| RC0402FR-0721KL | 2 | MODE resistors, 21 kΩ, ±1%, 0402; C185441 | [RC0402FR_0721KL.tsx](imports/RC0402FR_0721KL.tsx) |
| SLW5040S2R2MST | 2 | Buck inductors, 2.2 µH | [SLW5040S2R2MST.tsx](imports/SLW5040S2R2MST.tsx) |
| CL31B106KAHNNNE | 4 | Two 10 µF buck input capacitors and two 10 µF slot-switch gate capacitors | [CL31B106KAHNNNE.tsx](imports/CL31B106KAHNNNE.tsx) |
| DMP2008UFG-7 | 1 | Main 3.3 V slot power switch | [DMP2008UFG_7.tsx](imports/DMP2008UFG_7.tsx) |
| AO4407A | 1 | Main 12 V slot power switch | [AO4407A.tsx](imports/AO4407A.tsx) |
| 2N7002K-7 | 2 | Slot power-switch gate drivers | [A_2N7002K_7.tsx](imports/A_2N7002K_7.tsx) |
| CL05A105KA5NQNC | 1 | Bridge reset capacitor, 1 µF | [CL05A105KA5NQNC.tsx](imports/CL05A105KA5NQNC.tsx) |
| TS-1088-AR02016 | 1 | Bridge reset button | [TS_1088_AR02016.tsx](imports/TS_1088_AR02016.tsx) |
| SN74AHCT1G14DBVR | 1 | TTL-compatible Schmitt-trigger inverter for the PSU indicator; C55250 | [SN74AHCT1G14DBVR.tsx](imports/SN74AHCT1G14DBVR.tsx) |
| XL-1608UWC-04 | 1 | White `PSU OK` LED; C965808 | [XL_1608UWC_04.tsx](imports/XL_1608UWC_04.tsx) |
| GT-USB-7087B | 1 | USB4 40 Gbps, 24-contact USB-C receptacle; JLCPCB C3019713 | [GT_USB_7087B.tsx](imports/GT_USB_7087B.tsx) |
| GRM033R61E224KE01D | 4 | USB4 TX coupling, 220 nF, 25 V, ±10%, X5R, 0201; C701263 | [GRM033R61E224KE01D.tsx](imports/GRM033R61E224KE01D.tsx) |
| GRM033R61E334KE15D | 4 | USB4 RX coupling, 330 nF, 25 V, ±10%, X5R, 0201; C723889 | [GRM033R61E334KE15D.tsx](imports/GRM033R61E334KE15D.tsx) |
| ESD150B1W0201E6327XTSA1 | 8 | Infineon reference ESD clamp, single-channel bidirectional, 0201; C3709987 | [ESD150B1W0201E6327XTSA1.tsx](imports/ESD150B1W0201E6327XTSA1.tsx) |
| RC0201FR-07220KL | 8 | USB4 discharge resistor, 220 kΩ, ±1%, 25 V, 0201; C142020 | [RC0201FR_07220KL.tsx](imports/RC0201FR_07220KL.tsx) |

Additional support parts in the source include:

- Eight PCIe TX capacitors, each 220 nF, 10 V, in 0402 packages.
- Flash `CS`, `WP/IO2`, and `IO3` pull-ups, plus a local 100 nF bypass capacitor.
- A 4.7 kΩ `UART_TX` pull-up for the memory-repair strap and a 4.7 kΩ `TEST_EN` pull-down.
- A 100 kΩ reset pull-up, PCIe control links, and clock-request and card-presence pull-ups.
- Local bypass capacitors for the buck inputs, supervisor, and PSU indicator.
- Slot-switch gate resistors, pull-ups, discharge resistors, and a removable control link.
- A populated 0 Ω ATX start link and the PSU indicator resistors.

The UART and SPI connectors provide unpopulated access footprints and use `doNotPlace`.
The repository also retains this unused component definition:

| Component | Intended role | Definition |
| --- | --- | --- |
| XL-1608SURC-06 | Status LED | [XL_1608SURC_06.tsx](imports/XL_1608SURC_06.tsx) |

The component list describes the current source, not a complete manufacturing bill of materials.
Datasheets for placed components and current design references are in [datasheets/](datasheets/).
The source index retains URLs and hashes for removed PDFs of unused parts and earlier research.
The [datasheet source index](datasheets/sources.json) records component mappings, source URLs, document notes, and file hashes.

The GT-USB-7087B replaces the USB 2.0-only TYPE-C-31-M-12, which lacks the high-speed USB4 contacts.
Its [manufacturer drawing](datasheets/GT-USB-7087B.pdf) specifies data transmission up to 40 Gbps.
The [JLCPCB listing](https://jlcpcb.com/partdetail/GSwitch-GT_USB7087B/C3019713) identifies it as an extended part.
Its exact imported footprint includes a cutout for the body, which sits 0.23 mm below the PCB surface.
The connector center height is 1.35 mm.
USB2, CC, SBU, and VBUS pin mappings passed the schematic review. Protection performance and powered-off VBUS behavior remain unverified.
Final placement at the board edge and high-speed PCB routing remain incomplete.

### Bridge reset and programming access

[BridgeReset.tsx](components/BridgeReset.tsx) connects a 100 kΩ pull-up and a 1 µF capacitor to `ASM_RST_N`.
The normally-open button connects reset to ground. This RC circuit follows the reference but does not monitor supply readiness.
The buck enable supervisor has a separate output and does not drive bridge reset.

[UartHeader.tsx](components/UartHeader.tsx) provides a custom three-pin, 2.54 mm access footprint: `GND`, `TX`, and `RX`.
The signal names use the board perspective. Adapter RX connects to board TX, and adapter TX connects to board RX.
The footprint label identifies 3.3 V UART levels.

[SpiProgrammingHeader.tsx](components/SpiProgrammingHeader.tsx) provides a custom six-pin, 2.54 mm footprint.
Its pin order is `GND`, `V3V3`, `CS_N`, `CLK`, `MOSI`, and `MISO`.
The flash supply connects to `VCCH`. MOSI connects to flash `DI`, and MISO connects to flash `DO`.
The header shares the bus with the bridge and has no supply or bus isolation.
Firmware selection, programmer power, and bus contention still need checks.

### ATX power-on and status

[PsuControl.tsx](components/PsuControl.tsx) contains the PSU indicator on the power sheet.
The automatic start link sits beside the ATX symbol in [index.circuit.tsx](index.circuit.tsx), with a direct wire to pin 16.
ATX pin 16, `PS_ON#`, connects to ground through the populated 0 Ω resistor `R_PSU_ON`.
When AC power is available and its rear switch is on, the dedicated PSU starts automatically.
Removal of this link releases `PS_ON#` to the internal PSU pull-up.
USB disconnection does not turn off the PSU.

ATX pin 8, `PWR_OK`, connects to the input of `U_PSU_LED` and a 100 kΩ pull-down resistor.
The SN74AHCT1G14 uses the main 5 V rail and a local 100 nF bypass capacitor.
Its maximum positive input threshold is 2.0 V, below the minimum valid 2.4 V ATX high level.
The input and pull-down draw less than 52 µA at the maximum 5 V signal level, including resistor tolerance.
The ATX specification guarantees 200 µA of source current.

When `PWR_OK` is high, the inverter output goes low and sinks current through the white LED.
The LED receives power from the main 5 V rail through a 1 kΩ resistor.
The nominal LED current is approximately 2 mA.
The output is a 5 V LED drive signal. It does not connect to bridge logic or reset.
The `PSU OK` label refers to the main PSU outputs. It does not indicate local regulator readiness or a USB link.
The board has no standby indicator or manual power switch.

References: [Intel ATX guide, sections 3.3.1 and 3.3.3](datasheets/research/ATX-Power-Supply-Design-Guide.pdf),
[driver datasheet](datasheets/SN74AHCT1G14.pdf), and [LED datasheet](datasheets/XL-1608UWC-04.pdf).
The connection and current-budget tests are in [psu-control.test.jsx](tests/psu-control.test.jsx).
Electrical behavior during supply ramp and actual LED brightness require prototype checks.

### PCIe connector

The slot uses XKB X1618WVS-164-9TV30 ([JLCPCB C21263101](https://jlcpcb.com/partdetail/XKBConnection-X1618WVS_1649TV30/C21263101)).
It replaces the X3183WV-164B1-46V01 through-hole connector.
The [manufacturer drawing](datasheets/X1618WVS-164-9TV30.pdf) identifies PCIe 4.0 and specifies 30 microinch gold contacts.
The connector has 164 contacts, but only lanes 0 through 3 connect to the bridge.

The footprint uses the C21263100 import geometry, which matches the common V15/V30 drawing.
It has 0.70 by 2.00 mm SMT lands, a 1.00 mm pitch, and 7.20 mm between the contact rows.
Two 1.20 mm locating holes sit 73.15 mm apart.
Two 3.00 by 5.00 mm lands support the mechanical hold-down tabs and have no electrical connection.
The contact map uses physical A/B identifiers instead of the import's logical pin order.
The connector height is 11.25 mm maximum.
Hardware signal integrity and card retention remain unqualified.

The x4 link uses eight 220 nF TX capacitors. The card supplies its own transmitter coupling capacitors.
The slot `PERST#`, reference clock pair 0, and `CLKREQ#` connect through separate 0 Ω links.
`CLKREQ#` has a 10 kΩ pull-up to `VCCH`. `WAKE#` connects to bridge GPIO22.
`PRSNT1#` connects to ground. The slot presence contacts share a sense net with a 4.7 kΩ pull-up to `VCCH`.
A 0 Ω link connects that sense net to bridge GPIO2.
Firmware behavior, startup timing, and hardware hot-plug operation still need checks.

### PCIe slot power

[SlotPower.tsx](components/SlotPower.tsx) controls both main slot supplies from the bridge's `HDDPC` output.
The circuit appears on the `pcie` sheet beside the connector.

| Supply | Input | Switched output | Power MOSFET |
| --- | --- | --- | --- |
| Main 3.3 V | `V3V3` | `SLOT_3V3` | DMP2008UFG-7 |
| Main 12 V | `V12V` | `SLOT_12V` | AO4407A |

HDDPC high enables both switches. HDDPC low disables both switches.
Each power MOSFET has a separate 2N7002K-7 driver, 510 ohm gate resistor, and 100 kohm gate-to-source pull-up.
A shared 1 kohm pull-down holds the driver inputs low without an active control signal.
Each switched output has a 1 kohm discharge resistor rated at 0.25 W.
The bridge supply, slot ground, and `V3V3_AUX` remain outside these switches.
The auxiliary supply still needs its regulator from `V5VSB`.

The circuit follows the `POWER_Control` block on sheet 6 of [the ASMedia reference schematic](datasheets/ASM2464PDX_TI_R03.pdf).
Both switching paths are populated. The circuit omits all power-rail bypass links and diodes.
The [parts inventory](slot-power-parts.json) records quantities, source documents, and component substitutions.

The 10 uF gate capacitors use the reference's nominal value.
Startup timing, driver margins, MOSFET safe operating area, and thermal behavior require checks with the intended card load.
The circuit does not provide current limiting. Reset sequencing and hardware power-cycle behavior remain unqualified.

### USB4 coupling and protection

[Usb4Lanes.tsx](components/Usb4Lanes.tsx) connects the high-speed conductors as follows:

| Connector pair | Bridge pair | Series capacitance per conductor |
| --- | --- | --- |
| TX1± | UTXP0 / UTXN0 | 220 nF |
| TX2± | UTXP1 / UTXN1 | 220 nF |
| RX1± | URXP0 / URXN0 | 330 nF |
| RX2± | URXP1 / URXN1 | 330 nF |

The lane mapping, nominal capacitances, and 220 kΩ discharge paths match sheet 3 of [the ASMedia reference schematic](datasheets/ASM2464PDX_TI_R03.pdf).
Each capacitor connects the connector net to a separate bridge net.
Each Infineon ESD150-B1-W0201 connects the bridge side of a capacitor to ground.
This is the exact clamp in the ASMedia reference schematic.
Its [datasheet](datasheets/ESD150-B1-W0201.pdf) specifies ±3.3 V working voltage and typical 5.4 V clamping at 16 A TLP.
Capacitance is typically 0.24 pF at 1 MHz and 0.15 pF at 10 GHz.
JLCPCB lists C3709987 as an Extended part for Standard PCB assembly only.
The clamp does not provide sustained protection against a connector-side VBUS short.
The discharge resistors connect the connector side of each capacitor to ground.
Separate clamp packages avoid coupling several data lines through one protection package.

All new parts use 0201 packages. The capacitors use X5R dielectric, with an upper operating temperature of 85 °C.
The ASMedia layout guide specifies X7R, so this dielectric substitution requires qualification for the intended board temperature range.
RX capacitance at ±10% tolerance spans 297–363 nF before temperature, DC bias, and aging effects.
USB4 specifies a 300–363 nF RX range, so the selected nominal 330 nF parts do not guarantee that range across all conditions.
The user accepts this capacitor selection for the first prototype. Effective capacitance and complete channel performance remain unverified.
The current PCB positions are placement previews. Controlled impedance, pair spacing, length matching, and short clamp ground returns remain incomplete.
JLCPCB stock information was unavailable for C142020. Assembly availability requires another check before an order.

### USB interface schematic review

The October 14, 2026 review compared the compiled netlist with ASMedia reference sheet 3 and datasheet sections 2 and 5.
All 12 checked USB2, CC, SBU, and VBUS contact-to-ball connections passed.
The seven functional signal nets remain distinct. The connector grounds and all six shell contacts connect to ground.
USB VBUS remains separate from the ATX 3.3 V, 5 V, standby 5 V, and 12 V rails.

- USB2: A6/B6 connect to UDP (M1). A7/B7 connect to UDM (M2).
- CC: A5 connects to CC1 (AA6). B5 connects to CC2 (Y6).
- SBU: A8 connects to SBU1 (K1). B8 connects to SBU2 (J1).
- VBUS: all four receptacle VBUS contacts connect directly to the bridge input (G1).

The bridge includes 5.1 kΩ CC pull-downs, orientation detection, and a BMC PHY for fixed-5 V UFP/sink operation.
These functions do not require another controller or duplicate external CC pull-downs.
Powered-off behavior, firmware configuration, and attach operation remain unverified.

The VBUS input is explicitly 5 V tolerant, but the present connection omits the reference divider and filter options.
Reference sheet 3 shows R57/R60 (4.7 kΩ/10 kΩ), C68 (1 µF), and an unpopulated R59 link to the bridge.
It also shows connector VBUS capacitors. The review did not establish that the divider and filter are mandatory for integrated fixed-5 V operation.
The working prototype retains the direct connection. This reference difference alone does not block work on the remaining schematic.
Powered-off VBUS tolerance remains a power-design follow-up.
When VCCH is absent, the examined datasheet does not explicitly establish VBUS tolerance.
A divider alone does not establish powered-off tolerance or provide overvoltage protection.

The source contains eight Infineon TVS clamps on the high-speed conductors only.
USB2, CC, SBU, and VBUS have no external TVS components in the current source.
Reference sheet 3 also omits separate clamps on those signals, so their absence alone does not establish a functional wiring error.
System ESD and VBUS-short protection for these exposed signals remain unqualified.

The October 14 review recorded 10 passing circuit tests and a passing TypeScript check.
The current check results appear in [Development](#development).
These checks do not establish hardware attach, negotiation, or ESD performance.

### USB4 capacitor selection

The user accepted the existing Murata X5R capacitors for the first prototype on October 14, 2026.
The selection preserves EIA 0201 packages (0.6 × 0.3 mm) and 25 V ratings.

| Role | Part | Specifications | JLCPCB part |
| --- | --- | --- | --- |
| TX, four capacitors | GRM033R61E224KE01D | 220 nF, 25 V, ±10%, X5R, 0201 | [C701263](https://jlcpcb.com/partdetail/C701263) |
| RX, four capacitors | GRM033R61E334KE15D | 330 nF, 25 V, ±10%, X5R, 0201 | [C723889](https://jlcpcb.com/partdetail/C723889) |

The RX parts are the selected prototype components. No circuit substitution or individual screening is required by this decision.
The earlier ±5% initial-tolerance target was an engineering preference, not an explicit ASMedia requirement.
The search did not establish a tighter-tolerance 0201 replacement at 25 V or higher.
The [source index](datasheets/sources.json) retains the research findings and alternative parts.

The RX initial-tolerance interval is 297–363 nF, before temperature, DC bias, and aging effects.
The [USB4 specification](datasheets/USB4-Specification-2.0-November-2025.pdf), PDF page 93, section 3.1.2.2, specifies 300–363 nF.
The prototype decision accepts this margin concern. It does not establish USB4 compliance.
The [Murata RX specification](datasheets/GRM033R61E334KE15D.pdf), page 1, permits −33% to +15% temperature change from −55 °C to −15 °C.
The X5R dielectric also differs from the ASMedia X7R layout recommendation.

Before production, evaluate effective capacitance and USB4 operation across the intended temperatures, cables, and operating conditions.
Stock and assembly availability require another check before an order.

### Earlier X7R research

The [ASMedia PCB guideline](datasheets/ASM2464PD-PDX-PCB-Guideline-Mid-loss-R1.0.pdf), revision 1.0, specifies 0201 X7R capacitors on PDF page 3.
The nominal values are 220 nF for TX and 330 nF for RX.
Reference schematic sheet 3 specifies 10 V TX capacitors and 25 V RX capacitors.
The documents examined do not specify capacitor tolerance.
Research on October 14, 2026 did not establish an exact 0201 X7R replacement for the current capacitors.

These larger X7R parts are alternatives for evaluation:

| Role | Part | Nominal specifications | Catalog part | Difference from the guideline |
| --- | --- | --- | --- | --- |
| TX | [CL05B224KA5VPNC](https://product.samsungsem.com/mlcc/CL05B224KA5VPN.do) | 220 nF, 25 V, ±10%, X7R | [C2976455](https://jlcpcb.com/partdetail/3382919-CL05B224KA5VPNC/C2976455) | EIA 0402, 1.0 × 0.5 mm |
| RX | [CC0603JRX7R8BB334](https://www.yageogroup.com/download/specsheet/CC0603JRX7R8BB334) | 330 nF, 25 V, ±5%, X7R | [C519579](https://www.lcsc.com/product-detail/C519579.html) | EIA 0603, 1.6 × 0.8 mm |

The RX candidate spans 313.5–346.5 nF at its specified test conditions before temperature, DC bias, and aging effects.
X7R does not eliminate these effects, as [Murata explains](https://www.murata.com/en-eu/support/faqs/capacitor/ceramiccapacitor/char/0005).
The candidate specifications do not establish 40 Gbps channel performance.
ASMedia-approved capacitor part numbers or clarification can resolve the conflict between the available parts and the 0201/X7R recommendation.
Neither larger X7R alternative is instantiated.
The October 14 research recorded two Samsung TX pieces and 7,522 Yageo RX pieces. These counts are historical.
The user accepted the working X5R selection for the first prototype. Electrical and thermal qualification remain incomplete.
The [source index](datasheets/sources.json) records the research requirements, candidate specifications, and document hashes.

## Development

Use Bun to install the dependencies from `bun.lock`:

```sh
bun install --frozen-lockfile
```

Start the development viewer:

```sh
bun run dev
```

The scripts in [package.json](package.json) provide these commands:

| Command | Purpose |
| --- | --- |
| `bun run dev` | Start `tsci dev` |
| `bun run start` | Start `tsci dev` |
| `bun run build` | Run `tsci build` |
| `bun run typecheck` | Run `tsc --noEmit` |
| `bun run snapshot` | Run `tsci snapshot` |
| `bun run snapshot:update` | Update snapshots with `tsci snapshot --update` |

Run the circuit tests:

```sh
bun test ./tests
```

Run the TypeScript check:

```sh
bun run typecheck
```

On October 15, 2026, all 31 tests across seven files passed. The TypeScript check also passed.
The tests cover the bridge pin map and footprint, buck circuits, USB4 lanes, PCIe connections, PSU control, and slot switches.
These results do not establish complete schematic connectivity, final PCB placement, routed signal integrity, or hardware performance.

## Design notes and open questions

### Bridge footprint

No imported footprint was available for the ASM2464PDX, so the project defines the footprint manually.
The source uses 0.46 mm outer pitch and 0.65 mm inner pitch.
It uses 7 × 13 mil oblong pads on the outer perimeter and 0.18 mm circular pads elsewhere.

The original project notes state that the available datasheet does not specify the inner pad diameter.
The 0.18 mm diameter comes from another project that uses the same chip.
The source cites [the JITx ASM2464PDX reference footprint](https://github.com/openchips/JITx-ASM2464PDX_design/blob/main/components/Asmedia/ASM2464PDX.stanza).
This diameter remains a design assumption.

### Power rails

The original project notes do not provide consumption values for the bridge power rails.
The current source declares `VDD`, `VCCH`, `VCCL`, `V3V3`, `V5V`, and `V12V` nets.
[BuckInputs.tsx](components/BuckInputs.tsx) contains two TPS62903RPJR converters with inputs on the main ATX `V5V` rail.
They replace the TPS62130 converters to improve the voltage-error margin.
Each converter has a 10 µF, 25 V input capacitor and an additional 100 nF, 16 V bypass capacitor.
Both input capacitors connect from `VIN` to `GND`. They do not connect in series with the supply.
The former analog-input bypass capacitors now have the names `C_VCCL_HF` and `C_VDD_HF`.
The TPS62903 has one ground pin and no separate analog input or exposed-pad port.
Final placement must keep both input capacitors close to `VIN` and `GND`.

Each `MODE` pin connects to ground through a 21 kΩ, ±1% resistor.
This selects external feedback, 1 MHz forced PWM, and no active output discharge.
[TPS62903 table 7-1 on page 10](datasheets/TPS62903RPJR.pdf) specifies this setting as option 8.
Each `SS/TR` pin remains intentionally open for fastest startup, as permitted by pin table 5-1.
Both `EN` pins connect to the shared `BUCK_EN` net from [BuckEnable.tsx](components/BuckEnable.tsx).
A TPS389001DSET supervisor monitors `VCCH` through a 16.2 kΩ / 10.0 kΩ divider.
Both sense resistors are 0402 thin-film parts with ±0.1% tolerance and ±25 ppm/C temperature coefficients.
The nominal enable threshold is `1.157 V × (1 + 16.2/10) = 3.03134 V` for increasing VCCH.
The nominal disable threshold is `1.15 V × (1 + 16.2/10) = 3.013 V` for decreasing VCCH.
The supervisor supply and `MR#` connect to `VCCH`.
A 100 nF capacitor bypasses its supply to ground.
Its open-drain `RESET#` output drives `BUCK_EN`, with a separate 10 kΩ pull-up to `VCCH`.
Its `CT` pin remains open for the nominal 25 µs release delay.
The [supervisor datasheet](datasheets/TPS389001DSET.pdf) specifies these connections and thresholds on pages 3, 5, and 13.
This circuit enables both converters together. It does not control the separate bridge reset net.
Both buck `PG` pins remain unused. Bridge reset qualification and complete power-up timing still require checking.

Each converter has one SLW5040S2R2MST shielded 2.2 µH inductor between its `SW` pin and its output rail.
`L_VCCL` supplies `VCCL`. `L_VDD` supplies `VDD`.
Each `VOS` pin senses the filtered output at the output capacitor.
The inductor has a 3.95 A thermal rating and a 6.5 A saturation rating at 30% inductance loss.
The thermal rating permits a 40 C rise from 20 C ambient. Final temperature and current margins require checking.
The [inductor datasheet](datasheets/SLW5040S2R2MST.pdf) specifies dimensions on page 2 and electrical ratings on page 9.
Each output has one CL21A226MAYNNNE capacitor from the filtered rail to `GND`.
These capacitors are 22 µF, 25 V, X5R, ±20%, in 0805 packages.
TPS62903 table 8-3 on page 18 specifies 2.2 µH and 22 µF as the standard 1 MHz filter.
The [Samsung characteristic sheet](datasheets/CL21A226MAYNNNE.pdf) includes typical bias, temperature, frequency, and ripple-current curves.
These curves do not guarantee minimum operating capacitance. X5R capacitor temperature must remain within -55 to +85 C, including self-heating.
Final placement must keep each output capacitor close to its inductor output and converter ground.

Each feedback divider connects from the filtered output to ground, with `FB` at the midpoint.
The TPS62903 uses a nominal 0.6 V feedback reference.
Equation 10 on page 18 gives `VOUT = 0.6 V × (1 + Rtop/Rbottom)`.

| Rail | Top resistor | Bottom resistor | Nominal output | Bridge limits |
| --- | ---: | ---: | ---: | ---: |
| VCCL | 26.1 kΩ | 12.1 kΩ | 1.894215 V | 1.85–1.95 V |
| VDD | 10.7 kΩ | 12.1 kΩ | 1.130579 V | 1.10–1.16 V |

All four divider resistors have ±0.1% initial tolerance and ±25 ppm/C temperature coefficients.
Both bottom resistors carry approximately 49.6 µA at nominal regulation, above TI's 2 µA minimum.
The [Yageo RT datasheet](datasheets/YAGEO-RT-series.pdf) specifies the resistor family.
The divider branches sit in parallel with the output capacitors and do not carry the bridge load current.
Final placement must keep each divider near `FB` and ground, away from `SW` and the inductor.

The static component budget includes ±0.9% reference error, resistor tolerance, temperature drift, and maximum 70 nA FB leakage.
It assumes a conservative 125 C change from the resistors' 25 C reference temperature.
The calculated ranges are 1.8648–1.9239 V for VCCL and 1.1153–1.1459 V for VDD.
Both ranges fit the bridge limits, with at least 14 mV left at either limit.
These calculations do not qualify the complete supply. PCB losses, ripple, and load changes must fit the remaining margins.
The [source index](datasheets/sources.json) records assumptions and retains the superseded TPS62130 calculations.
The power budget, effective capacitance, thermal behavior, startup sequencing, and final PCB routing remain open design work.

### Speed

The original project notes ask about speed limitations.
The project does not establish an end-to-end bandwidth limit or measured throughput.
The physical x16 connector does not establish the number of active PCIe lanes.

## Repository files

| Path | Contents |
| --- | --- |
| [index.circuit.tsx](index.circuit.tsx) | Main board and schematic sheets |
| [components/](components/) | Buck supplies, enable supervisor, bridge reset, programming access, USB4 lanes, PSU status, and slot switches |
| [imports/](imports/) | Component definitions, pin labels, and footprints |
| [datasheets/](datasheets/) | Component datasheets and reference documents |
| [datasheets/sources.json](datasheets/sources.json) | Datasheet sources, part mappings, selection notes, and hashes |
| [slot-power-parts.json](slot-power-parts.json) | Slot-switch parts and reference substitutions |
| [tests/](tests/) | Circuit connection, component, and footprint tests |
| [lib/utils.ts](lib/utils.ts) | Helper for signal and pin ordering |
| [schematic/config.ts](schematic/config.ts) | Schematic sheet configuration |
| [tscircuit.config.json](tscircuit.config.json) | tscircuit configuration |
| [jlcpcb-clearance-rules.json](jlcpcb-clearance-rules.json) | Stored fabrication clearance targets |
