import {A_0402WGF1002TCE} from "imports/A_0402WGF1002TCE";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import {RT0402BRD0710KL} from "imports/RT0402BRD0710KL";
import {RT0402BRD0716K2L} from "imports/RT0402BRD0716K2L";
import {TPS389001DSET} from "imports/TPS389001DSET";

/** Shared buck enable; independent of the bridge's reset net and buck PG pins. */
export function BuckEnable() {
  return (
    <group name="BUCK_ENABLE" schX={16} schY={0}>
      <schematicsection name="BUCK_ENABLE" displayName="VCCH Monitor and Buck Enable"/>
      <TPS389001DSET
        name="U_BUCK_EN"
        schSectionName="BUCK_ENABLE"
        schX={0} schY={0}
        pcbX={0} pcbY={0}
        schWidth={1.8} schHeight={1.2}
        schPinArrangement={{
          leftSide: {pins: ["SENSE", "N_MR"], direction: "top-to-bottom"},
          rightSide: {pins: ["N_RESET", "CT"], direction: "top-to-bottom"},
          topSide: {pins: ["VDD"], direction: "left-to-right"},
          bottomSide: {pins: ["GND"], direction: "left-to-right"},
        }}
        noConnect={["CT"]}
        connections={{
          VDD: "net.VCCH",
          GND: "net.GND",
          N_MR: "net.VCCH",
          SENSE: "net.VCCH_SENSE",
          N_RESET: "net.BUCK_EN",
        }}
      />
      {/* Datasheet table 5 and equation 2: rising 1.157*(1+16.2k/10k)=3.03134 V.
          Falling threshold is 1.15*(1+16.2k/10k)=3.013 V nominal. */}
      <RT0402BRD0716K2L name="R_BUCK_EN_TOP" schSectionName="BUCK_ENABLE"
        schX={-3.5} schY={1.1} schOrientation="vertical"
        pcbX={-2.8} pcbY={1} pcbRotation={270}
        connections={{pin1: "net.VCCH", pin2: "net.VCCH_SENSE"}}/>
      <RT0402BRD0710KL name="R_BUCK_EN_BOTTOM" schSectionName="BUCK_ENABLE"
        schX={-3.5} schY={-1.1} schOrientation="vertical"
        pcbX={-2.8} pcbY={-1.3} pcbRotation={270}
        connections={{pin1: "net.VCCH_SENSE", pin2: "net.GND"}}/>
      <trace from=".R_BUCK_EN_TOP > .pin2" to=".R_BUCK_EN_BOTTOM > .pin1"/>
      <netlabel net="VCCH_SENSE" connectsTo={["R_BUCK_EN_TOP.pin2", "R_BUCK_EN_BOTTOM.pin1"]}
        schX={-3.5} schY={0} anchorSide="right"/>
      <netlabel net="VCCH" connection="R_BUCK_EN_TOP.pin1" schX={-3.5} schY={2} anchorSide="bottom"/>
      <netlabel net="GND" connection="R_BUCK_EN_BOTTOM.pin2" schX={-3.5} schY={-1.65} anchorSide="top"/>
      <netlabel net="VCCH_SENSE" connection="U_BUCK_EN.SENSE" schX={-1.5} schY={0.1} anchorSide="right"/>
      <netlabel net="VCCH" connection="U_BUCK_EN.N_MR" schX={-1.5} schY={-0.1} anchorSide="right"/>
      <netlabel net="VCCH" connection="U_BUCK_EN.VDD" schX={0} schY={1.4} anchorSide="bottom"/>
      <netlabel net="GND" connection="U_BUCK_EN.GND" schX={0} schY={-1.4} anchorSide="top"/>
      <A_0402WGF1002TCE name="R_BUCK_EN_PU" schSectionName="BUCK_ENABLE"
        schX={3} schY={1.1} schOrientation="vertical"
        pcbX={2.8} pcbY={0.5} pcbRotation={180}
        connections={{pin1: "net.VCCH", pin2: "net.BUCK_EN"}}/>
      <netlabel net="VCCH" connection="R_BUCK_EN_PU.pin1" schX={3} schY={2} anchorSide="bottom"/>
      <netlabel net="BUCK_EN" connectsTo={["R_BUCK_EN_PU.pin2", "U_BUCK_EN.N_RESET"]}
        schX={3} schY={0.1} anchorSide="left"/>
      <CL05B104KO5NNNC name="C_BUCK_EN" schSectionName="BUCK_ENABLE"
        schX={-6.5} schY={0.6} schOrientation="vertical"
        pcbX={0.5} pcbY={-2} pcbRotation={180}
        connections={{pin1: "net.VCCH", pin2: "net.GND"}}/>
      <netlabel net="VCCH" connection="C_BUCK_EN.pin1" schX={-6.5} schY={1.6} anchorSide="bottom"/>
      <netlabel net="GND" connection="C_BUCK_EN.pin2" schX={-6.5} schY={-0.4} anchorSide="top"/>
      <schematictext text="VCCH rising: 3.031V nominal enables both bucks; divider resistors +/-0.1%."
        schX={-7} schY={-2.2} fontSize={0.18} anchor="left"/>
      <schematictext text="CT open: 25us nominal release delay. Bridge reset/PG control remains separate."
        schX={-7} schY={-2.6} fontSize={0.18} anchor="left"/>
    </group>
  );
}
