import {A_0402WGF0000TCE} from "imports/A_0402WGF0000TCE";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import {CL21A106KAYNNNE} from "imports/CL21A106KAYNNNE";
import {FixedTrace} from "./FixedTrace";
import {bridgeDecouplingPlacement} from "lib/bridge-decoupling-placement";

// ASMedia ASM2464PDX_TI_R03, sheet 3: R4 feeds VCCA33 from VCC33_SYS.
// C7 and C8 decouple the analog side of that link to GND.
// The fast bypass stays beside H5; both bulk capacitors clear the USB corridor.
// Two 10 uF +/-10% parts give an 18 uF nominal-tolerance minimum versus
// 17.6 uF for the original 22 uF +/-20% part. Both are 25 V X5R; Samsung's
// typical bias curves show less capacitance loss for the 10 uF part at 3.3 V.
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
        {ref: 7, Capacitor: CL21A106KAYNNNE},
        {ref: 9, Capacitor: CL21A106KAYNNNE},
        {ref: 8, Capacitor: CL05B224KO5NNNC},
      ].map(({ref, Capacitor}, index) => (
        <Capacitor
          key={ref}
          name={`C_VCCA33_${ref}`}
          {...bridgeDecouplingPlacement(`C_VCCA33_${ref}`)}
          schSectionName="VCCA33_DECOUPLING"
          schX={-2.4 + index * 1.9} schY={0}
          schOrientation="vertical"
          connections={{pin1: "net.VCCA33", pin2: "net.GND"}}
        />
      ))}
      <netlabel inline
        net="VCCH" connection="R_VCCA33_4.pin1"
      />
      <netlabel inline
        net="VCCA33"
        connectsTo={["R_VCCA33_4.pin2", "C_VCCA33_7.pin1", "C_VCCA33_8.pin1", "C_VCCA33_9.pin1"]}
      />
      <netlabel inline
        net="GND" connectsTo={["C_VCCA33_7.pin2", "C_VCCA33_8.pin2", "C_VCCA33_9.pin2"]}
      />
      <FixedTrace name="VCCA33_BULK_9_FEED" from="C_VCCA33_7.pin1" to="C_VCCA33_9.pin1"
        width={0.25} points={[[44,91.5]]}/>
      <schematictext
        text="2 x 10uF / 25V + 220nF / 16V = 20.22uF."
        schX={0} schY={-2} fontSize={0.18} anchor="center"
      />
      <schematictext
        text="Keep the feed and 220nF beside H5; bulk is below USB4."
        schX={0} schY={-2.5} fontSize={0.18} anchor="center"
      />
    </group>
  );
}
