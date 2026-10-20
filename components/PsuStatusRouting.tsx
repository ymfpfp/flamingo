import {Fragment} from "react";
import {fanoutTracePath} from "@tscircuit/props";
import savedPaths from "../lib/psu-status-trace-paths.json";
import {traceWidthsMm} from "../lib/trace-width-rules";

export const psuStatusTraceWidth = traceWidthsMm.general;
export const psuStatusRoutes = [
  {name: "PSU_STATUS_INPUT", from: "ATX.pin8", to: "U_PSU_LED.A"},
  {name: "PSU_STATUS_PULLDOWN", from: "R_PSU_OK_PD.pin1", to: "U_PSU_LED.A"},
  {name: "PSU_STATUS_5V", from: "ATX.pin4", to: "U_PSU_LED.VCC"},
  {name: "PSU_STATUS_BYPASS", from: "C_PSU_LED.pin1", to: "U_PSU_LED.VCC"},
  {name: "PSU_STATUS_LED_FEED", from: "R_PSU_LED.pin1", to: "U_PSU_LED.VCC"},
  {name: "PSU_STATUS_LED_ANODE", from: "R_PSU_LED.pin2", to: "LED_PSU_OK.anode"},
  {name: "PSU_STATUS_LED_CATHODE", from: "LED_PSU_OK.cathode", to: "U_PSU_LED.Y"},
  {name: "PSU_STATUS_GND_IC", from: "U_PSU_LED.GND", to: "PSU_STATUS_GND_IC.top"},
  {name: "PSU_STATUS_GND_PD", from: "R_PSU_OK_PD.pin2", to: "PSU_STATUS_GND_PD.top"},
  {name: "PSU_STATUS_GND_CAP", from: "C_PSU_LED.pin2", to: "PSU_STATUS_GND_CAP.top"},
] as const;

export function PsuStatusRouting() {
  return <>
    <autoroutingphase name="PSU_STATUS" phaseIndex={2}
      minTraceWidth={psuStatusTraceWidth} pcbTracePaths={savedPaths.map(path => fanoutTracePath.parse(path))}/>
    <bus name="PSU_STATUS_TOP" connections={psuStatusRoutes.map(t => t.name)}
      pcbAllowedLayers={["top"]} preferredLayer="top" pcbTraceWidth={psuStatusTraceWidth}/>
    {/* Through vias join both existing GND planes; signal routes remain on top. */}
    {[
      {name: "IC", x: 43.8, y: 26.45, ground: "U_PSU_LED.GND"},
      {name: "PD", x: 45.95, y: 26.4078, ground: "R_PSU_OK_PD.pin2"},
      {name: "CAP", x: 40.3, y: 21.9, ground: "C_PSU_LED.pin2"},
    ].map(({name, x, y, ground}) => <Fragment key={name}>
      <via name={`PSU_STATUS_GND_${name}`} pcbX={x} pcbY={y}
        fromLayer="top" toLayer="bottom" holeDiameter={0.2} outerDiameter={0.4} connectsTo={ground}/>
    </Fragment>)}
  </>;
}
