import ASM2464PDX from "imports/ASM2464PDX";

export default function Board() {
  return (
    <board
      anchorAlignment="bottom_left"
      layers={4}
      thickness="1.6mm"
    >
      <schematicsheet name="chip" sheetIndex={1}>
        <ASM2464PDX/>
      </schematicsheet>
      <schematicsheet name="power" sheetIndex={2}></schematicsheet>
    </board>
  );
}
