# Flamingo

Flamingo is a PCB project for a USB4/Thunderbolt-to-PCIe adapter around the ASMedia ASM2464PDX bridge.
The project uses TypeScript and TSX with tscircuit to describe the schematic and PCB.
The design includes a PCIe slot and an ATX power connector.

## Current design

The main circuit is in [index.circuit.tsx](index.circuit.tsx).
It contains four schematic sheets:

- `chip`: the ASM2464PDX bridge, SPI flash, a UART header, a 25 MHz crystal, and a 10 pF capacitor.
- `pcie`: the PCIe connector, four active lanes, and TX coupling capacitors.
- `power`: the 24-pin ATX connector and two TPS62130 buck converters for `VCCL` and `VDD`.
- `usb`: the GT-USB-7087B receptacle, USB4 coupling capacitors, ESD clamps, and discharge resistors.

The board configuration specifies four layers and a thickness of 1.6 mm.

The source connects the SPI signals, crystal, and selected ATX power pins.
The PCIe x4 data lanes connect to the bridge. PCIe control signals and the buck converter circuits remain incomplete.
The USB-C connector has ground, USB2, CC, SBU, and VBUS-sense connections to the bridge.
USB VBUS remains separate from the ATX supply rails.
All four USB4 differential pairs connect to the bridge through eight AC-coupling capacitors.
Each conductor has a separate ESD clamp to ground and a connector-side discharge resistor.
All six connector shell pads connect directly to `GND`, as in the ASMedia reference schematic.
The PCB still needs short copper connections and nearby ground vias at the receptacle.
The status LED has a component definition, but the main circuit does not instantiate it.
The design remains in development, with no established hardware performance results.

## Components

The following components are instantiated in the main circuit:

| Component | Quantity | Role | Definition |
| --- | ---: | --- | --- |
| ASM2464PDX | 1 | USB4/Thunderbolt-to-PCIe bridge with a custom BGA footprint | [ASM2464PDX.tsx](imports/ASM2464PDX.tsx) |
| RC0402FR-0712K1L | 1 | 12.1 kΩ, ±1% REXT reference resistor to GND | [RC0402FR_0712K1L.tsx](imports/RC0402FR_0712K1L.tsx) |
| W25Q32JVSSIQ | 1 | SPI flash connected to the bridge | [W25Q32JVSSIQ.tsx](imports/W25Q32JVSSIQ.tsx) |
| XXCBCLNANF-25M | 1 | 25 MHz crystal | [XXCBCLNANF_25M.tsx](imports/XXCBCLNANF_25M.tsx) |
| TCC0402COG100J500AT | 1 | 10 pF capacitor in the crystal circuit | [TCC0402COG100J500AT.tsx](imports/TCC0402COG100J500AT.tsx) |
| X3183WV-164B1-46V01 | 1 | PCIe x16 connector | [X3183WV_164B1_46V01.tsx](imports/X3183WV_164B1_46V01.tsx) |
| 39301240 | 1 | 24-pin ATX power connector | [A_39301240.tsx](imports/A_39301240.tsx) |
| TPS62130RGTR | 2 | Buck converters named `VCCL_BUCK` and `VDD_BUCK` | [TPS62130RGTR.tsx](imports/TPS62130RGTR.tsx) |
| GT-USB-7087B | 1 | USB4 40 Gbps, 24-contact USB-C receptacle; JLCPCB C3019713 | [GT_USB_7087B.tsx](imports/GT_USB_7087B.tsx) |
| GRM033R61E224KE01D | 4 | USB4 TX coupling, 220 nF, 25 V, ±10%, X5R, 0201; C701263 | [GRM033R61E224KE01D.tsx](imports/GRM033R61E224KE01D.tsx) |
| GRM033R61E334KE15D | 4 | USB4 RX coupling, 330 nF, 25 V, ±10%, X5R, 0201; C723889 | [GRM033R61E334KE15D.tsx](imports/GRM033R61E334KE15D.tsx) |
| ESD150B1W0201E6327XTSA1 | 8 | Infineon reference ESD clamp, single-channel bidirectional, 0201; C3709987 | [ESD150B1W0201E6327XTSA1.tsx](imports/ESD150B1W0201E6327XTSA1.tsx) |
| RC0201FR-07220KL | 8 | USB4 discharge resistor, 220 kΩ, ±1%, 25 V, 0201; C142020 | [RC0201FR_07220KL.tsx](imports/RC0201FR_07220KL.tsx) |

The repository also contains these component definitions:

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
Powered-off VBUS tolerance remains a power-design follow-up. The examined datasheet does not explicitly establish tolerance when VCCH is absent.
A divider alone does not establish powered-off tolerance or provide overvoltage protection.

The source contains eight Infineon TVS clamps on the high-speed conductors only.
USB2, CC, SBU, and VBUS have no external TVS components in the current source.
Reference sheet 3 also omits separate clamps on those signals, so their absence alone does not establish a functional wiring error.
System ESD and VBUS-short protection for these exposed signals remain unqualified.

All 10 existing circuit tests and the TypeScript check passed. These checks do not establish hardware attach, negotiation, or ESD performance.
No circuit components changed during this review.

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
Neither larger X7R alternative is instantiated. The Samsung TX listing reports two pieces, insufficient for one board. The Yageo RX listing reports 7,522 pieces.
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
The buck converters do not yet include connections or supporting components.
The power budget and converter outputs remain open design questions.

### Speed

The original project notes ask about speed limitations.
The project does not establish an end-to-end bandwidth limit or measured throughput.
The physical x16 connector does not establish the number of active PCIe lanes.

## Repository files

| Path | Contents |
| --- | --- |
| [index.circuit.tsx](index.circuit.tsx) | Main board and schematic sheets |
| [imports/](imports/) | Component definitions, pin labels, and footprints |
| [datasheets/](datasheets/) | Component datasheets and reference documents |
| [lib/utils.ts](lib/utils.ts) | Helper for signal and pin ordering |
| [schematic/config.ts](schematic/config.ts) | Schematic sheet configuration |
| [tscircuit.config.json](tscircuit.config.json) | tscircuit configuration |
| [jlcpcb-clearance-rules.json](jlcpcb-clearance-rules.json) | Stored fabrication clearance targets |
