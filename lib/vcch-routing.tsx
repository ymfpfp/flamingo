import {Fragment} from "react";
import {FixedTrace} from "../components/FixedTrace";
import type {AutoroutingPhase,Board,Port} from "tscircuit";
import {fanoutTracePath} from "@tscircuit/props";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import contacts from "../manufacturing/vcch-routing/contacts.json";
import terminals from "../manufacturing/vcch-routing/terminals.json";
import regions from "../manufacturing/vcch-routing/regions.json";

const tapered=contacts.filter(p=>new Set(p.route.map(q=>q.width)).size>1);

export function VcchRouting(){return <>
  <autoroutingphase name="VCCH_CONTACTS" phaseIndex={9} minTraceWidth={.1} pcbTracePaths={[]}/>
  {contacts.map(p=>{
    const to=`${terminals.find(t=>t.name===p.name)?.viaOwner??p.name}.top`;
    return <Fragment key={p.name}>{tapered.some(q=>q.name===p.name)
      ? <trace name={`${p.name}_TRACE`} from={p.selector} to={to} routingPhaseIndex={9} width={p.route[0]!.width} maxViaCount={0}/>
      : <FixedTrace name={`${p.name}_TRACE`} from={p.selector} to={to} width={p.route[0]!.width}
          points={p.route.slice(1,-1).map(q=>[q.x,q.y])}/>}</Fragment>;
  })}
  {terminals.filter(t=>!t.viaOwner).map(t=><Fragment key={t.name}>
    <via name={t.name} pcbX={t.x} pcbY={t.y} connectsTo={t.selector}
      fromLayer="top" toLayer="bottom" outerDiameter={t.copperDiameter} holeDiameter={t.drillDiameter}/>
  </Fragment>)}
  {regions.map(p=><Fragment key={p.name}>
    <copperpour name={p.name} connectsTo={`net.${p.net}`} layer={p.layer as "top"|"inner2"|"inner3"}
      outline={p.outline} clearance={p.clearance} padMargin={p.clearance}
      traceMargin={p.layer==="inner3"?Math.max(.26,p.clearance):p.clearance}
      cutoutMargin={.215} boardEdgeMargin={0} useThermalReliefs={false}/>
  </Fragment>)}
</>}

export function prepareVcchRouting(board:Board,phase:AutoroutingPhase){
  const db=board.root!.db;
  for(const p of tapered){
    const trace=db.source_trace.list().find(t=>t.name===`${p.name}_TRACE`);
    if(!trace||trace.connected_source_port_ids.length!==2)throw Error(`Invalid 3.3 V contact ${p.name}`);
    trace.connected_source_net_ids=[];
  }
  phase._parsedProps.pcbTracePaths=tapered.map(p=>{
    const port=board.selectOne(p.selector,{type:"port"}) as Port|null;
    if(!port)throw Error(`Missing 3.3 V contact ${p.selector}`);
    const before=port._getGlobalPcbPositionBeforeLayout(),after=port._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    return fanoutTracePath.parse({connection:p.selector,route:p.route.map(q=>({...q,...applyToPoint(transform,q)}))});
  });
}
