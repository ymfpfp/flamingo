import {Fragment} from "react";
import {BridgeReset} from "components/BridgeReset";
import {BuckEnable} from "components/BuckEnable";
import {BuckInputs} from "components/BuckInputs";
import {PsuControl} from "components/PsuControl";
import {SpiProgrammingHeader} from "components/SpiProgrammingHeader";
import {SlotPower} from "components/SlotPower";
import {UartHeader} from "components/UartHeader";
import {Usb4Lanes, usb4Signals} from "components/Usb4Lanes";
import {A_0402WGF0000TCE} from "imports/A_0402WGF0000TCE";
import {A_0402WGF1002TCE} from "imports/A_0402WGF1002TCE";
import {A_39301240} from "imports/A_39301240";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import ASM2464PDX from "imports/ASM2464PDX";
import {GT_USB_7087B} from "imports/GT_USB_7087B";
import {RC0402FR_0712K1L} from "imports/RC0402FR_0712K1L";
import {TCC0402COG100J500AT} from "imports/TCC0402COG100J500AT";
import {W25Q32JVSSIQ} from "imports/W25Q32JVSSIQ";
import {X1618WVS_164_9TV30} from "imports/X1618WVS_164_9TV30";
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
      <net name="BUCK_EN"/>
      <net name="VCCH_SENSE"/>

      <net name="V3V3"/>
      {/* Standby 3.3 V for the PCIe slot; requires a regulator from V5VSB. */}
      <net name="V3V3_AUX"/>
      <net name="V5V"/>
      <net name="V5VSB"/>
      <net name="V12V"/>
      <net name="ATX_PWR_OK"/>
      <net name="SLOT_3V3"/>
      <net name="SLOT_12V"/>
      <net name="ASM_HDDPC" connectsTo={[".ASM2464PDX > .HDDPC"]}/>
      <net name="USB_VBUS" connectsTo={[".ASM2464PDX > .VBUS"]}/>
      <net name="ASM_PERST0_N" connectsTo={[".ASM2464PDX > .PERST0"]}/>
      <net name="ASM_RST_N" connectsTo={[".ASM2464PDX > .RST"]}/>
      <net name="ASM_REFCLK_P0" connectsTo={[".ASM2464PDX > .REFCLK_P0"]}/>
      <net name="ASM_REFCLK_N0" connectsTo={[".ASM2464PDX > .REFCLK_N0"]}/>
      <net name="ASM_CLKREQ_N" connectsTo={[".ASM2464PDX > .GPIO8"]}/>
      <net name="ASM_WAKE_N" connectsTo={[".ASM2464PDX > .GPIO22"]}/>
      <net name="ASM_PRESENT_N" connectsTo={[".ASM2464PDX > .GPIO2"]}/>
      <net name="PCIE_PRESENT_N"/>
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

      <schematicsheet name="bridge" sheetIndex={1}>
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
          {/* Match the reference design: hold TEST_EN low during normal operation. */}
          <resistor
            name="R_TEST_EN"
            resistance="4.7k"
            footprint="0402"
            manufacturerPartNumber="0402WGF4701TCE"
            supplierPartNumbers={{jlcpcb: ["C25900"]}}
            schX={8}
            schY={1}
            schOrientation="vertical"
            connections={{pin1: ".ASM2464PDX > .TEST_EN", pin2: "net.GND"}}
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
                schY={6.6 - index * 0.32}
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
        <BridgeReset/>
        <schematicsection name="SPI_PROGRAMMING" displayName="SPI Programming"/>
        <SpiProgrammingHeader
          name="SPI_PROG"
          schSectionName="SPI_PROGRAMMING"
          schX={18}
          schY={11}
          connections={{
            GND: "net.GND",
            V3V3: "net.VCCH",
            CS_N: ".SPI > .N_CS",
            CLK: ".SPI > .CLK",
            MOSI: ".SPI > .DI_IO0",
            MISO: ".SPI > .DO_IO1",
          }}
        />
        {[
          "SPI programming access: custom 1x6 pinout, 2.54mm pitch.",
          "MOSI goes to flash DI; MISO comes from flash DO.",
          "3V3 connects directly to the board supply.",
          "Shared with ASM2464PDX; bus isolation must be verified.",
        ].map((text, index) => (
          <Fragment key={`spi-programming-note-${index}`}>
            <schematictext
              text={text}
              schX={20}
              schY={11.5 - index * 0.32}
              fontSize={0.18}
              anchor="left"
            />
          </Fragment>
        ))}
      </schematicsheet>
      <schematicsheet name="pcie" displayName="PCIe x4" sheetIndex={4}>
        <schematicsection name="PCIE_LINK"/>
        <schematictext text="1. PCIe x4 connection" schX={-11.6} schY={7.4} fontSize={0.3} anchor="left"/>
        <X1618WVS_164_9TV30
          name="PCIe"
          schSectionName="PCIE_LINK"
          schX={-4.98}
          schY={3.6}
          schWidth={3.1}
          schHeight={4.8}
          // Hide unused contacts in this schematic view; physical pads and NCs remain.
          schPinStyle={{
            V12V: {marginLeft: 0.4, marginRight: 0.4},
            V3V3: {marginLeft: 0.4, marginRight: 0.4},
            V3V3_AUX: {marginLeft: 0.4, marginRight: 0.4},
          }}
          schPinArrangement={{
            leftSide: {direction: "top-to-bottom", pins: ["PERST_N", "REFCLK_P", "REFCLK_N", "CLKREQ_N", "WAKE_N", "RX0_P", "RX0_N", "RX1_P", "RX1_N", "RX2_P", "RX2_N", "RX3_P", "RX3_N"]},
            rightSide: {direction: "top-to-bottom", pins: ["TX0_P", "TX0_N", "TX1_P", "TX1_N", "TX2_P", "TX2_N", "TX3_P", "TX3_N", "PRSNT1_N", "PRSNT2_X1_N", "PRSNT2_X4_N", "PRSNT2_X8_N", "PRSNT2_X16_N"]},
            topSide: {direction: "left-to-right", pins: ["V12V", "V3V3", "V3V3_AUX"]},
            bottomSide: {direction: "left-to-right", pins: ["GND"]},
          }}
          noConnect={unusedPcieLanes}
          connections={{
            GND: "net.GND",
            V12V: "net.SLOT_12V",
            V3V3: "net.SLOT_3V3",
            V3V3_AUX: "net.V3V3_AUX",
            WAKE_N: "net.ASM_WAKE_N",
            PRSNT1_N: "net.GND",
            PRSNT2_X1_N: "net.PCIE_PRESENT_N",
            PRSNT2_X4_N: "net.PCIE_PRESENT_N",
            PRSNT2_X8_N: "net.PCIE_PRESENT_N",
            PRSNT2_X16_N: "net.PCIE_PRESENT_N",
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
        <netlabel net="SLOT_12V" connection="PCIe.V12V" schX={-6.2} schY={6.4} anchorSide="bottom"/>
        <netlabel net="SLOT_3V3" connection="PCIe.V3V3" schX={-4.9} schY={6.4} anchorSide="bottom"/>
        <netlabel net="V3V3_AUX" connection="PCIe.V3V3_AUX" schX={-3.4} schY={6.4} anchorSide="bottom"/>
        <schematictext text="Control links" schX={-11.8} schY={1} fontSize={0.24} anchor="left"/>
        <schematictext text="Transmit coupling" schX={-5.5} schY={1} fontSize={0.24} anchor="left"/>
        {[
          {pin: "PERST_N", resistor: "R_PCIE_PERST", pinY: 4.8, linkY: 0.2},
          {pin: "REFCLK_P", resistor: "R_PCIE_REFCLK_P", pinY: 4.6, linkY: -0.6},
          {pin: "REFCLK_N", resistor: "R_PCIE_REFCLK_N", pinY: 4.4, linkY: -1.4},
          {pin: "CLKREQ_N", resistor: "R_PCIE_CLKREQ", pinY: 4.2, linkY: -2.2},
        ].map(({pin, resistor, pinY, linkY}) => (
          <Fragment key={`compact-${pin}`}>
            <netlabel net={`PCIe_${pin}`} connection={`PCIe.${pin}`} schX={-7.6} schY={pinY} anchorSide="right"/>
            <netlabel net={`PCIe_${pin}`} connection={`${resistor}.pin2`} schX={-7.8} schY={linkY} anchorSide="left"/>
          </Fragment>
        ))}
        <netlabel net="PCIe_CLKREQ_N" connection="R_PCIE_CLKREQ_PU.pin2" schX={-8.2} schY={-4.8} anchorSide="left"/>
        {/* ASMedia reference sheet 6, R173: removable series link to slot A11. */}
        <A_0402WGF0000TCE
          schSectionName="PCIE_LINK"
          name="R_PCIE_PERST"
          schX={-9.2}
          schY={0.2}
          connections={{
            pin1: "net.ASM_PERST0_N",
            pin2: ".PCIe > .PERST_N",
          }}
        />
        <netlabel
          net="ASM_PERST0_N"
          connection="R_PCIE_PERST.pin1"
          schX={-10.2}
          schY={0.2}
          anchorSide="right"
        />
        {/* One x4 link uses clock pair 0. ASMedia sheet 6: R180 (P), R178 (N). */}
        {(["P", "N"] as const).map((polarity, index) => (
          <Fragment key={`PCIE_REFCLK_${polarity}`}>
            <A_0402WGF0000TCE
              schSectionName="PCIE_LINK"
              name={`R_PCIE_REFCLK_${polarity}`}
              schX={-9.2}
              schY={-0.6 - index * 0.8}
              connections={{
                pin1: `net.ASM_REFCLK_${polarity}0`,
                pin2: `.PCIe > .REFCLK_${polarity}`,
              }}
            />
            <netlabel
              net={`ASM_REFCLK_${polarity}0`}
              connection={`R_PCIE_REFCLK_${polarity}.pin1`}
              schX={-10.2}
              schY={-0.6 - index * 0.8}
              anchorSide="right"
            />
          </Fragment>
        ))}
        {/* ASMedia reference sheet 6: R207 series link and R205 10k pull-up. */}
        <A_0402WGF0000TCE
          schSectionName="PCIE_LINK"
          name="R_PCIE_CLKREQ"
          schX={-9.2}
          schY={-2.2}
          connections={{
            pin1: "net.ASM_CLKREQ_N",
            pin2: ".PCIe > .CLKREQ_N",
          }}
        />
        <netlabel
          net="ASM_CLKREQ_N"
          connection="R_PCIE_CLKREQ.pin1"
          schX={-10.2}
          schY={-2.2}
          anchorSide="right"
        />
        <A_0402WGF1002TCE
          schSectionName="PCIE_LINK"
          name="R_PCIE_CLKREQ_PU"
          schX={-9.2}
          schY={-4.1}
          schOrientation="vertical"
          connections={{
            pin1: "net.VCCH",
            pin2: ".PCIe > .CLKREQ_N",
          }}
        />
        <netlabel
          net="VCCH"
          connection="R_PCIE_CLKREQ_PU.pin1"
          schX={-9.2}
          schY={-3.1}
          anchorSide="bottom"
        />
        <netlabel
          net="ASM_WAKE_N"
          connection="PCIe.WAKE_N"
          schX={-7.6}
          schY={4}
          anchorSide="right"
        />
        {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).map((polarity, index) => (
          <Fragment key={`PCIE_RX${lane}_${polarity}`}>
            <netlabel
              net={`ASM_PRX${polarity}${lane}`}
              connection={`PCIe.RX${lane}_${polarity}`}
              schX={-7.6}
              schY={3.8 - lane * 0.4 - index * 0.2}
              anchorSide="right"
            />
          </Fragment>
        )))}
        {/* Series coupling belongs at each transmitter; the card supplies its own TX capacitors. */}
        {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).map((polarity, index) => (
          <Fragment key={`PCIE_TX${lane}_${polarity}`}>
            <netlabel net={`PCIe_TX${lane}_${polarity}`} connection={`PCIe.TX${lane}_${polarity}`} schX={-2.6} schY={4.8 - lane * 0.4 - index * 0.2} anchorSide="left"/>
            <netlabel net={`PCIe_TX${lane}_${polarity}`} connection={`C_TX${lane}_${polarity}.pin2`} schX={-4.9} schY={0.2 - lane * 1.4 - index * 0.7} anchorSide="right"/>
            <capacitor
              schSectionName="PCIE_LINK"
              name={`C_TX${lane}_${polarity}`}
              capacitance="220nF"
              maxVoltageRating="10V"
              footprint="0402"
              schOrientation="neg_left"
              // Separate the P/N columns and leave room for both names and values.
              schX={polarity === "P" ? -3.8 : -2.2}
              schY={0.2 - lane * 1.4 - index * 0.7}
              pcbRotation={lane < 2 ? 0 : 90}
              connections={{
                pin2: `.PCIe > .TX${lane}_${polarity}`,
              }}
            />
            <netlabel
              net={`ASM_PTX${polarity}${lane}`}
              connection={`C_TX${lane}_${polarity}.pin1`}
              schX={-1.2}
              schY={0.2 - lane * 1.4 - index * 0.7}
              anchorSide="left"
            />
          </Fragment>
        )))}
        <schematictext
          text="Only lanes 0–3 are used. Lanes 4–15 are unconnected."
          schX={-5.5}
          schY={-5.8}
          fontSize={0.18}
          anchor="left"
        />
        <schematictext
          text="TX capacitors: 220nF / 10V, per ASMedia reference sheet 6."
          schX={-5.5}
          schY={-6.15}
          fontSize={0.18}
          anchor="left"
        />
        <schematicsection name="PCIE_PRESENCE" displayName="Card Presence"/>
        <netlabel net="GND" connection="PCIe.PRSNT1_N" schX={0.2} schY={3.2} anchorSide="top"/>
        {(["X1", "X4", "X8", "X16"] as const).map((size, index) => (
          <Fragment key={`PCIE_PRESENT_${size}`}>
            <netlabel net="PCIE_PRESENT_N" connection={`PCIe.PRSNT2_${size}_N`} schX={-2.6} schY={3 - index * 0.2} anchorSide="left"/>
          </Fragment>
        ))}
        <schematictext text="PCIe card presence (A1 / B17, B31, B48, B81)" schX={-10} schY={-7.3} fontSize={0.22} anchor="left"/>
        {/* ASMedia sheet 6 uses 4.7k pull-ups (R183/R196) and removable sense links. */}
        <resistor
          name="R_PCIE_PRESENT_PU"
          schSectionName="PCIE_PRESENCE"
          pcbRotation={180}
          resistance="4.7k"
          tolerance="1%"
          footprint="0402"
          manufacturerPartNumber="0402WGF4701TCE"
          supplierPartNumbers={{jlcpcb: ["C25900"]}}
          schX={-3}
          schY={-8.1}
          schOrientation="vertical"
          connections={{pin1: "net.VCCH", pin2: "net.PCIE_PRESENT_N"}}
        />
        <netlabel net="VCCH" connection="R_PCIE_PRESENT_PU.pin1" schX={-3} schY={-7.1} anchorSide="bottom"/>
        <netlabel net="PCIE_PRESENT_N" connection="R_PCIE_PRESENT_PU.pin2" schX={-3} schY={-10} anchorSide="top"/>
        <A_0402WGF0000TCE
          name="R_PCIE_PRESENT"
          schSectionName="PCIE_PRESENCE"
          schX={-1}
          schY={-9.1}
          connections={{pin1: "net.ASM_PRESENT_N", pin2: "net.PCIE_PRESENT_N"}}
        />
        <netlabel net="ASM_PRESENT_N" connection="R_PCIE_PRESENT.pin1" schX={-1.6} schY={-10.5} anchorSide="top"/>
        <netlabel net="PCIE_PRESENT_N" connection="R_PCIE_PRESENT.pin2" schX={1} schY={-9.1} anchorSide="left"/>
        <schematictext text="Empty = high; inserted card grounds the sense net. Pull-up uses unswitched VCCH." schX={-10} schY={-11.6} fontSize={0.18} anchor="left"/>
        {/* Frame the switch block and include its local subcircuit in the page bounds. */}
        <schematicrect schX={8.7} schY={-2.7} width={14.4} height={18.2} strokeWidth={0.02} color="#bbbbbb"/>
        <SlotPower/>
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
        <schematicsection name="ATX_START" displayName="ATX Input and Automatic Start"/>
        <A_39301240
          name="ATX"
          schSectionName="ATX_START"
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
            pin8: "net.ATX_PWR_OK",
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
        {/* Anchor the shared 3.3 V rail explicitly to avoid a dangling auto-label stub. */}
        <netlabel net="V3V3" connectsTo={["ATX.pin1", "ATX.pin2", "ATX.pin12"]}
          schX={-6.85} schY={1.4} anchorSide="bottom"/>
        {/* The PSU pulls PS_ON# high internally. This removable link requests
            automatic start whenever AC is present (Intel ATX section 3.3.3). */}
        <A_0402WGF0000TCE
          name="R_PSU_ON"
          schSectionName="ATX_START"
          schX={-1.7} schY={-1.6}
          schOrientation="vertical"
          connections={{pin2: "net.GND"}}
        />
        <trace name="PSU_START" from=".ATX > .pin16" to=".R_PSU_ON > .pin1"/>
        <netlabel net="GND" connection="R_PSU_ON.pin2" schX={-1.7} schY={-2.6} anchorSide="top"/>
        <schematictext text="0 ohm fitted: automatic power-on" schX={-6.5} schY={-2.2} fontSize={0.2} anchor="left"/>
        <schematictext text="Remove R_PSU_ON to release PS_ON#" schX={-6.5} schY={-2.6} fontSize={0.2} anchor="left"/>
        <BuckInputs/>
        <BuckEnable/>
        <PsuControl/>
      </schematicsheet>
    </board>
  );
}
