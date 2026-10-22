import {Fragment} from "react";
import contacts from "../manufacturing/atx5v-routing/contacts.json";
import regions from "../manufacturing/atx5v-routing/regions.json";

export function Atx5vRouting(){return <>
  {contacts.map(p=><Fragment key={p.name}>
    <via name={p.name} pcbX={p.x} pcbY={p.y} connectsTo={p.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={p.copperDiameter} holeDiameter={p.drillDiameter}/>
    <trace name={`${p.name}_TRACE`} from={`${p.name}.top`} to={p.selector}
      pcbPath={[`${p.name}.top`,p.selector]} width={p.width} maxViaCount={0}/>
  </Fragment>)}
  {regions.map(p=><Fragment key={p.name}>
    <copperpour name={p.name} connectsTo="net.V5V" layer="inner3" outline={p.outline}
      clearance={p.clearance} padMargin={p.clearance} traceMargin={p.clearance}
      cutoutMargin={.215} boardEdgeMargin={0} useThermalReliefs={false}/>
  </Fragment>)}
</>}
