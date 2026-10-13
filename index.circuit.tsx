import ASM2464PDX from "imports/ASM2464PDX";
import {W25Q32JVSSIQ} from "imports/W25Q32JVSSIQ";
import {X3183WV_164B1_46V01} from "imports/X3183WV_164B1_46V01";

export default function Board() {
  return (
    <board
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
      <net name="VCCH"/>
      <net name="VCCL"/>
      <net name="SPI_CS"/>
      <net name="SPI_DO"/>
      <net name="SPI_DI"/>
      <net name="SPI_CLK"/>

      <schematicsheet name="chip" sheetIndex={1}>
        <group schX={5} schY={0}>
          <ASM2464PDX/>
        </group>
        <W25Q32JVSSIQ
          name="SPI"
          schX={-6}
          schY={0}
          connections={{
            N_CS: "net.SPI_CS",
            DO_IO1: "net.SPI_DO",
            DI_IO0: "net.SPI_DI",
            CLK: "net.SPI_CLK",
            GND: "net.GND",
            VCC: "net.VDD",
            WP__IO2: "net.VDD",
            HOLD__or_RESET__IO3: "net.VDD",
          }}
        />
        <X3183WV_164B1_46V01 name="PCIe"/>
      </schematicsheet>
      <schematicsheet name="power" sheetIndex={2}></schematicsheet>
    </board>
  );
}
