import {A_0402WGF1002TCE} from "imports/A_0402WGF1002TCE";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import {RT0402BRD0710KL} from "imports/RT0402BRD0710KL";
import {RT0402BRD0716K2L} from "imports/RT0402BRD0716K2L";
import {TPS389001DSER} from "imports/TPS389001DSER";
import type {ChipProps} from "@tscircuit/props";

/** Shared buck enable; independent of the bridge's reset net and buck PG pins. */
export function BuckEnable({spiceModel}: {spiceModel?: ChipProps["spiceModel"]} = {}) {
  return (
    <group name="BUCK_ENABLE" schX={16} schY={0}
      pcbStyle={{silkscreenTextVisibility: "hidden"}}>
      <schematicsection name="BUCK_ENABLE" displayName="VCCH Monitor and Buck Enable"/>
      <TPS389001DSER
        name="U_BUCK_EN"
        spiceModel={spiceModel}
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
      <trace name="BUCK_MONITOR_DIVIDER" from=".R_BUCK_EN_BOTTOM > .pin1" to=".R_BUCK_EN_TOP > .pin2"
        routingPhaseIndex={10} width={.15} maxViaCount={0}/>
      <trace name="BUCK_MONITOR_SENSE" from="U_BUCK_EN.SENSE" to="R_BUCK_EN_TOP.pin2"
        routingPhaseIndex={10} width={.15} maxViaCount={0}/>
      <autoroutingphase name="BUCK_MONITOR_LOCAL" phaseIndex={10}
        connections={["R_BUCK_EN_BOTTOM.pin1", "U_BUCK_EN.SENSE"]}
        minTraceWidth={.15} pcbTracePaths={[]}/>
      <bus name="BUCK_MONITOR_TOP" connections={["BUCK_MONITOR_DIVIDER", "BUCK_MONITOR_SENSE"]}
        pcbAllowedLayers={["top"]} preferredLayer="top" pcbTraceWidth={.15}/>
      <netlabel inline net="VCCH_SENSE" connectsTo={["R_BUCK_EN_TOP.pin2", "R_BUCK_EN_BOTTOM.pin1"]}/>
      <netlabel inline net="VCCH" connection="R_BUCK_EN_TOP.pin1"/>
      <netlabel inline net="GND" connection="R_BUCK_EN_BOTTOM.pin2"/>
      <netlabel inline net="VCCH_SENSE" connection="U_BUCK_EN.SENSE"/>
      <netlabel inline net="VCCH" connection="U_BUCK_EN.N_MR"/>
      <netlabel inline net="VCCH" connection="U_BUCK_EN.VDD"/>
      <netlabel inline net="GND" connection="U_BUCK_EN.GND"/>
      <A_0402WGF1002TCE name="R_BUCK_EN_PU" schSectionName="BUCK_ENABLE"
        schX={3} schY={1.1} schOrientation="vertical"
        pcbX={2.8} pcbY={0.5} pcbRotation={180}
        connections={{pin1: "net.VCCH"}}/>
      <netlabel inline net="VCCH" connection="R_BUCK_EN_PU.pin1"/>
      <netlabel inline net="BUCK_EN" connection="U_BUCK_EN.N_RESET"/>
      <trace name="BUCK_ENABLE_PULLUP" from="R_BUCK_EN_PU.pin2" to="U_BUCK_EN.N_RESET"
        routingPhaseIndex={7} width={.25} maxViaCount={0}/>
      <autoroutingphase name="BUCK_ENABLE_LOCAL" phaseIndex={7}
        connections={["R_BUCK_EN_PU.pin2"]} minTraceWidth={.25} pcbTracePaths={[]}/>
      <bus name="BUCK_ENABLE_PULLUP_TOP" connections={["BUCK_ENABLE_PULLUP"]}
        pcbAllowedLayers={["top"]} preferredLayer="top" pcbTraceWidth={.25}/>
      <CL05B104KO5NNNC name="C_BUCK_EN" schSectionName="BUCK_ENABLE"
        schX={-6.5} schY={0.6} schOrientation="vertical"
        pcbX={0.5} pcbY={-2} pcbRotation={180}
        connections={{pin1: "net.VCCH", pin2: "net.GND"}}/>
      <netlabel inline net="VCCH" connection="C_BUCK_EN.pin1"/>
      <netlabel inline net="GND" connection="C_BUCK_EN.pin2"/>
      <schematictext text="VCCH rising: 3.031V nominal enables both bucks; divider resistors +/-0.1%."
        schX={-7} schY={-2.2} fontSize={0.18} anchor="left"/>
      <schematictext text="CT open: 25us nominal release delay. Bridge reset/PG control remains separate."
        schX={-7} schY={-2.6} fontSize={0.18} anchor="left"/>
    </group>
  );
}
