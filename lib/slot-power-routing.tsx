import {Fragment} from "react";
import {Port} from "tscircuit";
import type {AutoroutingPhase,Board,Via} from "tscircuit";
import {fanoutTracePath} from "@tscircuit/props";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import terminals from "../manufacturing/slot-power-routing/terminals.json";
import regions from "../manufacturing/slot-power-routing/regions.json";
import contactPaths from "../manufacturing/slot-power-routing/contact-paths.json";
import controlPaths from "../manufacturing/slot-power-routing/control-paths.json";
import controlSpecs from "../manufacturing/slot-power-routing/control-specs.json";

// Via is initially constructed before the six-layer board is attached, so
// this core version creates only its top/bottom ports. Register the L4 barrel
// contacts explicitly for the full-stack vias used by the control trunk.
function attachInnerContacts(via:Via|null){
  if(!via)return;
  for(const layer of ["inner2","inner3"] as const){
    if(via.children.some(p=>p.name===layer))continue;
    const port=new Port({name:layer,layer});port.registerMatch(via);via.add(port);
  }
}

export function SlotPowerRouting(){return <>
  <autoroutingphase name="SLOT_POWER_CONTACTS" phaseIndex={12} minTraceWidth={.1} pcbTracePaths={[]}/>
  <autoroutingphase name="SLOT_POWER_CONTROL" phaseIndex={14} minTraceWidth={.15} pcbTracePaths={[]}/>
  {controlSpecs.filter(p=>p.name.startsWith("SP_HDDPC")&&p.name!=="SP_HDDPC_PULLDOWN").map(p=><Fragment key={p.name}>
    <trace name={p.name} from={p.from} to={p.to} routingPhaseIndex={14} width={p.width} maxViaCount={0}/>
  </Fragment>)}
  {terminals.map(p=><Fragment key={p.name}>
    <via name={p.name} pcbX={p.x} pcbY={p.y} connectsTo={p.selector}
      {...(["SP_HDDPC_ESC","SP_HDDPC_DRV_3V3","SP_HDDPC_FLASH_A","SP_HDDPC_FLASH_B","SP_HDDPC_BUCK"].includes(p.name)?{ref:attachInnerContacts}:{})}
      fromLayer="top" toLayer="bottom" outerDiameter={p.copperDiameter} holeDiameter={p.drillDiameter}/>
    {p.contact&&<trace name={`${p.name}_TRACE`} from={`${p.name}.top`} to={p.selector}
      routingPhaseIndex={12} width={p.width} maxViaCount={0}/>}
  </Fragment>)}
  {regions.map(p=><Fragment key={p.name}>
    <copperpour name={p.name} connectsTo={`net.${p.net}`} layer={p.layer as "inner2"|"inner3"} outline={p.outline}
      clearance={p.clearance} padMargin={p.clearance} traceMargin={p.clearance}
      cutoutMargin={.225} boardEdgeMargin={0} useThermalReliefs={false}/>
  </Fragment>)}
</>}

export function prepareSlotPowerRouting(board:Board,phase:AutoroutingPhase){
  const db=board.root!.db;
  if(phase.props.phaseIndex!==12){
    phase._parsedProps.pcbTracePaths=controlSpecs.filter(p=>["SP_PSU_START","SP_HDDPC_DRIVERS","SP_HDDPC_TRUNK","SP_HDDPC_FLASH_CROSS","SP_HDDPC_MAIN","SP_HDDPC_GATE_FEED"].includes(p.name)===(phase.props.phaseIndex===14)).map(p=>{
      const source=db.source_trace.list().find(t=>t.name===p.name);
      if(!source)throw Error(`Missing slot control ${p.name}`);
      source.connected_source_net_ids=[];
      const at=board.selectOne(p.select,{type:"port"}) as Port|null;
      if(!at)throw Error(`Missing slot control port ${p.select}`);
      const before=at._getGlobalPcbPositionBeforeLayout(),after=at._getGlobalPcbPositionAfterLayout();
      const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
      const path=controlPaths.find(q=>q.name===p.name);
      if(!path)throw Error(`Missing native slot control path ${p.name}`);
      return fanoutTracePath.parse({connection:p.select,route:path.route.map(q=>({...q,...applyToPoint(transform,q)}))});
    });
    return;
  }
  phase._parsedProps.pcbTracePaths=terminals.filter(p=>p.contact).map(p=>{
    const source=db.source_trace.list().find(t=>t.name===`${p.name}_TRACE`);
    if(!source||source.connected_source_port_ids.length!==2)throw Error(`Invalid slot contact ${p.name}`);
    source.connected_source_net_ids=[];
    const selector=`${p.name}.top`,via=board.selectOne(selector,{type:"port"}) as Port|null;
    const pad=board.selectOne(p.selector,{type:"port"}) as Port|null;
    if(!via||!pad)throw Error(`Missing slot contact ${p.name}`);
    const before=via._getGlobalPcbPositionBeforeLayout(),after=via._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    const path=contactPaths.find(q=>q.name===p.name);
    if(!path)throw Error(`Missing slot contact path ${p.name}`);
    return fanoutTracePath.parse({connection:selector,route:path.route.map(q=>({...q,...applyToPoint(transform,q)}))});
  });
}
