import {A_0402WGF0000TCE} from "imports/A_0402WGF0000TCE";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import {CL21A226MAYNNNE} from "imports/CL21A226MAYNNNE";
import {bridgeDecouplingPlacement} from "lib/bridge-decoupling-placement";

// ASMedia ASM2464PDX_TI_R03, sheet 3: R4 feeds VCCA33 from VCC33_SYS.
// C7 and C8 decouple the analog side of that link to GND.
// The fast bypass stays beside H5; the bulk capacitor clears the USB corridor.
export function BridgeVcca33Decoupling() {
  return (
    <group name="VCCA33_DECOUPLING" schX={9.6} schY={7}>
      <schematictext text="VCCA33 Decoupling" schX={0} schY={2.6} fontSize={0.18} anchor="center"/>
      <schematictext
        text="ASMedia sheet 3: R4, C7, C8."
        schX={0} schY={2} fontSize={0.18} anchor="center"
      />
      <A_0402WGF0000TCE
        name="R_VCCA33_4"
        {...bridgeDecouplingPlacement("R_VCCA33_4")}
        schSectionName="VCCA33_DECOUPLING"
        schX={-3} schY={0.9}
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
          {...bridgeDecouplingPlacement(`C_VCCA33_${ref}`)}
          schSectionName="VCCA33_DECOUPLING"
          schX={-0.5 + index * 1.9} schY={0}
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
        schX={0} schY={-2} fontSize={0.18} anchor="center"
      />
      <schematictext
        text="Keep the feed and 220nF beside H5; bulk is below USB4."
        schX={0} schY={-2.5} fontSize={0.18} anchor="center"
      />
    </group>
  );
}
