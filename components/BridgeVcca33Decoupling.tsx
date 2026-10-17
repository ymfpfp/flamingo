import {A_0402WGF0000TCE} from "imports/A_0402WGF0000TCE";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import {CL21A226MAYNNNE} from "imports/CL21A226MAYNNNE";

// ASMedia ASM2464PDX_TI_R03, sheet 3: R4 feeds VCCA33 from VCC33_SYS.
// C7 and C8 decouple the analog side of that link to GND.
// Selected MPNs and catalog footprints; final PCB placement remains pending.
export function BridgeVcca33Decoupling() {
  return (
    <group name="VCCA33_DECOUPLING" schX={19.5}>
      <schematictext text="VCCA33 Decoupling" schX={-1.5} schY={2.6} fontSize={0.18} anchor="left"/>
      <schematictext
        text="ASMedia sheet 3: R4, C7, C8."
        schX={-1.5} schY={2} fontSize={0.18} anchor="left"
      />
      <A_0402WGF0000TCE
        name="R_VCCA33_4"
        schSectionName="VCCA33_DECOUPLING"
        schX={0} schY={0.9}
        schOrientation="vertical"
        connections={{pin1: "net.VCCH", pin2: "net.VCCA33"}}
      />
      {[
        {ref: 7, Capacitor: CL21A226MAYNNNE},
        {ref: 8, Capacitor: CL05B224KO5NNNC},
      ].map(({ref, Capacitor}, index) => (
        <Capacitor
          key={ref}
          name={`C_VCCA33_${ref}`}
          schSectionName="VCCA33_DECOUPLING"
          schX={2.2 + index * 1.9} schY={0}
          schOrientation="vertical"
          connections={{pin1: "net.VCCA33", pin2: "net.GND"}}
        />
      ))}
      <netlabel inline
        net="VCCH" connection="R_VCCA33_4.pin1"
      />
      <netlabel inline
        net="VCCA33"
        connectsTo={["R_VCCA33_4.pin2", "C_VCCA33_7.pin1", "C_VCCA33_8.pin1"]}
      />
      <netlabel inline
        net="GND" connectsTo={["C_VCCA33_7.pin2", "C_VCCA33_8.pin2"]}
      />
      <schematictext
        text="22uF / 25V + 220nF / 16V = 22.22uF."
        schX={-1.5} schY={-2} fontSize={0.18} anchor="left"
      />
      <schematictext
        text="Parts selected; PCB placement pending."
        schX={-1.5} schY={-2.5} fontSize={0.18} anchor="left"
      />
    </group>
  );
}
