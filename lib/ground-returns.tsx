import {Fragment} from "react";
import {FixedTrace} from "../components/FixedTrace";
import terminals from "../manufacturing/ground-returns/terminals.json";
import specs from "../manufacturing/ground-returns/specs.json";

export function GroundReturns(){return <>
  {terminals.filter(t=>!t.existing).map(t=><Fragment key={t.name}>
    <via name={t.name} pcbX={t.x} pcbY={t.y} connectsTo={t.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={t.copperDiameter} holeDiameter={t.drillDiameter}/>
  </Fragment>)}
  {specs.map(s=><Fragment key={s.name}>
    <FixedTrace {...s}/>
  </Fragment>)}
</>}
