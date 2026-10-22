import {Fragment} from "react";
import {Port} from "tscircuit";
import type {Via} from "tscircuit";
import {FixedTrace} from "./FixedTrace";
import routes from "../manufacturing/control-routing/routed-top.json";
import surfaceRoutes from "../manufacturing/control-routing/routed-surface.json";
import ccPourClearance from "../manufacturing/control-routing/cc-pour-clearance.json";
import ccPourCleanup from "../manufacturing/control-routing/cc-pour-cleanup.json";

// Saved native routes and authored local refinements, independently checked.
const frame={x:42.65,y:100.74475};
const ccKeepouts=[...ccPourClearance.keepouts,...ccPourCleanup] as Array<{pcb_keepout_id:string;layers:string[];center:{x:number;y:number};width:number;height:number}>;
function attachInnerContact(via: Via|null) {
  if (!via) return;
  for(const layer of ["inner2","inner3"] as const){
    if(via.children.some(p=>p.name===layer))continue;
    const port = new Port({name: layer, layer});
    port.registerMatch(via); via.add(port);
  }
}
export function ControlSupportRoutes({omitNets=[]}: {omitNets?: string[]} = {}) {
  if(!ccPourClearance.passed||ccPourClearance.violations.length)throw Error("CC pour-clearance encoding failed");
  return <>
    {ccKeepouts.map(k=><Fragment key={k.pcb_keepout_id}><keepout
      shape="rect" layer={k.layers[0] as "inner2"|"inner3"}
      pcbX={k.center.x} pcbY={k.center.y} width={k.width} height={k.height}
      allowTraces allowPlacements/></Fragment>)}
    {routes.filter(route=>!omitNets.includes(route.net)).map(route => <Fragment key={route.name}>
    <FixedTrace {...route}/>
  </Fragment>)}
    {surfaceRoutes.filter(net=>!omitNets.includes(net.net)).map(net=><Fragment key={net.net}>
      {net.vias.map(v=><Fragment key={v.name}><via name={v.name} pcbX={v.x} pcbY={v.y}
        {...(net.segments.some(s=>["inner2","inner3"].includes(s.layer)) ? {ref:attachInnerContact} : {})}
        outerDiameter={v.diameter} holeDiameter={v.hole} fromLayer="top" toLayer="bottom" connectsTo={v.connectsTo}/></Fragment>)}
      {net.segments.map(s=><Fragment key={s.name}>
        {["inner2","inner3"].includes(s.layer) ? <FixedTrace {...s}/> : <trace name={s.name} from={s.from} to={s.to} width={s.width} maxViaCount={0}
          pcbPathRelativeTo={`USB4_GND_RETURN_0.${s.layer}`}
          pcbPaths={[s.points.map(([x,y])=>({x:x-frame.x,y:y-frame.y}))]}/>}
      </Fragment>)}
    </Fragment>)}
  </>;
}
