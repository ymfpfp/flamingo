import {Fragment} from "react";
import {APXF6R3ARA331MF61G} from "imports/APXF6R3ARA331MF61G";
import {CL10B104KB8NNNC} from "imports/CL10B104KB8NNNC";
import {A_25SVPK470M} from "imports/A_25SVPK470M";

/** ASMedia reference sheet 6: CE1/C132/C133 and CE2/C131.
 * All capacitors shunt the switched slot outputs to GND.
 * Each capacitor has its own PCB group for placement beside the slot power contacts.
 */
export function SlotDecoupling() {
  return (
    <group name="SLOT_DECOUPLING" schX={19} schY={1}>
      {/* Draw this section explicitly so the automatic dividers do not close its bottom edge. */}
      <schematictext text="Slot supply decoupling" schX={-2.85} schY={5.3625}
        fontSize={0.18} anchor="top_left"/>
      <schematicline x1={-3.05} y1={-8.2125} x2={-3.05} y2={6.0625}
        strokeWidth={0.02} color="#000000" isDashed/>
      {([
        {rail: "12V", Bulk: A_25SVPK470M, bulkNames: ["C134"], ceramics: ["C132", "C133"], y: 0, label: "12 V: 470uF / 25V + 2 x 100nF / 50V"},
        {rail: "3V3", Bulk: APXF6R3ARA331MF61G, bulkNames: ["C135", "C136"], ceramics: ["C131"], y: -5, label: "3.3 V: 2 x 330uF / 6.3V + 100nF / 50V"},
      ] as const).map(({rail, Bulk, bulkNames, ceramics, y, label}) => (
        <Fragment key={rail}>
          <schematictext text={label} schX={-1.2} schY={y + 2} fontSize={0.18} anchor="left"/>
          {bulkNames.map((bulkName, index) => <group key={bulkName} name={`${bulkName}_PLACEMENT`} schY={y}>
            <Bulk name={bulkName} schSectionName="SLOT_DECOUPLING"
              pcbX={0} pcbY={0}
              schX={index * 2.4} schY={0} schOrientation="vertical"
              connections={{pin1: `net.SLOT_${rail}`, pin2: "net.GND"}}/>
            <netlabel inline net={`SLOT_${rail}`} connection={`${bulkName}.pin1`}/>
            <netlabel inline net="GND" connection={`${bulkName}.pin2`}/>
          </group>)}
          {ceramics.map((name, index) => (
            <group key={name} name={`${name}_PLACEMENT`} schY={y}>
              <CL10B104KB8NNNC name={name}
                pcbX={0} pcbY={0}
                schSectionName="SLOT_DECOUPLING"
                schX={bulkNames.length * 2.4 + index * 1.9} schY={0} schOrientation="vertical"
                connections={{pin1: `net.SLOT_${rail}`, pin2: "net.GND"}}/>
              <netlabel inline net={`SLOT_${rail}`} connection={`${name}.pin1`}/>
              <netlabel inline net="GND" connection={`${name}.pin2`}/>
            </group>
          ))}
        </Fragment>
      ))}
      <schematictext text="Place beside slot power contacts. Include card capacitance in the inrush check."
        schX={-1.2} schY={-7.2} fontSize={0.18} anchor="left"/>
    </group>
  );
}
