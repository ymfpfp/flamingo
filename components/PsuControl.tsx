import {Fragment} from "react";
import {psuStatusRoutes, psuStatusTraceWidth} from "./PsuStatusRouting";
import {A_0402WGF1001TCE} from "imports/A_0402WGF1001TCE";
import {A_0402WGF1003TCE} from "imports/A_0402WGF1003TCE";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import {SN74AHCT1G14DBVR} from "imports/SN74AHCT1G14DBVR";
import {XL_1608UWC_04} from "imports/XL_1608UWC_04";

/** White indicator for the dedicated ATX PSU's PWR_OK output. */
export function PsuControl() {
  return (
    <group name="PSU_CONTROL" schX={10} schY={-7} pcbRelative
      pcbStyle={{silkscreenTextVisibility: "hidden"}}>
      <schematicsection name="PSU_CONTROL" displayName="ATX PSU Status"/>

      {/* PWR_OK is TTL: high >=2.4 V at only 200 uA source current.
          AHCT VT+ <=2.0 V, input leakage <=1 uA, independent 5 V LED supply.
          The inverter sinks the LED cathode when PWR_OK is high. */}
      <SN74AHCT1G14DBVR
        name="U_PSU_LED"
        schSectionName="PSU_CONTROL"
        schX={0} schY={0}
        pcbX={2.1} pcbY={3.39} pcbRotation={0}
        schHeight={1.2}
        schPinArrangement={{
          leftSide: {pins: [2], direction: "top-to-bottom"},
          rightSide: {pins: [4], direction: "top-to-bottom"},
          topSide: {pins: [5], direction: "left-to-right"},
          bottomSide: {pins: [3], direction: "left-to-right"},
        }}
        noConnect={["NC"]}
        connections={{A: "net.ATX_PWR_OK", VCC: "net.V5V", GND: "net.GND"}}
      />
      <netlabel inline net="ATX_PWR_OK" connection="U_PSU_LED.A"/>
      <netlabel inline net="V5V" connection="U_PSU_LED.VCC"/>
      <netlabel inline net="GND" connection="U_PSU_LED.GND"/>
      <A_0402WGF1003TCE
        name="R_PSU_OK_PD"
        schSectionName="PSU_CONTROL"
        schX={-2.5} schY={-2.5}
        schOrientation="vertical"
        pcbX={5.72} pcbY={3.865} pcbRotation={90}
        connections={{pin1: "net.ATX_PWR_OK", pin2: "net.GND"}}
      />
      <netlabel inline net="ATX_PWR_OK" connection="R_PSU_OK_PD.pin1"/>
      <netlabel inline net="GND" connection="R_PSU_OK_PD.pin2"/>
      <CL05B104KO5NNNC
        name="C_PSU_LED"
        schSectionName="PSU_CONTROL"
        schX={2.5} schY={-2.5}
        schOrientation="vertical"
        pcbX={0.8} pcbY={0.9201155} pcbRotation={270}
        // 1.1 mm pad-center distance clears both assembly courtyards.
        maxDecouplingTraceLength="1.5mm"
        connections={{pin1: "net.V5V", pin2: "net.GND"}}
      />
      <netlabel inline net="V5V" connection="C_PSU_LED.pin1"/>
      <netlabel inline net="GND" connection="C_PSU_LED.pin2"/>
      <A_0402WGF1001TCE
        name="R_PSU_LED"
        schSectionName="PSU_CONTROL"
        schX={5} schY={2.5}
        schOrientation="vertical"
        pcbX={0.7265125} pcbY={6.85565} pcbRotation={90}
        connections={{pin1: "net.V5V"}}
      />
      <netlabel inline net="V5V" connection="R_PSU_LED.pin1"/>
      {psuStatusRoutes.map(({name, from, to}) => <Fragment key={name}>
        <trace name={name} from={from} to={to} routingPhaseIndex={2}
          width={psuStatusTraceWidth} maxViaCount={0}/>
      </Fragment>)}
      <schematictext text="PWR_OK high: driver sinks LED current" schX={-1.5} schY={-3.8} fontSize={0.18} anchor="left"/>
    </group>
  );
}

/** Independently placed indicator; its driver remains in PSU_CONTROL. */
export function PsuOkLed() {
  return (
    <XL_1608UWC_04
      name="LED_PSU_OK"
      footprint="smdpads2_p1.5989mm_pw0.8mm_ph0.8mm_cyw2.8989mm_cyh1.3069mm_nosilkscreen"
      color="white"
      schDisplayValue="WHITE / PSU OK"
      schSectionName="PSU_CONTROL"
      schX={15} schY={-7}
      schOrientation="vertical"
      pcbMarginX="3mm"
      pcbMarginY="2mm"
      pcbStyle={{silkscreenTextVisibility: "hidden"}}
    />
  );
}
