import {Fragment} from "react";
import {APXJ6R3ARA561MF80G} from "imports/APXJ6R3ARA561MF80G";
import {CL10B104KB8NNNC} from "imports/CL10B104KB8NNNC";
import {PCR1E471MCL1GS} from "imports/PCR1E471MCL1GS";

/** ASMedia reference sheet 6: CE1/C132/C133 and CE2/C131.
 * All capacitors shunt the switched slot outputs to GND.
 * Final PCB placement belongs beside the slot power contacts.
 */
export function SlotDecoupling() {
  return (
    <group name="SLOT_DECOUPLING" schX={19} schY={1}>
      <schematicsection name="SLOT_DECOUPLING" displayName="3. Slot supply decoupling"/>
      {([
        {rail: "12V", Bulk: PCR1E471MCL1GS, bulkName: "C134", ceramics: ["C132", "C133"], y: 0, label: "12 V: 470uF / 25V + 2 x 100nF / 50V"},
        {rail: "3V3", Bulk: APXJ6R3ARA561MF80G, bulkName: "C135", ceramics: ["C131"], y: -5, label: "3.3 V: 560uF / 6.3V + 100nF / 50V"},
      ] as const).map(({rail, Bulk, bulkName, ceramics, y, label}) => (
        <group key={rail} schY={y}>
          <schematictext text={label} schX={-1.2} schY={2} fontSize={0.22} anchor="left"/>
          <Bulk name={bulkName} schSectionName="SLOT_DECOUPLING"
            schX={0} schY={0} schOrientation="vertical"
            connections={{pin1: `net.SLOT_${rail}`, pin2: "net.GND"}}/>
          <netlabel net={`SLOT_${rail}`} connection={`${bulkName}.pin1`}
            schX={0} schY={1} anchorSide="bottom"/>
          <netlabel net="GND" connection={`${bulkName}.pin2`}
            schX={0} schY={-1} anchorSide="top"/>
          {ceramics.map((name, index) => (
            <Fragment key={name}>
              <CL10B104KB8NNNC name={name}
                schSectionName="SLOT_DECOUPLING"
                schX={1.9 + index * 1.9} schY={0} schOrientation="vertical"
                connections={{pin1: `net.SLOT_${rail}`, pin2: "net.GND"}}/>
              <netlabel net={`SLOT_${rail}`} connection={`${name}.pin1`}
                schX={1.9 + index * 1.9} schY={1} anchorSide="bottom"/>
              <netlabel net="GND" connection={`${name}.pin2`}
                schX={1.9 + index * 1.9} schY={-1} anchorSide="top"/>
            </Fragment>
          ))}
        </group>
      ))}
      <schematictext text="Place beside slot power contacts. Include card capacitance in the inrush check."
        schX={-1.2} schY={-7.2} fontSize={0.18} anchor="left"/>
    </group>
  );
}
