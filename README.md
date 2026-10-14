# Flamingo

Flamingo is a PCB project for a USB4/Thunderbolt-to-PCIe adapter around the ASMedia ASM2464PDX bridge.
The project uses TypeScript and TSX with tscircuit to describe the schematic and PCB.
The design includes a PCIe slot and an ATX power connector.

## Current design

The main circuit is in [index.circuit.tsx](index.circuit.tsx).
It contains three schematic sheets:

- `chip`: the ASM2464PDX bridge, SPI flash, a 25 MHz crystal, a 10 pF capacitor, and the PCIe connector.
- `power`: the 24-pin ATX connector and two TPS62130 buck converters for `VCCL` and `VDD`.
- `usb`: the GT-USB-7087B USB4 receptacle, named `USBC`.

The board configuration specifies four layers and a thickness of 1.6 mm.

The source connects the SPI signals, crystal, and selected ATX power pins.
The PCIe signals and buck converter circuits remain incomplete.
The USB-C connector has ground, USB2, CC, SBU, and VBUS-sense connections to the bridge.
USB VBUS remains separate from the ATX supply rails.
The high-speed pairs end at named nets until AC coupling and ESD protection are added.
The connector shield uses a separate `USB_SHIELD` net.
Its ground termination remains incomplete.
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

The repository also contains these component definitions:

| Component | Intended role | Definition |
| --- | --- | --- |
| XL-1608SURC-06 | Status LED | [XL_1608SURC_06.tsx](imports/XL_1608SURC_06.tsx) |

The component list describes the current source, not a complete manufacturing bill of materials.
Component datasheets and reference documents are in [datasheets/](datasheets/).
The [datasheet source index](datasheets/sources.json) records component mappings, source URLs, document notes, and file hashes.

The GT-USB-7087B replaces the USB 2.0-only TYPE-C-31-M-12, which lacks the high-speed USB4 contacts.
Its [manufacturer drawing](datasheets/GT-USB-7087B.pdf) specifies data transmission up to 40 Gbps.
The [JLCPCB listing](https://jlcpcb.com/partdetail/GSwitch-GT_USB7087B/C3019713) identifies it as an extended part.
Its exact imported footprint includes a cutout for the body, which sits 0.23 mm below the PCB surface.
The connector center height is 1.35 mm.
Protection circuits, high-speed connections, and final placement at the board edge remain incomplete.

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
