import {Fragment} from "react";
import type {AutoroutingPhase,Board,Port} from "tscircuit";
import {fanoutTracePath} from "@tscircuit/props";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import terminals from "../manufacturing/power-distribution/terminals.json";
import capEscapes from "../manufacturing/power-distribution/cap-escapes.json";
import bgaEscapes from "../manufacturing/power-distribution/bga-escapes.json";
import bgaCopper from "../manufacturing/power-distribution/bga-copper.json";

// Explicit pad contacts on the fixed, top-only placement. The layout audit
// rejects placement drift and verifies actual copper to every terminal.
export const powerDistributionTerminals=terminals;
export const powerDistributionLayers={VCCL:"inner2",VDD:"inner3"} as const;
export const powerDistributionOutline=[
  {x:.5,y:78.4},{x:46,y:78.4},{x:46,y:114},{x:.5,y:114},
];
const vddOutline=[{x:26.3,y:70},{x:46,y:70},{x:46,y:114},{x:18,y:114},
  {x:18,y:98.5},{x:27.1,y:98.5},{x:27.1,y:96.95},{x:25.4,y:96.95},{x:25.4,y:93.3},{x:26.3,y:93.3}];
const vcclParallelOutline=[{x:.5,y:70},{x:26,y:70},{x:26,y:93},
  {x:25.1,y:93},{x:25.1,y:97.25},{x:26.8,y:97.25},{x:26.8,y:98.2},{x:.5,y:98.2}];
const vddParallelOutline=[{x:29.5,y:70},{x:46,y:70},{x:46,y:93},{x:29.5,y:93}];
const paths=[...capEscapes,...bgaEscapes];

export function PowerDistribution(){return <>
  <autoroutingphase name="PDN_CONTACTS" phaseIndex={8} minTraceWidth={.1} pcbTracePaths={[]}/>
  {paths.map(p=><Fragment key={p.name}>
    <trace name={`${p.name}_TRACE`} from={p.selector} to={`${terminals.find(t=>t.name===p.name)?.viaOwner??p.name}.top`}
      routingPhaseIndex={8} width={p.route[0]!.width} maxViaCount={0}/>
  </Fragment>)}
  {Object.entries(powerDistributionLayers).map(([rail,layer])=><Fragment key={rail}>
    <copperpour name={`PDN_${rail}_${layer}`} connectsTo={`net.${rail}`} layer={layer}
      outline={rail==="VDD"?vddOutline:powerDistributionOutline} clearance={.205} padMargin={.205}
      traceMargin={rail==="VCCL"?.225:.205} boardEdgeMargin={0} cutoutMargin={.215} useThermalReliefs={false}/>
  </Fragment>)}
  <copperpour name="PDN_VCCL_PARALLEL" connectsTo="net.VCCL" layer="inner3"
    outline={vcclParallelOutline} clearance={.205} padMargin={.205} traceMargin={.225}
    boardEdgeMargin={0} cutoutMargin={.215} useThermalReliefs={false}/>
  <copperpour name="PDN_VDD_PARALLEL" connectsTo="net.VDD" layer="inner2"
    outline={vddParallelOutline} clearance={.205} padMargin={.205} traceMargin={.205}
    boardEdgeMargin={0} cutoutMargin={.215} useThermalReliefs={false}/>
  {bgaCopper.map(p=><Fragment key={p.name}>
    <copperpour name={`PDN_${p.name}`} connectsTo={`net.${p.net}`} layer="top"
      outline={p.outline} clearance={p.clearance} padMargin={p.clearance}
      traceMargin={p.clearance} boardEdgeMargin={0} useThermalReliefs={false}/>
  </Fragment>)}
  {terminals.filter(t=>!t.viaOwner&&(t.role!=="bridge"||paths.some(p=>p.name===t.name))).map(t=><Fragment key={t.name}>
    <via name={t.name} pcbX={t.x} pcbY={t.y}
      connectsTo={`${t.part}.${t.port}`} fromLayer="top" toLayer="bottom"
      outerDiameter={t.copperDiameter} holeDiameter={t.drillDiameter}/>
  </Fragment>)}
</>}

// Replay authored contacts and native solver output without changing geometry.
export function preparePowerDistribution(board:Board,phase:AutoroutingPhase){
  // These are explicit two-port contacts. A via connected to net.GND causes
  // core to copy that net onto the contact trace and omit it from the direct
  // phase input. Keep the net on the via's own source connection; the contact
  // remains connected to the same net through its via port.
  const db=board.root!.db;
  for(const p of paths){
    const trace=db.source_trace.list().find(t=>t.name===`${p.name}_TRACE`);
    if(!trace||trace.connected_source_port_ids.length!==2)throw Error(`Invalid PDN contact ${p.name}`);
    trace.connected_source_net_ids=[];
  }
  phase._parsedProps.pcbTracePaths=paths.map(p=>{
    const port=board.selectOne(p.selector,{type:"port"}) as Port|null;
    if(!port)throw Error(`Missing PDN contact ${p.selector}`);
    const before=port._getGlobalPcbPositionBeforeLayout(),after=port._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    return fanoutTracePath.parse({connection:p.selector,route:p.route.map(q=>({...q,...applyToPoint(transform,q)}))});
  });
}
