import {Fragment} from "react";
import type {AutoroutingPhase,Board,Port} from "tscircuit";
import {fanoutTracePath} from "@tscircuit/props";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import terminals from "../manufacturing/ground-returns/terminals.json";
import specs from "../manufacturing/ground-returns/specs.json";
import paths from "../manufacturing/ground-returns/paths.json";

export function GroundReturns(){return <>
  <autoroutingphase name="GROUND_RETURNS" phaseIndex={18} connections={[]} minTraceWidth={.2} pcbTracePaths={[]}/>
  {terminals.filter(t=>!t.existing).map(t=><Fragment key={t.name}>
    <via name={t.name} pcbX={t.x} pcbY={t.y} connectsTo={t.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={t.copperDiameter} holeDiameter={t.drillDiameter}/>
  </Fragment>)}
  {specs.map(s=><Fragment key={s.name}>
    <trace name={s.name} from={s.from} to={s.to} routingPhaseIndex={18} width={s.width} maxViaCount={0}/>
  </Fragment>)}
</>}

export function prepareGroundReturns(board:Board,phase:AutoroutingPhase){
  const db=board.root!.db;
  phase._parsedProps.pcbTracePaths=specs.map(s=>{
    const source=db.source_trace.list().find(t=>t.name===s.name);
    if(!source)throw Error(`Missing ground connection ${s.name}`);
    source.connected_source_net_ids=[];
    const at=board.selectOne(s.select,{type:"port"}) as Port|null;
    if(!at)throw Error(`Missing ground pad ${s.select}`);
    const before=at._getGlobalPcbPositionBeforeLayout(),after=at._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    const path=paths.find(p=>p.name===s.name);
    if(!path)throw Error(`Missing native ground path ${s.name}`);
    return fanoutTracePath.parse({connection:s.select,route:path.route.map(q=>({...q,...applyToPoint(transform,q)}))});
  });
}
