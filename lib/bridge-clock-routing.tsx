import {Fragment} from "react";
import type {AutoroutingPhase, Board, Port} from "tscircuit";
import type {FanoutTracePath} from "@tscircuit/props";
import {applyToPoint, compose, inverse, translate} from "transformation-matrix";
import {offsetPairCenterline} from "./pcie-tx-routing";
import {traceWidthsMm} from "./trace-width-rules";
import stackup from "../manufacturing/stackup/JLC06161H-3313.json";

type Point={x:number;y:number};
type Route=FanoutTracePath["route"];
const width=traceWidthsMm.surfaceDifferential85,gap=stackup.impedanceProfiles[0].calculatedPairGapMm;
const hp=(width+gap)/2,k=Math.SQRT2-1;
export const bridgeClockRules={width,gap,neckWidth:.0762,crystalMaxLength:12.7,
  refclkMaxLength:177.8,refclkMaxSkew:.127,viaDiameter:.3,viaHole:.2} as const;
export const bridgeClockConnections=[
  {name:"CLOCK_XI_BRIDGE",from:"ASM2464PDX.XI",to:"C1.pin1"},
  {name:"CLOCK_XO_BRIDGE",from:"ASM2464PDX.XO",to:"C1.pin2"},
  {name:"CLOCK_XI_XTAL",from:"C1.pin1",to:"XCLK.pin1"},
  {name:"CLOCK_XO_XTAL",from:"C1.pin2",to:"XCLK.pin3"},
  {name:"CLOCK_REFCLK_P_PHY",from:"ASM2464PDX.REFCLK_P0",to:"R_PCIE_REFCLK_P.pin1"},
  {name:"CLOCK_REFCLK_N_PHY",from:"ASM2464PDX.REFCLK_N0",to:"R_PCIE_REFCLK_N.pin1"},
  {name:"CLOCK_REFCLK_P_CON",from:"R_PCIE_REFCLK_P.pin2",to:"PCIe.REFCLK_P"},
  {name:"CLOCK_REFCLK_N_CON",from:"R_PCIE_REFCLK_N.pin2",to:"PCIe.REFCLK_N"},
] as const;
export const bridgeClockReturns=[
  {x:29.3,y:103.3},{x:30.4,y:103.2},
  {x:15.55,y:102},{x:17.85,y:102},
  // Filled/capped vias directly ground the two crystal metal-cover lands.
  {x:35.15,y:105.9},{x:36.85,y:108.1},
] as const;
const w=(p:Point,layer:"top"|"bottom"="top",localWidth=width)=>
  ({route_type:"wire" as const,...p,width:localWidth,layer});
const v=(p:Point,from:"top"|"bottom",to:"top"|"bottom")=>
  ({route_type:"via" as const,...p,from_layer:from,to_layer:to,
    via_diameter:bridgeClockRules.viaDiameter,via_hole_diameter:bridgeClockRules.viaHole});
const reverse=(r:Route):Route=>[...r].reverse().map(p=>p.route_type==="via"
  ?{...p,from_layer:p.to_layer,to_layer:p.from_layer}:p);
export const clockCopperLength=(r:Route)=>r.reduce((s,a,i)=>{
  const b=r[i+1];return s+(a.route_type==="wire"&&b?.route_type==="wire"&&a.layer===b.layer
    ?Math.hypot(Number(a.x)-Number(b.x),Number(a.y)-Number(b.y)):0);
},0);

export function BridgeClockRouting(){return <>
  <autoroutingphase name="BRIDGE_CLOCKS" phaseIndex={4} minTraceWidth={bridgeClockRules.neckWidth}
    connections={["ASM2464PDX.XI","ASM2464PDX.XO","XCLK.pin1","XCLK.pin3",
      "ASM2464PDX.REFCLK_P0","ASM2464PDX.REFCLK_N0","PCIe.REFCLK_P","PCIe.REFCLK_N"]} pcbTracePaths={[]}/>
  {bridgeClockConnections.map(c=><Fragment key={c.name}><trace {...c} routingPhaseIndex={4} width={width} maxViaCount={c.name.endsWith("_PHY")?2:0}/></Fragment>)}
  {/* Netlabel taps create multiple SRJ connections per clock net, which the
      native differentialpair metadata cannot represent. Saved constant-offset
      paths supply the geometry; independent emitted-copper checks enforce it. */}
  {bridgeClockReturns.map((p,i)=><Fragment key={i}><via name={`CLOCK_GND_RETURN_${i}`} pcbX={p.x} pcbY={p.y}
    fromLayer="top" toLayer="bottom" holeDiameter={.2} outerDiameter={.3} connectsTo="net.GND"/></Fragment>)}
</>}

// Authored native saved paths. Centerline offsets preserve coupled geometry;
// the BGA necks, component lands and via flares are explicit launch regions.
// This module performs no obstacle search or custom autorouting.
export function prepareBridgeClockRouting(board:Board,phase:AutoroutingPhase){
  const port=(s:string)=>{const p=board.selectOne(s,{type:"port"}) as Port|null;if(!p)throw Error(`Missing clock port ${s}`);return p};
  const pos=(s:string)=>port(s)._getGlobalPcbPositionAfterLayout();
  const paths:FanoutTracePath[]=[];
  const add=(connection:string,route:Route)=>{
    const p=port(connection),before=p._getGlobalPcbPositionBeforeLayout(),after=pos(connection);
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    paths.push({connection,route:route.map(p=>({...p,...applyToPoint(transform,{x:Number(p.x),y:Number(p.y)})}))});
  };
  const xi=pos("ASM2464PDX.XI"),xo=pos("ASM2464PDX.XO");
  const ci=pos("C1.pin1"),co=pos("C1.pin2"),cMid=(ci.x+co.x)/2;
  const incoming=[{x:33,y:103.7},{x:33,y:104.6}];
  const xiStart=offsetPairCenterline(incoming,hp)[0];
  const xoStart=offsetPairCenterline(incoming,-hp)[0];
  const xiTop=[w(xi),w({x:xi.x,y:xiStart.y-xiStart.x+xi.x}),w(xiStart)];
  const xoNeck={x:xo.x+.23,y:102.35};
  const xoTop=[w(xo,"top",.0762),w({x:xo.x+.23,y:xo.y+.23},"top",.0762),
    w(xoNeck,"top",.0762),w(xoNeck),w({x:xoStart.x,y:102.35+xoStart.x-xoNeck.x}),w(xoStart)];
  for(const i of [0,1]){
    const cap=i===0?ci:co,pair=offsetPairCenterline(incoming,i===0?hp:-hp),last=pair[pair.length-1];
    add(i===0?"ASM2464PDX.XI":"ASM2464PDX.XO",[...(i===0?xiTop:xoTop),...pair.map(p=>w(p)),
      w({x:cap.x,y:last.y+Math.abs(cap.x-last.x)}),w(cap)]);
  }
  const crystalLine=[{x:cMid,y:106.4},{x:cMid,y:106.5},{x:cMid+.4,y:106.9},{x:33.7,y:106.9}];
  for(const [i,pin] of ["pin1","pin3"].entries()){
    const cap=i===0?ci:co,end=pos(`XCLK.${pin}`),points=offsetPairCenterline(crystalLine,i===0?hp:-hp);
    const start=points[0],last=points[points.length-1];
    const flare=[{x:end.x-Math.abs(end.y-last.y),y:last.y},end];
    const departure={x:cap.x,y:cap.y+.65};
    const route:Route=[w(cap),w(departure),
      w({x:start.x,y:departure.y+Math.abs(start.x-departure.x)}),...points.map(p=>w(p)),
      ...flare.map(p=>w(p))];
    // The crystal port selects one unique source trace; C1 has two branches.
    add(`XCLK.${pin}`,reverse(route));
  }
  const rp=pos("ASM2464PDX.REFCLK_P0"),rn=pos("ASM2464PDX.REFCLK_N0");
  const midX=30.2,bridgeViaY=103.65;
  const refLine=[{x:midX,y:104.3},{x:midX,y:104.4},{x:midX-.4,y:104.8},
    {x:17.3,y:104.8},{x:16.7,y:104.2},{x:16.7,y:102.2}];
  const slots=[pos("PCIe.REFCLK_P"),pos("PCIe.REFCLK_N")],cy=(slots[0].y+slots[1].y)/2;
  const rIn=[pos("R_PCIE_REFCLK_P.pin1"),pos("R_PCIE_REFCLK_N.pin1")];
  const rOut=[pos("R_PCIE_REFCLK_P.pin2"),pos("R_PCIE_REFCLK_N.pin2")];
  const outX=(rOut[0].x+rOut[1].x)/2,joinY=100.45-(rOut[1].x-rOut[0].x)/2+hp;
  const outLine=[{x:outX,y:joinY},{x:outX,y:cy+.3},{x:outX-.3,y:cy},{x:15.7,y:cy}];
  const con=[0,1].map(i=>{
    const pair=offsetPairCenterline(outLine,i===0?-hp:hp),last=pair[pair.length-1];
    return [w(rOut[i]),w({x:rOut[i].x,y:100.45}),...pair.map(p=>w(p)),
      w({x:last.x-Math.abs(slots[i].y-last.y),y:slots[i].y}),w(slots[i])];
  });
  const phy=(i:number,extraP:number):Route=>{
    const p=i===0?rp:rn,pair=offsetPairCenterline(refLine,i===0?-hp:hp);
    const start=pair[0],last=pair[pair.length-1];
    const bv={x:i===0?30.8:29.9,y:bridgeViaY};
    const neckX=rn.x-.23,neck={x:neckX,y:102.35};
    const top=i===0?[w(p),w({x:p.x,y:102.4}),w({x:p.x+extraP,y:102.4+extraP}),
      w({x:p.x+extraP,y:103.3-extraP}),w({x:bv.x,y:103.3+p.x-bv.x}),w(bv)]
      :[w(p,"top",.0762),w({x:neckX,y:p.y+.23},"top",.0762),w(neck,"top",.0762),w(neck),
        w({x:neckX,y:102.4}),w({x:bv.x,y:102.4+neckX-bv.x}),w(bv)];
    return [...top,v(bv,"top","bottom"),w(bv,"bottom"),
      w({x:bv.x,y:start.y-Math.abs(start.x-bv.x)},"bottom"),...pair.map(p=>w(p,"bottom")),
      w({x:rIn[i].x,y:last.y-Math.abs(rIn[i].x-last.x)},"bottom"),w(rIn[i],"bottom"),
      v(rIn[i],"bottom","top"),w(rIn[i])];
  };
  // A short 45-degree P launch excursion adds 2*(sqrt(2)-1)*dx. Balance
  // the complete channel here, without a separated single-trace tuning loop.
  const extraP=(clockCopperLength(phy(1,0))+clockCopperLength(con[1])
    -clockCopperLength(phy(0,0))-clockCopperLength(con[0]))/(2*k);
  if(extraP<0||extraP>.45)throw Error(`Clock escape adjustment outside reserved launch: ${extraP}`);
  for(const i of [0,1]){
    add(`ASM2464PDX.REFCLK_${i===0?"P":"N"}0`,phy(i,extraP));
    add(`PCIe.REFCLK_${i===0?"P":"N"}`,reverse(con[i]));
  }
  phase._parsedProps.pcbTracePaths=paths as typeof phase._parsedProps.pcbTracePaths;
}
