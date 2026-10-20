import {Fragment} from "react";
import {Port} from "tscircuit";
import type {AutoroutingPhase,Board,Via} from "tscircuit";
import {fanoutTracePath} from "@tscircuit/props";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import terminals from "../manufacturing/vbus-routing/terminals.json";
import specs from "../manufacturing/vbus-routing/specs.json";
import paths from "../manufacturing/vbus-routing/paths.json";

function attachInnerContact(via:Via|null){
  if(!via||via.children.some(p=>p.name==="inner2"))return;
  const port=new Port({name:"inner2",layer:"inner2"});port.registerMatch(via);via.add(port);
}

export function VbusRouting(){return <>
  {/* Explicit empty selectors keep shared sense ports from pulling traces
      into another phase when the saved paths are attached after placement. */}
  {[15,16,17].map(i=><Fragment key={i}><autoroutingphase name={`VBUS_SENSING_${i}`} phaseIndex={i} connections={[]} minTraceWidth={.127} pcbTracePaths={[]}/></Fragment>)}
  {terminals.filter(t=>!t.existing).map(t=><Fragment key={t.name}>
    <via name={t.name} {...{ref:attachInnerContact}} pcbX={t.x} pcbY={t.y} connectsTo={t.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={t.copperDiameter} holeDiameter={t.drillDiameter}/>
  </Fragment>)}
  {specs.filter(s=>s.name!=="VBUS_DIVIDER").map(s=><Fragment key={s.name}>
    <trace name={s.name} from={s.from} to={s.to} routingPhaseIndex={s.phase} width={s.width} maxViaCount={0}/>
  </Fragment>)}
</>}

// Saved native solver paths use global board coordinates. Convert them to the
// owning phase's frame after fixed component placement has been applied.
export function prepareVbusRouting(board:Board,phase:AutoroutingPhase){
  const db=board.root!.db;
  phase._parsedProps.pcbTracePaths=specs.filter(s=>s.phase===phase.props.phaseIndex).map(s=>{
    const source=db.source_trace.list().find(t=>t.name===s.name);
    if(!source)throw Error(`Missing VBUS connection ${s.name}`);
    source.connected_source_net_ids=[];
    const at=board.selectOne(s.select,{type:"port"}) as Port|null;
    if(!at)throw Error(`Missing VBUS port ${s.select}`);
    const before=at._getGlobalPcbPositionBeforeLayout(),after=at._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    const path=paths.find(p=>p.name===s.name);
    if(!path)throw Error(`Missing native VBUS path ${s.name}`);
    return fanoutTracePath.parse({connection:s.select,route:path.route.map(q=>({...q,...applyToPoint(transform,q)}))});
  });
}
