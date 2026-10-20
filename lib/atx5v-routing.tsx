import {Fragment} from "react";
import type {AutoroutingPhase,Board,Port} from "tscircuit";
import {fanoutTracePath} from "@tscircuit/props";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import contacts from "../manufacturing/atx5v-routing/contacts.json";
import regions from "../manufacturing/atx5v-routing/regions.json";

export function Atx5vRouting(){return <>
  <autoroutingphase name="ATX5V_CONTACTS" phaseIndex={11} minTraceWidth={.8} pcbTracePaths={[]}/>
  {contacts.map(p=><Fragment key={p.name}>
    <via name={p.name} pcbX={p.x} pcbY={p.y} connectsTo={p.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={p.copperDiameter} holeDiameter={p.drillDiameter}/>
    <trace name={`${p.name}_TRACE`} from={`${p.name}.top`} to={p.selector}
      routingPhaseIndex={11} width={p.width} maxViaCount={0}/>
  </Fragment>)}
  {regions.map(p=><Fragment key={p.name}>
    <copperpour name={p.name} connectsTo="net.V5V" layer="inner3" outline={p.outline}
      clearance={p.clearance} padMargin={p.clearance} traceMargin={p.clearance}
      cutoutMargin={.215} boardEdgeMargin={0} useThermalReliefs={false}/>
  </Fragment>)}
</>}

// Replay short, authored pad-to-via contacts with the native saved-path API.
// The native pour solver clips the L4 feeder around foreign copper and drills.
export function prepareAtx5vRouting(board:Board,phase:AutoroutingPhase){
  const db=board.root!.db;
  phase._parsedProps.pcbTracePaths=contacts.map(p=>{
    const source=db.source_trace.list().find(t=>t.name===`${p.name}_TRACE`);
    if(!source||source.connected_source_port_ids.length!==2)throw Error(`Invalid 5 V input contact ${p.name}`);
    source.connected_source_net_ids=[];
    const selector=`${p.name}.top`;
    const viaPort=board.selectOne(selector,{type:"port"}) as Port|null;
    const pad=board.selectOne(p.selector,{type:"port"}) as Port|null;
    if(!viaPort||!pad)throw Error(`Missing 5 V input contact ${p.name}`);
    const before=viaPort._getGlobalPcbPositionBeforeLayout(),after=viaPort._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    return fanoutTracePath.parse({connection:selector,route:[after,pad._getGlobalPcbPositionAfterLayout()].map(q=>({
      route_type:"wire",...applyToPoint(transform,q),width:p.width,layer:"top",
    }))});
  });
}
