import {Fragment} from "react";
import type {ChipProps} from "@tscircuit/props";
import {fp} from "@tscircuit/footprinter";
import {FixedTrace} from "./FixedTrace";

const pinLabels = {pin1:["GND"],pin2:["V5V"],pin3:["PWR_OK"]} as const;
// Standard 1 mm wire holes; retain the generated lands and courtyard.
const geometry = fp.string("pinrow3_p2.54mm").circuitJson()
  .filter(e => e.type !== "pcb_silkscreen_text");

/** Unpopulated access for a future external buffered status circuit. */
export function PsuStatusAccess(){return <>
  <schematicsection name="PSU_ACCESS" displayName="Optional External PSU Status"/>
  <connector name="PSU_ACCESS" doNotPlace layer="top" pcbRotation={0}
    schSectionName="PSU_ACCESS" schX={-7.5} schY={-4.5}
    pinLabels={pinLabels} schPinArrangement={{leftSide:{pins:[1,2,3],direction:"top-to-bottom"}}}
    footprint={geometry as ChipProps<typeof pinLabels>["footprint"]} connections={{GND:"net.GND",V5V:"net.V5V",PWR_OK:"net.ATX_PWR_OK"}}>
    <footprint insertionDirection="from_above">
      {["GND","5V","PWR_OK"].map((text,i)=><Fragment key={text}>
        {/* Align the near edges, leaving 0.75 mm to the 1.5 mm copper lands. */}
        <silkscreentext text={text} pcbX={(i-1)*2.54} pcbY={1.5} pcbRotation={90} fontSize={.8} anchorAlignment="center_left"/>
      </Fragment>)}
    </footprint>
  </connector>
  <netlabel inline net="GND" connection="PSU_ACCESS.GND"/>
  <netlabel inline net="V5V" connection="PSU_ACCESS.V5V"/>
  <netlabel inline net="ATX_PWR_OK" connection="PSU_ACCESS.PWR_OK"/>
  <schematictext text="Unpopulated wire access. PWR_OK is a logic signal; use an external buffer for an LED."
    schX={-9.5} schY={-5.7} fontSize={.18} anchor="left"/>
</>}

// Reuse the previously checked ATX pin escapes; no BGA or signal vias change.
export function PsuStatusAccessRouting(){return <>
  <FixedTrace name="PSU_ACCESS_PWR_OK" from="ATX.pin8" to="PSU_ACCESS.PWR_OK" width={.25}
    points={[[21.2999748,12.4948786],[38.1000428,12.4948786],[39.149918,13.5447538],
      [39.149918,21.1450094],[40.2167749843,21.1450094],[42,22.9282344157],[42,23.96]]}/>
  <FixedTrace name="PSU_ACCESS_5V" from="ATX.pin4" to="PSU_ACCESS.V5V" width={.25}
    points={[[38.1000428,15.6448934],[38.1000428,22.3999912],[42.5,26.7999484]]}/>
</>}
