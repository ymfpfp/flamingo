import {Fragment} from "react";
import {T520B337M2R5ATE009} from "imports/T520B337M2R5ATE009";
import {CL05B473KO5NNNC} from "imports/CL05B473KO5NNNC";

// TI TPS62903 section 8.3.2 and output-capacitance footnote: retain the
// ceramic bank and isolate additional reserve capacitance with resistance.
export function VddReserve() {return <group name="VDD_RESERVE" schX={9} schY={-7}>
  <schematicsection name="VDD_RESERVE"/>
  <schematictext text="VDD Reserve" schX={1.6} schY={2.6} fontSize={.18} anchor="center"/>
  <schematictext text="2 x 330uF; 22 mΩ per branch." schX={1.6} schY={2} fontSize={.18} anchor="center"/>
  {["A","B"].map((suffix,i)=><Fragment key={suffix}>
    <resistor name={`R_VDD_DAMP_${suffix}`} resistance="22mohm" tolerance="1%"
      manufacturerPartNumber="PE1206FRM070R022L" supplierPartNumbers={{jlcpcb:["C875657"]}}
      datasheetUrl="https://jlcpcb.com/partdetail/YAGEO-PE1206FRM070R022L/C875657" footprint="res1206"
      schSectionName="VDD_RESERVE" schX={i*3.2} schY={.5} schOrientation="vertical"
      pcbX={i*6} pcbY={-.7} pcbRotation={90} layer="top"
      connections={{pin1:"net.VDD",pin2:`net.VDD_RESERVE_${suffix}`}}/>
    <T520B337M2R5ATE009 name={`C_VDD_RESERVE_${suffix}`}
      schSectionName="VDD_RESERVE" schX={i*3.2} schY={-1} schOrientation="vertical"
      pcbX={i*6} pcbY={3} layer="top"
      connections={{pin1:`net.VDD_RESERVE_${suffix}`,pin2:"net.GND"}}/>
  </Fragment>)}
  <netlabel inline net="VDD" connectsTo={["R_VDD_DAMP_A.pin1","R_VDD_DAMP_B.pin1"]}/>
  <netlabel inline net="GND" connectsTo={["C_VDD_RESERVE_A.pin2","C_VDD_RESERVE_B.pin2"]}/>
</group>}

export function VddSoftStart(){return <group name="VDD_SOFT_START" schX={21} schY={8}>
  <CL05B473KO5NNNC name="C_VDD_SS" schSectionName="VDD_BUCK_INPUT"
    schX={2} schY={-4.5} schOrientation="vertical" pcbX={0} pcbY={0} layer="top"
    connections={{pin1:"VDD_BUCK.SS",pin2:"net.GND"}}/>
  <netlabel inline net="GND" connection="C_VDD_SS.pin2"/>
</group>}
