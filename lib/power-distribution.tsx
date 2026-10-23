import {Fragment} from "react";
import {FixedTrace} from "../components/FixedTrace";
import type {AutoroutingPhase,Board,Port} from "tscircuit";
import {applyToPoint,compose,inverse,translate} from "transformation-matrix";
import terminals from "../manufacturing/power-distribution/terminals.json";
import capEscapes from "../manufacturing/power-distribution/cap-escapes.json";
import bgaEscapes from "../manufacturing/power-distribution/bga-escapes.json";
import bgaCopper from "../manufacturing/power-distribution/bga-copper.json";

// Explicit pad contacts on the fixed, top-only placement. The layout audit
// rejects placement drift and verifies actual copper to every terminal.
export const powerDistributionLayers={VCCL:"inner2",VDD:"inner3"} as const;
export const powerDistributionOutline=[
  // Reserve the west-side L3 corridor for the parallel 12 V slot feed.
  // The bridge and its bypass banks retain the broad central VCCL region.
  {x:5.675,y:78.4},{x:46,y:78.4},{x:46,y:114},{x:.5,y:114},
  {x:.5,y:106.775},{x:5.675,y:106.775},
];
// The L4 slot-power bypass runs west of SBU2 and around the CC1 escape.
// Keep its clearance corridor out of VDD; L3 retains the upper VDD paths.
// Reserve a local widening around the REFCLK/CC1 via clearances so the
// adjacent SLOT_12V feed retains its continuous 0.381 mm copper core.
const vddOutline=[{x:26.3,y:70},{x:46,y:70},{x:46,y:87.775},
  {x:32.375,y:87.775},{x:32.375,y:102.775},{x:30.675,y:102.775},
  {x:30.675,y:102.925},{x:30.225,y:102.925},{x:30.225,y:105.275},
  {x:30.675,y:105.275},
  {x:30.675,y:106.975},{x:46,y:106.975},{x:46,y:114},{x:18,y:114},
  {x:18,y:98.5},{x:27.1,y:98.5},{x:27.1,y:96.95},{x:25.4,y:96.95},{x:25.4,y:93.3},{x:26.3,y:93.3}];
const vcclParallelOutline=[{x:.5,y:70},{x:26,y:70},{x:26,y:93},
  {x:25.1,y:93},{x:25.1,y:97.25},{x:26.8,y:97.25},{x:26.8,y:98.2},{x:.5,y:98.2}];
// Reach both bridge supply clusters on L3. The southern edge stops before
// the VCCL columns; continuity and both rail drops are checked after refill.
const vddParallelOutline=[{x:29.5,y:70},{x:46,y:70},{x:46,y:93},
  {x:31,y:93},{x:31,y:96.95},{x:25.25,y:96.95},{x:25.25,y:83.5},
  {x:29.5,y:83.5}];
// A third feed on top joins the existing output lands and VDD contacts.
// Leave room around signal traces; native pours cut the actual clearances.
const vddSurfaceOutline=[{x:26.3,y:80.95},{x:42,y:80.95},{x:42,y:92.4},
  {x:31,y:92.4},{x:31,y:96.5},{x:26.3,y:96.5}];
const vddBgaSurfaceOutline=[{x:26,y:93.9500074},{x:31.1,y:93.9500074},
  {x:31.1,y:100.2000074},{x:26,y:100.2000074}];
const paths=[...capEscapes,...bgaEscapes];
const tapered=paths.filter(p=>new Set(p.route.map(q=>q.width)).size>1);

// Render before the existing pours so their copper keeps priority. The
// native solver fills only the remaining space around the fixed layout.
export function PowerDistributionSurfaceCopper(){return <><copperpour
  name="PDN_VDD_SURFACE" connectsTo="net.VDD" layer="top"
  outline={vddSurfaceOutline} clearance={.205} padMargin={.205} traceMargin={.4}
  boardEdgeMargin={0} cutoutMargin={.215} useThermalReliefs={false} coveredWithSolderMask/>
  {/* Join the central supply lands through every available top contact.
      Existing BGA copper and pads retain priority over this added fill. */}
  <copperpour name="PDN_VDD_BGA_FILL" connectsTo="net.VDD" layer="top"
    outline={vddBgaSurfaceOutline} clearance={.2} padMargin={.15} traceMargin={.2}
    boardEdgeMargin={0} useThermalReliefs={false} coveredWithSolderMask/></>}

export function PowerDistribution(){return <>
  <autoroutingphase name="PDN_CONTACTS" phaseIndex={8} minTraceWidth={.1} pcbTracePaths={[]}/>
  {paths.map(p=>{
    const to=("toSelector" in p ? p.toSelector as string : undefined) ?? `${terminals.find(t=>t.name===p.name)?.viaOwner??p.name}.top`;
    return <Fragment key={p.name}>{tapered.some(q=>q.name===p.name)
      ? <trace name={`${p.name}_TRACE`} from={p.selector} to={to} routingPhaseIndex={8} width={p.route[0]!.width} maxViaCount={0}/>
      : <FixedTrace name={`${p.name}_TRACE`} from={p.selector} to={to} width={p.route[0]!.width}
          exactPadContacts={"exactPadContacts" in p && p.exactPadContacts===true}
          points={("exactPadContacts" in p && p.exactPadContacts===true ? p.route : p.route.slice(1,-1)).map(q=>[q.x,q.y])}/>}</Fragment>;
  })}
  {Object.entries(powerDistributionLayers).map(([rail,layer])=><Fragment key={rail}>
    <copperpour name={`PDN_${rail}_${layer}`} connectsTo={`net.${rail}`} layer={layer}
      outline={rail==="VDD"?vddOutline:powerDistributionOutline} clearance={.205} padMargin={.205}
      traceMargin={layer==="inner3"?.26:.225} boardEdgeMargin={0} cutoutMargin={.215} useThermalReliefs={false}/>
  </Fragment>)}
  <copperpour name="PDN_VCCL_PARALLEL" connectsTo="net.VCCL" layer="inner3"
    outline={vcclParallelOutline} clearance={.205} padMargin={.205} traceMargin={.26}
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
  for(const p of tapered){
    const trace=db.source_trace.list().find(t=>t.name===`${p.name}_TRACE`);
    if(!trace||trace.connected_source_port_ids.length!==2)throw Error(`Invalid PDN contact ${p.name}`);
    trace.connected_source_net_ids=[];
  }
  phase._parsedProps.pcbTracePaths=tapered.map(p=>{
    const port=board.selectOne(p.selector,{type:"port"}) as Port|null;
    if(!port)throw Error(`Missing PDN contact ${p.selector}`);
    const before=port._getGlobalPcbPositionBeforeLayout(),after=port._getGlobalPcbPositionAfterLayout();
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    return {connection:p.selector,route:p.route.map(q=>({...q,...applyToPoint(transform,q)}))};
  }) as typeof phase._parsedProps.pcbTracePaths;
}
