import {A_0402WGF1003TCE} from "imports/A_0402WGF1003TCE";
import {CL05A105KA5NQNC} from "imports/CL05A105KA5NQNC";
import {TS_1088_AR02016} from "imports/TS_1088_AR02016";

/** ASMedia reference sheet 3: R30, C52 and normally-open SW2. */
export function BridgeReset() {
  return (
    <group name="BRIDGE_RESET" schX={11.75} schY={-5.7} pcbRelative pcbPack={false}>
      <A_0402WGF1003TCE
        name="R_RST"
        pcbStyle={{silkscreenTextVisibility: "hidden"}}
        tolerance="1%"
        schSectionName="BRIDGE_RESET"
        schX={0}
        schY={2}
        schOrientation="vertical"
        pcbX={3.2} pcbY={-5.2} pcbRotation={180}
        connections={{pin1: "net.VCCH", pin2: "net.ASM_RST_N"}}
      />
      <CL05A105KA5NQNC
        name="C_RST"
        pcbStyle={{silkscreenTextVisibility: "hidden"}}
        maxVoltageRating="25V"
        schSectionName="BRIDGE_RESET"
        schX={0}
        schY={-1}
        schOrientation="vertical"
        pcbX={3.2} pcbY={-1.1} pcbRotation={0}
        connections={{pin1: "net.ASM_RST_N", pin2: "net.GND"}}
      />
      <TS_1088_AR02016
        name="SW_RESET"
        footprint="smdpads2_p4.3698mm_pw1.23mm_ph1.86mm_cyw6.0998mm_cyh3.4mm_nosilkscreen"
        schSectionName="BRIDGE_RESET"
        schX={3}
        schY={0}
        schRotation={-90}
        pcbX={0} pcbY={0} pcbRotation={-90}
        connections={{pin1: "net.ASM_RST_N", pin2: "net.GND"}}
      >
        <silkscreentext
          text="RESET"
          pcbX={3.65}
          pcbY={0}
          pcbRotation={360}
          fontSize="0.6mm"
          anchorAlignment="center"
        />
      </TS_1088_AR02016>
      <netlabel inline net="VCCH" connection="R_RST.pin1"/>
      <netlabel inline net="ASM_RST_N" connection="R_RST.pin2"/>
      <netlabel inline net="GND" connection="C_RST.pin2"/>
      <netlabel inline net="GND" connection="SW_RESET.pin2"/>
      {/* RC delay does not monitor rail readiness; verify it with regulator sequencing. */}
      <schematictext
        text="100k + 1uF: ASMedia R30/C52. Press RESET to hold RST# low."
        schX={-1}
        schY={-3}
        fontSize={0.18}
        anchor="left"
      />
    </group>
  );
}
