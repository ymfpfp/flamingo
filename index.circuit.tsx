import {Fragment} from "react";
import {UartHeader} from "components/UartHeader";
import {Usb4Lanes, usb4Signals} from "components/Usb4Lanes";
import {A_0402WGF1002TCE} from "imports/A_0402WGF1002TCE";
import {A_39301240} from "imports/A_39301240";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import ASM2464PDX from "imports/ASM2464PDX";
import {GT_USB_7087B} from "imports/GT_USB_7087B";
import {RC0402FR_0712K1L} from "imports/RC0402FR_0712K1L";
import {TCC0402COG100J500AT} from "imports/TCC0402COG100J500AT";
import {TPS62130RGTR} from "imports/TPS62130RGTR";
import {W25Q32JVSSIQ} from "imports/W25Q32JVSSIQ";
import {X3183WV_164B1_46V01} from "imports/X3183WV_164B1_46V01";
import {XXCBCLNANF_25M} from "imports/XXCBCLNANF_25M";

// The slot is mechanically x16; the bridge supplies four PCIe lanes.
const unusedPcieLanes = ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const)
  .flatMap(lane => [`TX${lane}_P`, `TX${lane}_N`, `RX${lane}_P`, `RX${lane}_N`] as const);

export default function Board() {
  return (
    <board
      pcbPack
      pcbPackGap="7mm"
      anchorAlignment="bottom_left"
      boardAnchorPosition={{x: 0, y: 0}}
      routingDisabled={true}
      layers={4}
      thickness="1.6mm"
      schLayout={{ layoutMode: "none" }}
    >
      <net name="GND"/>
      <net name="GDNA"/>
      <net name="VDD"/>
      <net name="VCCH" connectsTo={["net.V3V3"]}/>
      <net name="VCCL"/>

      <net name="V3V3"/>
      {/* Standby 3.3 V for the PCIe slot; requires a regulator from V5VSB. */}
      <net name="V3V3_AUX"/>
      <net name="V5V"/>
      <net name="V5VSB"/>
      <net name="V12V"/>
      <net name="USB_VBUS" connectsTo={[".ASM2464PDX > .VBUS"]}/>
      {usb4Signals.map(signal => (
        <Fragment key={signal.name}>
          <net
            name={`ASM_${signal.bridgePin}`}
            connectsTo={[`.ASM2464PDX > .${signal.bridgePin}`]}
          />
        </Fragment>
      ))}
      {/* Named nets carry PCIe lanes between the bridge and connector sheets. */}
      {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).flatMap(polarity => (
        ["TX", "RX"].map(direction => (
          <Fragment key={`ASM_P${direction}${polarity}${lane}`}>
            <net
              name={`ASM_P${direction}${polarity}${lane}`}
              connectsTo={[`.ASM2464PDX > .P${direction}${polarity}${lane}`]}
            />
          </Fragment>
        ))
      )))}

      <schematicsheet name="chip" sheetIndex={1}>
        <group schX={5} schY={0}>
          <ASM2464PDX/>
          <UartHeader
            name="UART"
            schX={-5}
            schY={3}
            connections={{
              GND: "net.GND",
              TX: ".ASM2464PDX > .UART_TX",
              RX: ".ASM2464PDX > .UART_RX",
            }}
          />
          {/* UART_TX is sampled as MEMREPAIR at startup (ASMedia section 5.1).
              Bias it high through a resistor so UART can still drive it low. */}
          <resistor
            name="R_UART_TX"
            resistance="4.7k"
            footprint="0402"
            manufacturerPartNumber="0402WGF4701TCE"
            supplierPartNumbers={{jlcpcb: ["C25900"]}}
            schX={-5}
            schY={5}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".ASM2464PDX > .UART_TX"}}
          />
          <netlabel
            net="V3V3"
            connection="R_UART_TX.pin1"
            schX={-5}
            schY={6}
            anchorSide="bottom"
          />
          {[
            "UART_TX is sampled at power-on.",
            "High enables internal memory repair (MEMREPAIR).",
            "The 4.7k pull-up allows normal UART output.",
            "ASMedia datasheet, section 5.1.",
          ].map((text, index) => (
            <Fragment key={text}>
              <schematictext
                text={text}
                schX={-6.5}
                schY={5.5 - index * 0.32}
                fontSize={0.18}
                anchor="right"
              />
            </Fragment>
          ))}
          <RC0402FR_0712K1L
            name="R1"
            schX={6}
            schY={-0.7}
            schRotation={-90}
            connections={{
              pin1: ".ASM2464PDX > .REXT",
              pin2: "net.GND",
            }}
          />
          <W25Q32JVSSIQ
            name="SPI"
            schY={8}
            schPinArrangement={{
              leftSide: {direction: "top-to-bottom", pins: [3, 1, 2, 4]},
              rightSide: {direction: "top-to-bottom", pins: [8, 7, 6, 5]},
            }}
            connections={{
              N_CS: ".ASM2464PDX > .SPI_CS",
              DO_IO1: ".ASM2464PDX > .SPI_DI",
              DI_IO0: ".ASM2464PDX > .SPI_DO",
              CLK: ".ASM2464PDX > .SPI_CLK",
              GND: "net.GND",
              // The flash and bridge SPI I/O use 3.3 V, not the 1.13 V core rail.
              VCC: "net.VCCH",
            }}
          />
          {/* Standard SPI: bias WP/IO2 and unused IO3 high through separate pull-ups. */}
          <A_0402WGF1002TCE
            name="R_SPI_WP"
            schX={-2.6}
            schY={9.4}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".SPI > .WP__IO2"}}
          />
          <netlabel
            net="V3V3"
            connection="R_SPI_WP.pin1"
            schX={-2.6}
            schY={10.3}
            anchorSide="bottom"
          />
          {/* Winbond recommends an IO3 pull-up for non-Quad use:
              https://winbond.com/hq/support/faq/technical/?__locale=en
              We choose 10k to match CS; the FAQ specifies 10k explicitly only for CS. */}
          <A_0402WGF1002TCE
            name="R_SPI_HOLD"
            schX={5}
            schY={8}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".SPI > .HOLD__or_RESET__IO3"}}
          />
          {[
            "Pin 7 is unused IO3 in this standard SPI design.",
            "The 10k pull-up keeps it at a defined high level.",
            "Winbond recommends a pull-up for non-Quad use.",
            "IQ option: QE=1, so the HOLD function is disabled.",
            "W25Q32JV pp. 9, 16; Winbond technical FAQ.",
          ].map((text, index) => (
            <Fragment key={`hold-note-${index}`}>
              <schematictext
                text={text}
                schX={6.5}
                schY={6.8 - index * 0.32}
                fontSize={0.18}
                anchor="left"
              />
            </Fragment>
          ))}
          <A_0402WGF1002TCE
            name="R_SPI_CS"
            schX={-4}
            schY={11}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".SPI > .N_CS"}}
          />
          <netlabel
            net="V3V3"
            connection="R_SPI_CS.pin1"
            schX={-4}
            schY={11.9}
            anchorSide="bottom"
          />
          {/* C73 on ASMedia's reference schematic, sheet 3, is also 100nF. */}
          <CL05B104KO5NNNC
            name="C_SPI_VCC"
            schX={4}
            schY={11}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: "net.GND"}}
          />
          <group schX={4} schY={-5}>
            <XXCBCLNANF_25M
              name="XCLK"
              loadCapacitance="10pF"
              connections={{
                pin1: ".ASM2464PDX > .XI",
                pin2: "net.GND",
                pin3: ".ASM2464PDX > .XO",
                pin4: "net.GND",
              }}
            />
            <TCC0402COG100J500AT name="C1" schOrientation="vertical" connections={{pin1: ".ASM2464PDX > .XI", pin2: ".ASM2464PDX > .XO"}}/>
          </group>
        </group>
      </schematicsheet>
      <schematicsheet name="pcie" displayName="PCIe x4" sheetIndex={4}>
        <X3183WV_164B1_46V01
          name="PCIe"
          schX={-5.88}
          noConnect={unusedPcieLanes}
          connections={{
            GND: "net.GND",
            V12V: "net.V12V",
            V3V3: "net.V3V3",
            V3V3_AUX: "net.V3V3_AUX",
            RX0_P: "net.ASM_PRXP0",
            RX0_N: "net.ASM_PRXN0",
            RX1_P: "net.ASM_PRXP1",
            RX1_N: "net.ASM_PRXN1",
            RX2_P: "net.ASM_PRXP2",
            RX2_N: "net.ASM_PRXN2",
            RX3_P: "net.ASM_PRXP3",
            RX3_N: "net.ASM_PRXN3",
          }}
        />
        <netlabel net="V12V" connection="PCIe.V12V" schX={-7.2} schY={5.4} anchorSide="bottom"/>
        <netlabel net="V3V3" connection="PCIe.V3V3" schX={-5.9} schY={5.4} anchorSide="bottom"/>
        <netlabel net="V3V3_AUX" connection="PCIe.V3V3_AUX" schX={-4.4} schY={5.4} anchorSide="bottom"/>
        {/* Series coupling belongs at each transmitter; the card supplies its own TX capacitors. */}
        {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).map((polarity, index) => (
          <Fragment key={`PCIE_TX${lane}_${polarity}`}>
            <capacitor
              name={`C_TX${lane}_${polarity}`}
              capacitance="220nF"
              maxVoltageRating="10V"
              footprint="0402"
              schOrientation="neg_left"
              // Separate the P/N columns and leave room for both names and values.
              schX={polarity === "P" ? -3 : -1.9}
              schY={3.9 - lane - index * 0.5}
              pcbRotation={lane < 2 ? 0 : 90}
              pcbX={lane < 2
                ? "calc(ASM2464PDX.maxX + 2mm)"
                : `calc(ASM2464PDX.x + ${(lane === 2 ? 2.5 : 0.5) + index}mm)`}
              pcbY={lane < 2
                ? `calc(ASM2464PDX.y - ${1 + lane * 2 + index}mm)`
                : "calc(ASM2464PDX.minY - 2mm)"}
              connections={{
                pin2: `.PCIe > .TX${lane}_${polarity}`,
              }}
            />
            <netlabel
              net={`ASM_PTX${polarity}${lane}`}
              connection={`C_TX${lane}_${polarity}.pin1`}
              schX={0.5}
              schY={3.9 - lane - index * 0.5}
              anchorSide="left"
            />
          </Fragment>
        )))}
        <schematictext
          text="220 nF / 10 V matches the ASMedia reference schematic."
          schX={-3.5}
          schY={-1}
          fontSize={0.18}
          anchor="left"
        />
        <schematictext
          text="ASM2464PDX_TI_R03, sheet 6: C124, C125, C126, C128."
          schX={-3.5}
          schY={-1.35}
          fontSize={0.18}
          anchor="left"
        />
      </schematicsheet>
      <schematicsheet name="usb" sheetIndex={3}>
        <schematicsection name="USB" displayName="USB4 Receptacle"/>
        <GT_USB_7087B
          name="USBC"
          // Reserve room for the connector courtyard during automatic packing.
          pcbMarginX="1mm"
          pcbMarginY="1mm"
          schSectionName="USB"
          schX={0}
          schY={0}
          connections={{
            A1: "net.GND", A12: "net.GND", B1: "net.GND", B12: "net.GND",
            A4: "net.USB_VBUS", A9: "net.USB_VBUS", B4: "net.USB_VBUS", B9: "net.USB_VBUS",
            A5: ".ASM2464PDX > .CC1", B5: ".ASM2464PDX > .CC2",
            A6: ".ASM2464PDX > .UDP", B6: ".ASM2464PDX > .UDP",
            A7: ".ASM2464PDX > .UDM", B7: ".ASM2464PDX > .UDM",
            A8: ".ASM2464PDX > .SBU1", B8: ".ASM2464PDX > .SBU2",
            // These nets connect through Usb4Lanes to the corresponding bridge pins.
            A2: "net.USB_TX1_P", A3: "net.USB_TX1_N",
            B2: "net.USB_TX2_P", B3: "net.USB_TX2_N",
            B11: "net.USB_RX1_P", B10: "net.USB_RX1_N",
            A11: "net.USB_RX2_P", A10: "net.USB_RX2_N",
            // Bond all shell contacts directly to GND, as in ASMedia reference CON1.
            pin3: "net.GND", pin4: "net.GND",
            pin2: "net.GND", pin1: "net.GND",
            EP1_FRONT: "net.GND", EP2_FRONT: "net.GND",
          }}
        />
        <Usb4Lanes/>
      </schematicsheet>
      <schematicsheet name="power" sheetIndex={2}>
        <A_39301240
          name="ATX"
          schX={-4}
          schY={0}
          noConnect={["pin14", "pin20"]}
          connections={{
            pin1: "net.V3V3",
            pin2: "net.V3V3",
            pin12: "net.V3V3",
            pin13: "net.V3V3",
            pin4: "net.V5V",
            pin6: "net.V5V",
            pin9: "net.V5VSB",
            pin21: "net.V5V",
            pin22: "net.V5V",
            pin23: "net.V5V",
            pin10: "net.V12V",
            pin11:  "net.V12V",
            pin3: "net.GND",
            pin5: "net.GND",
            pin7: "net.GND",
            pin15: "net.GND",
            pin17: "net.GND",
            pin18: "net.GND",
            pin19: "net.GND",
            pin24: "net.GND",
          }}
        />
        <TPS62130RGTR name="VCCL_BUCK" schX={0} schY={0}/>
        <TPS62130RGTR name="VDD_BUCK" schX={4} schY={0}/>
      </schematicsheet>
    </board>
  );
}
