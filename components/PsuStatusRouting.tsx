import {Fragment} from "react";
import psuStatusRoutes from "../manufacturing/psu-status-routing.json";
import {traceWidthsMm} from "../lib/trace-width-rules";

export const psuStatusTraceWidth = traceWidthsMm.general;
export {psuStatusRoutes};

export function PsuStatusRouting() {
  return <>
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
