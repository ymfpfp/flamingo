import ASM2464PDX from "imports/ASM2464PDX";

export default function Board() {
  return (
    <board
      width="20mm"
      height="20mm"
      anchorAlignment="bottom_left"
      boardAnchorPosition={{x: 0, y: 0}}
      routingDisabled={true}
      layers={4}
      thickness="1.6mm"
    >
      <net name="GND"/>
      <net name="GDNA"/>
      <net name="VDD"/>
      <net name="VCCH"/>
      <net name="VCCL"/>

      <schematicsheet name="chip" sheetIndex={1}>
        <ASM2464PDX/>
      </schematicsheet>
      <schematicsheet name="power" sheetIndex={2}></schematicsheet>
    </board>
  );
}
