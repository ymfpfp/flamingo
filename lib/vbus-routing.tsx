import {Fragment} from "react";
import {FixedTrace} from "../components/FixedTrace";
import {Port} from "tscircuit";
import type {Via} from "tscircuit";
import terminals from "../manufacturing/vbus-routing/terminals.json";
import specs from "../manufacturing/vbus-routing/specs.json";

function attachInnerContact(via:Via|null){
  if(!via||via.children.some(p=>p.name==="inner2"))return;
  const port=new Port({name:"inner2",layer:"inner2"});port.registerMatch(via);via.add(port);
}

export function VbusRouting(){return <>
  {terminals.filter(t=>!t.existing).map(t=><Fragment key={t.name}>
    <via name={t.name} {...{ref:attachInnerContact}} pcbX={t.x} pcbY={t.y} connectsTo={t.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={t.copperDiameter} holeDiameter={t.drillDiameter}/>
  </Fragment>)}
  {specs.map(s=><Fragment key={s.name}>
    <FixedTrace {...s}/>
  </Fragment>)}
</>}
