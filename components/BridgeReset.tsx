import {A_0402WGF1003TCE} from "imports/A_0402WGF1003TCE";
import {CL05A105KA5NQNC} from "imports/CL05A105KA5NQNC";
import {TS_1088_AR02016} from "imports/TS_1088_AR02016";

/** ASMedia reference sheet 3: R30, C52 and normally-open SW2. */
export function BridgeReset() {
  return (
    <group name="BRIDGE_RESET" schX={17} schY={-5}>
      <schematicsection name="BRIDGE_RESET" displayName="Bridge Reset"/>
      <A_0402WGF1003TCE
        name="R_RST"
        tolerance="1%"
        schSectionName="BRIDGE_RESET"
        schX={0}
        schY={2}
        schOrientation="vertical"
        connections={{pin1: "net.VCCH", pin2: "net.ASM_RST_N"}}
      />
      <CL05A105KA5NQNC
        name="C_RST"
        maxVoltageRating="25V"
        schSectionName="BRIDGE_RESET"
        schX={0}
        schY={-1}
        schOrientation="vertical"
        connections={{pin1: "net.ASM_RST_N", pin2: "net.GND"}}
      />
      <TS_1088_AR02016
        name="SW_RESET"
        schSectionName="BRIDGE_RESET"
        schX={3}
        schY={0}
        schRotation={-90}
        connections={{pin1: "net.ASM_RST_N", pin2: "net.GND"}}
      />
      <netlabel net="VCCH" connection="R_RST.pin1" schX={0} schY={3} anchorSide="bottom"/>
      <netlabel net="ASM_RST_N" connection="R_RST.pin2" schX={-1.5} schY={0} anchorSide="right"/>
      <netlabel net="GND" connection="C_RST.pin2" schX={0} schY={-2} anchorSide="top"/>
      <netlabel net="GND" connection="SW_RESET.pin2" schX={3} schY={-2} anchorSide="top"/>
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
