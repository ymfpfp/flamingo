import {sortByAlphabetical} from "lib/utils";
import type {ComponentProps} from "react";
import {Fragment} from "react";

const genPinLabels = (
  identStart: string, 
  start: number, 
  end: number, 
  format: string,
  labelStart?: number,
) => {
  const pinLabels = {} as Record<string, string>;
  for (let i = start; i <= end; i++) 
    pinLabels[identStart + String(i)] = 
      labelStart ?
      format.replace("${n}", String((i - start) + labelStart)) : format;
  return pinLabels;
};

// For ASM2464PDX, there are two naming schemes, the physical ball identifier and 
// the signal name.
const pinMap: Record<string, string> = {
  A1: "GPIO3",
  A2: "SPI_CS",
  A3: "SPI_DO",
  A4: "SPI_DI",
  A5: "SPI_CLK",
  ...genPinLabels("A", 6, 18, "GPIO${n}", 15),
  A19: "GPIO8",
  A20: "GPIO14",
  A21: "UART_RX",

  B1: "GPIO2",
  ...genPinLabels("B", 2, 20, "NC_B${n}", 2),
  B21: "UART_TX",

  C1: "GPIO1",
  C2: "NC_C2",
  C20: "NC_C20",
  C21: "HDDPC",

  D1: "GPIO0",
  D2: "NC_D2",
  D4: "GND",
  D5: "GND",
  D6: "VCCH",
  D8: "VCCH",
  D9: "VCCH",
  D11: "GND",
  D13: "VCCH",
  D14: "VDD",
  D16: "VDD",
  D17: "GND",
  D18: "GND",
  D20: "NC_D20",
  /** Active-low PCIe reset output; do not tie this output to ground. */
  D21: "PERST3",

  E1: "I2C_CLK_P",
  E2: "NC_E2",
  E4: "GND",
  E5: "GND",
  E6: "VCCH",
  E8: "VCCH",
  E9: "VCCH",
  E11: "VDD",
  E13: "VCCH",
  E14: "VDD",
  E16: "VDD",
  E17: "GND",
  E18: "GND",
  E20: "NC_E20",
  /** Active-low PCIe reset output. */
  E21: "PERST2",

  F1: "I2C_DATA_P",
  F2: "NC_F2",
  F4: "GND",
  F5: "GND",
  F6: "VCCH", 
  F8: "GND",
  F9: "VDD",
  F11: "VDD",
  F13: "VCCH",
  F14: "VDD",
  F16: "VDD",
  F17: "GND",
  F18: "GND",
  F20: "NC_F20",
  /** Active-low PCIe reset output. */
  F21: "PERST1",

  G1: "VBUS",
  G2: "NC_G2",
  G20: "NC_G20",
  /** Active-low PCIe reset output. */
  G21: "PERST0",

  /** Active-low reset input; hold low during startup, then release. */
  H1: "RST",
  H2: "NC_H2",
  H4: "GND",
  H5: "VCCA33",
  H6: "VCCH",
  H8: "GND",
  H9: "VDD",
  H11: "VDD",
  H13: "VDD",
  H14: "VDD",
  H16: "VDD",
  H17: "GND",
  H18: "GND",
  H20: "NC_H20",
  H21: "TEST_EN",

  J1: "SBU2",
  J2: "NC_J2",
  ...genPinLabels("J", 4, 6, "GND"),
  J8: "VDD",
  J9: "VDD",
  J11: "GND",
  J13: "VDD",
  J14: "VDD",
  ...genPinLabels("J", 16, 18, "VDD"),
  J20: "VDD",
  J21: "VDD",

  K1: "SBU1",
  K2: "GND",
  K20: "VDD",
  K21: "VDD",

  L1: "GNDA",
  L2: "GNDA",
  L4: "GNDA",
  L5: "GNDA",
  L6: "VCCL",
  L8: "VDD",
  L9: "GND",
  L11: "VDD",
  L13: "GND",
  L14: "VDD",
  ...genPinLabels("L", 16, 18, "VCCL"),
  L20: "VCCL",
  L21: "VCCL",

  M1: "UDP",
  M2: "UDM",
  M20: "GNDA",
  M21: "GNDA",

  N1: "GNDA",
  N2: "GNDA",
  N4: "GNDA",
  N5: "GNDA",
  N6: "VCCL",
  N8: "VDD",
  N9: "GND", 
  N11: "GND",
  N13: "GND",
  N14: "VDD",
  N16: "VCCL",
  N17: "GNDA",
  N18: "GNDA",
  N20: "PRXN0",
  N21: "PRXP0",

  P1: "URXP0",
  P2: "URXN0",
  P4: "GNDA",
  P5: "GNDA",
  P6: "VCCL",
  P8: "VDD",
  P9: "GND",
  P11: "GND",
  P13: "VDD",
  P14: "VDD",
  P16: "VCCL",
  P17: "GNDA",
  P18: "GNDA",
  P20: "GNDA",
  P21: "GNDA",

  R1: "GNDA",
  R2: "GNDA",
  R20: "PTXP0",
  R21: "PTXN0",

  T1: "UTXP0",
  T2: "UTXN0",
  T4: "GNDA",
  T5: "GNDA",
  T6: "VCCL",
  T8: "VDD",
  T9: "VDD",
  T11: "VDD",
  T13: "VDD",
  T14: "VDD",
  T16: "VCCL",
  T17: "GNDA",
  T18: "GNDA",
  T20: "GNDA",
  T21: "GNDA",

  U1: "GNDA",
  U2: "GNDA",
  U4: "GNDA",
  U5: "GNDA",
  U6: "VCCL",
  U8: "VDD",
  U9: "VDD",
  U11: "VCCL",
  U13: "VCCL",
  U14: "VCCL",
  U16: "VCCL",
  U17: "GNDA",
  U18: "GNDA",
  U20: "PTXP1",
  U21: "PTXN1",

  V1: "UTXN1",
  V2: "UTXP1",
  ...genPinLabels("V", 4, 6, "GNDA"),
  V8: "GNDA",
  V9: "GNDA",
  V11: "GNDA",
  V13: "GNDA",
  V14: "GNDA",
  ...genPinLabels("V", 16, 18, "GNDA"),
  V20: "GNDA",
  V21: "GNDA",

  W1: "GNDA",
  W2: "GNDA",
  W20: "PRXN1",
  W21: "PRXP1",

  Y1: "URXN1",
  Y2: "URXP1",
  Y3: "GNDA",
  Y4: "XO",
  Y5: "GNDA",
  Y6: "CC2",
  Y7: "REFCLK_N3",
  Y8: "REFCLK_N0",
  Y9: "GNDA",
  Y10: "REFCLK_N2",
  Y11: "REFCLK_N1",
  Y12: "GNDA",
  Y13: "PRXN3",
  Y14: "GNDA",
  Y15: "PTXP3",
  Y16: "GNDA",
  Y17: "PTXP2",
  Y18: "GNDA",
  Y19: "PRXP2",
  Y20: "GNDA",
  Y21: "GNDA",

  AA1: "GNDA",
  AA2: "GNDA",
  AA3: "REXT",
  AA4: "XI",
  AA5: "GNDA",
  AA6: "CC1",
  AA7: "REFCLK_P3",
  AA8: "REFCLK_P0",
  AA9: "GNDA",
  AA10: "REFCLK_P2",
  AA11: "REFCLK_P1",
  AA12: "GNDA",
  AA13: "PRXP3",
  AA14: "GNDA",
  AA15: "PTXN3",
  AA16: "GNDA",
  AA17: "PTXN2",
  AA18: "GNDA",
  AA19: "PRXN2",
  AA20: "GNDA",
  AA21: "GNDA",
};
const rows = [
  ...new Set(Object.keys(pinMap).map(physical => physical.replace(/\d+$/, "")))
].sort((a, b) => {
  return a.length - b.length || sortByAlphabetical(a, b);
});

const logicalToPhysical = Object.fromEntries(
  Object.keys(pinMap).map((physical, idx) => [`pin${idx + 1}`, physical])
);

const pinLabels = Object.fromEntries(
  Object.entries(logicalToPhysical).map(
    ([logical, physical]) => [logical, pinMap[physical]]
  )
);

// tscircuit selectors cannot contain '#'; use _N for active-low signals and
// retain the existing names as aliases for the board's current connections.
const activeLowSignals = new Set(["SPI_CS", "RST", "PERST0", "PERST1", "PERST2", "PERST3"]);
const schematicPinLabels = Object.fromEntries(
  Object.entries(pinLabels).map(([pin, signal]) => [
    pin,
    activeLowSignals.has(signal) ? [`${signal}_N`, signal] : signal,
  ])
);

const pinAttributes: NonNullable<ComponentProps<"chip">["pinAttributes"]> = {
  VCCH: {requiresPower: true, requiresVoltage: "3.3V"},
  VCCA33: {requiresPower: true, requiresVoltage: "3.3V"},
  VCCL: {requiresPower: true, requiresVoltage: "1.9V"},
  VDD: {requiresPower: true, requiresVoltage: "1.13V"},
  GND: {requiresGround: true},
  GNDA: {requiresGround: true},
  RST: {isInput: true},
  PERST0: {isOutput: true},
  PERST1: {isOutput: true},
  PERST2: {isOutput: true},
  PERST3: {isOutput: true},
  VBUS: {isInput: true},
};

/** Compile nets. */
const nets = [
  "GND",
  "GNDA",
  "VDD",
  "VCCH",
  "VCCA33",
  "VCCL",
];
const connections = Object.fromEntries(
  Object.keys(pinLabels)
    .filter(pin => nets.includes(pinLabels[pin]))
    .map(pin => [pin, `net.${pinLabels[pin]}`])
);
/** For the schematic, narrow down to unique signals. */
const signals = [
  ...new Set(Object.values(pinLabels).filter(name => !name.startsWith("NC")))
];

/** GPIO pins on the schematic. */
const schBottomPins = [
  ...signals
    .filter(name => name.startsWith("GPIO"))
    .sort(sortByAlphabetical),
];
/** Communication pins on the schematic. */
const schTopPins = [
  ...signals
    .filter(name =>
      name.startsWith("SPI") || 
      name.startsWith("UART") || 
      name.startsWith("I2C")
    )
    .sort(sortByAlphabetical),
];
/** PCIe pins on the schematic. */
const schLeftPins = [
  ...signals
    .filter(name => 
      name.startsWith("PRX") || 
      name.startsWith("PTX") || 
      name.startsWith("URX") ||
      name.startsWith("UTX") ||
      name === "HDDPC"
    )
    .sort(sortByAlphabetical),
];
/** Remaining pins on schematic. */
const schRightPins = [
  ...signals
    .filter(name =>
      !schLeftPins.includes(name) && 
      !schBottomPins.includes(name) && 
      !schTopPins.includes(name)
    )
    .sort(sortByAlphabetical),
];

const oblongPads = [
  ...Object.keys(genPinLabels("A", 2, 20, "")),
  ...Object.keys(genPinLabels("AA", 2, 20, "")),
];
/** Rotated by 90 degrees. */
// prettier-ignore
const rotatedOblongPads = [
  "B1", "C1", "D1", "E1", "F1", "G1", "H1", "J1", "K1", "L1", "M1", "N1", "P1", "R1",
  "T1", "U1", "V1", "W1", "Y1", "AA1",

  "B21", "C21", "D21", "E21", "F21", "G21", "H21", "J21", "K21", "L21", "M21", "N21",
  "P21", "R21", "T21", "U21", "V21", "W21", "Y21",
];
/**
 * The package is a mixed-pitch BGA: the outer perimeter ring is a fine-pitch
 * (0.46mm) array, while the interior is a coarser (0.65mm) full-matrix array.
 * Both arrays are centered on the package, so a ball's position is just its
 * index within whichever array it belongs to, scaled by that array's pitch.
 */
const outerPitch = 0.46;
const innerPitch = 0.65;

/** Rows that span the full width (i.e. every column is a perimeter ball). */
const perimeterRowIdents = new Set(["A", "B", "Y", "AA"]);
/** Columns that form the left/right edges of the perimeter ring. */
const perimeterColNumbers = new Set([1, 2, 20, 21]);

/** Row identifiers of the interior full-matrix array, top-to-bottom. */
const innerRowIdents = ["D", "E", "F", "H", "J", "L", "N", "P", "T", "U", "V"];
/** Column identifiers of the interior full-matrix array, left-to-right. */
const innerColNumbers = [4, 5, 6, 8, 9, 11, 13, 14, 16, 17, 18];

/** Y is negated so that row A sits at the top, matching the datasheet view. */
const ballToPos = (ball: string) => {
  const rowIdent = ball.replace(/\d+$/, "");
  const col = Number(ball.slice(rowIdent.length));

  // Outer perimeter balls sit on the fine 0.46mm grid.
  const isPerimeter =
    perimeterRowIdents.has(rowIdent) || perimeterColNumbers.has(col);
  if (isPerimeter) {
    return [
      (col - 11) * outerPitch,
      -(rows.indexOf(rowIdent) - 10) * outerPitch,
    ] as const;
  }

  // Interior balls sit on the coarser 0.65mm grid.
  return [
    (innerColNumbers.indexOf(col) - 5) * innerPitch,
    -(innerRowIdents.indexOf(rowIdent) - 5) * innerPitch,
  ] as const;
};
/**
 * The ASM2464PDX is in BGA (Ball Grid Array) form. That is, it is soldered on via
 * balls on its underside. Specifically, it's flip-chip chip-scale package (FCCSP) - 
 * basically the silicon die is mounted face-down, with tiny bumps that connect it
 * to the actual package form.
 *
 * According to its datasheet and also this reference footprint: https://github.com/openchips/JITx-ASM2464PDX_design/blob/main/components/Asmedia/ASM2464PDX.stanza
 * 
 * - 10x10mm dimensions
 * - Ball count: 273
 * - Ball pitch (center-to-center distance between adjacent balls): 
 *   0.46 mm for the outer-array pitch, 0.65 mm for the inner-array pitch
 * - Ball diameter: 0.23mm
 * - Use 7x13mil oblong pads for the outermost row on each edge, with AA1 horizontal.
 * - The 0.18mm circular lands follow the community footprint linked above and
 *   match JLCPCB's related ASM2464PD footprint, C7509569 (121 internal pads).
 *   The supplier SVG and measurements are saved in datasheets/footprints/.
 *   This is not an ASMedia land-pattern specification for PDX; verify the lands
 *   and mask/paste settings with the assembly provider before fabrication.
 *
 * Routing is especially complicated with BGA because the balls on the inside are also
 * connected to traces. This is typically solved with fanout routing: put a small copper
 * pad beneath each solder ball, then have the pads go through the vias, then route
 * through the vias.
 */
export const Footprint = () => {
  return (
    <footprint>
      {Object.entries(logicalToPhysical).map(([pin, ball]) => {
        const rotatedOblong = rotatedOblongPads.includes(ball);
        const isOblong = oblongPads.includes(ball) || rotatedOblong;
        const padShape = isOblong ? {
          shape: "pill" as const,
          radius: "0.0889mm",
          width: rotatedOblong ? "0.3302mm" : "0.1778mm",
          height: rotatedOblong ? "0.1778mm" : "0.3302mm",
        } : {
          shape: "circle" as const,
          radius: "0.09mm",
        };
        const [x, y] = ballToPos(ball);
        return <Fragment key={ball}><smtpad
          name={ball}
          pcbX={x} 
          pcbY={y} 
          portHints={[pin, ball]} 
          layer="top" 
          {...padShape}
        /></Fragment>;
      })}
      <fabricationnoterect width="10mm" height="10mm" strokeWidth={0.1}/>
      {/* A1 is top-left in the PCB top view; p.22's bottom view is mirrored. */}
      <silkscreenpath
        strokeWidth={0.15}
        route={[{x: -5.4, y: 4.9}, {x: -5.4, y: 5.4}, {x: -4.9, y: 5.4}]}
      />
      <courtyardrect
        pcbX={0}
        pcbY={0}
        width="12mm"
        height="12mm"
        strokeWidth={0.1}
      />
    </footprint>
  );
};

export default function ASM2464PDX({schSectionName}: {schSectionName?: string} = {}) {
  return (
    <>
      <chip
        name="ASM2464PDX"
        schSectionName={schSectionName}
        manufacturerPartNumber="ASM2464PDX"
        datasheetUrl="https://static.kolabo.dev/pub/docs/ASMedia/ASM2464/PDX/ASM2464PDX_DataSheet_R0_3.pdf"
        footprint={<Footprint/>}
        pinAttributes={pinAttributes}
        noConnect={[
          ...Object.values(pinMap).filter(name => name.startsWith("NC")),
          // Optional NVMe activity LED is not used.
          "GPIO0",
          // Built-in USB-C/PD support is used; no external PD interrupt.
          "GPIO1",
          // Optional second NVMe activity LED is not used.
          "GPIO3",
          // Optional third and fourth NVMe activity LEDs are not used.
          "GPIO25",
          "GPIO26",
          // Optional drive-cloning progress LEDs are not used.
          "GPIO15",
          "GPIO16",
          "GPIO17",
          "GPIO18",
          // One x4 port uses GPIO2 for presence; extra port presence inputs are unused.
          "GPIO19",
          "GPIO21",
          "GPIO27",
          // The extra port power-control output HDDPC1 is not used.
          "GPIO20",
          // One x4 port uses GPIO8/CLKREQ0; other clock-request signals are unused.
          "GPIO14",
          "GPIO23",
          "GPIO24",
          // We're not using I2C.
          "I2C_CLK_P",
          "I2C_DATA_P",
          // One x4 port uses PERST0; the other port reset outputs are unused.
          "PERST1",
          "PERST2",
          "PERST3",
          // One x4 port uses REFCLK pair 0; the other clock outputs are unused.
          "REFCLK_P1",
          "REFCLK_N1",
          "REFCLK_P2",
          "REFCLK_N2",
          "REFCLK_P3",
          "REFCLK_N3",
        ]}
        connections={connections}
        pinLabels={
          /** Here's what each pad is called on the schematic. We hide some. */
          schematicPinLabels
        }
        schPinArrangement={{
          /** Let's rearrange schematic by purpose. */
          leftSide: {
            direction: "top-to-bottom",
            pins: schLeftPins,
          },
          rightSide: {
            direction: "top-to-bottom",
            pins: schRightPins,
          },
          topSide: {
            direction: "left-to-right",
            pins: schTopPins,
          },
          bottomSide: {
            direction: "left-to-right",
            pins: schBottomPins,
          }
        }}
        schWidth="4mm"
        schHeight="8mm"
      />
      {/* Extend the shorter SPI/UART label stubs to the shared top edge.
          These short green segments are schematic graphics; net connectivity
          remains on the inline labels and their generated traces. */}
      {[-0.645, 0.155, 0.355].map((x) => (
        <Fragment key={`top-label-extension-${x}`}>
          <schematicline x1={x} y1={7.56} x2={x} y2={7.64}
            strokeWidth={0.02} color="rgb(0, 150, 0)"/>
        </Fragment>
      ))}
      {/* Align the right-side label stubs with USB_VBUS_SENSE (1.4 mm).
          REXT remains a routed connection; unused pins keep their NC marks. */}
      {([
        ["CC1", 4.9, 0.84], ["CC2", 4.7, 0.84],
        ["GND", 4.5, 0.6], ["GNDA", 4.3, 0.6],
        ["PERST0", 4.1, 1.24],
        ["REFCLK_N0", 3.3, 1.32], ["REFCLK_P0", 2.5, 1.32],
        ["RST", 1.5, 1],
        ["SBU1", 1.3, 0.92], ["SBU2", 1.1, 0.92],
        ["TEST_EN", 0.9, 1.16],
        ["UDM", 0.7, 0.84], ["UDP", 0.5, 0.84],
        ["VCCA33", 0.1, 0.76], ["VCCH", -0.1, 0.6],
        ["VCCL", -0.3, 0.6], ["VDD", -0.5, 0.6],
        ["XI", -0.7, 0.76], ["XO", -0.9, 0.76],
      ] as const).map(([pin, y, length]) => (
        <Fragment key={`right-label-extension-${pin}`}>
          <schematicline x1={2.055 + length} y1={y} x2={3.455} y2={y}
            strokeWidth={0.02} color="rgb(0, 150, 0)"/>
        </Fragment>
      ))}
      <netlabel inline
        connection="ASM2464PDX.GND"
        net="GND"
      />
      <netlabel inline
        connection="ASM2464PDX.GNDA"
        net="GNDA"
      />
      <netlabel inline
        connection="ASM2464PDX.VCCA33"
        net="VCCA33"
      />
      <netlabel inline
        connection="ASM2464PDX.VCCH"
        net="VCCH"
      />
      <netlabel inline
        connection="ASM2464PDX.VCCL"
        net="VCCL"
      />
      <netlabel inline
        connection="ASM2464PDX.VDD"
        net="VDD"
      />
    </>
  );
}
