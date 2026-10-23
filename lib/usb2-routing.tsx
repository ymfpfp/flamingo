import {Fragment} from "react";
import type {AutoroutingPhase, Board, Port} from "tscircuit";
import type {FanoutTracePath} from "@tscircuit/props";
import {applyToPoint, compose, inverse, translate} from "transformation-matrix";
import {offsetPairCenterline} from "./pcie-tx-routing";
import {traceWidthsMm} from "./trace-width-rules";
import stackup from "../manufacturing/stackup/selected.json";

export const usb2Rules={width:traceWidthsMm.surfaceDifferential85,
  gap:stackup.impedanceProfiles[0].calculatedPairGapMm,maxSkew:0.5,maxLength:101.6,maxVias:4};
type Point={x:number;y:number};
const w=(p:Point,layer:"top"|"bottom"="top")=>({route_type:"wire" as const,...p,width:usb2Rules.width,layer});
const v=(p:Point,from:"top"|"bottom",to:"top"|"bottom",bga=false)=>({route_type:"via" as const,...p,
  from_layer:from,to_layer:to,via_diameter:bga?.25:.3,via_hole_diameter:bga?.15:.2});
const reverse=(route:FanoutTracePath["route"])=>[...route].reverse().map(p=>p.route_type==="via"
  ?{...p,from_layer:p.to_layer,to_layer:p.from_layer}:p);
const connections=[
  {name:"USB2_P_TRUNK",from:"ASM2464PDX.UDP",to:"USBC.A6"},
  {name:"USB2_N_TRUNK",from:"ASM2464PDX.UDM",to:"USBC.A7"},
  {name:"USB2_P_RECEPTACLE",from:"USBC.A6",to:"USBC.B6"},
  {name:"USB2_N_RECEPTACLE",from:"USBC.A7",to:"USBC.B7"},
] as const;
export function Usb2Routing(){return <>
  <autoroutingphase name="USB2_FIXED" phaseIndex={3} minTraceWidth={usb2Rules.width} pcbTracePaths={[]}/>
  {connections.map(c=><Fragment key={c.name}><trace {...c} routingPhaseIndex={3} width={usb2Rules.width}/></Fragment>)}
  {/* Native differentialpair metadata cannot represent two tied USB-C rows.
      The saved paired paths and emitted-copper audit enforce USB2 geometry. */}
  {/* These returns contact both ground planes. The former fourth stitching
      via at (47.4,98.75) was isolated inside the connector copper keepout. */}
  {[{x:41.8,y:98.1,i:1},{x:43.9,y:98.1,i:2}].map((p)=><Fragment key={p.i}>
    <via name={`USB2_GND_RETURN_${p.i}`} pcbX={p.x} pcbY={p.y} fromLayer="top" toLayer="bottom"
      holeDiameter={p.i===2?.15:.2} outerDiameter={p.i===2?.25:.3} connectsTo="net.GND"/>
  </Fragment>)}
</>}

// Authored constant-offset native paths. No custom path search is used.
export function prepareUsb2Routing(board:Board,phase:AutoroutingPhase){
  const port=(s:string)=>{const p=board.selectOne(s,{type:"port"}) as Port|null;if(!p)throw Error(`Missing USB2 port ${s}`);return p};
  const pos=(s:string)=>port(s)._getGlobalPcbPositionAfterLayout();
  const paths:FanoutTracePath[]=[];
  const add=(name:string,selector:string,route:FanoutTracePath["route"])=>{
    const p=port(selector),before=p._getGlobalPcbPositionBeforeLayout(),after=pos(selector);
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    paths.push({connection:selector,route:route.map(p=>({...p,...applyToPoint(transform,{x:Number(p.x),y:Number(p.y)})}))});
  };
  const hp=(usb2Rules.width+usb2Rules.gap)/2;
  const cy=(pos("USBC.A6").y+pos("USBC.A7").y)/2;
  for(const pol of ["P","N"] as const){
    const selector=pol==="P"?"ASM2464PDX.UDP":"ASM2464PDX.UDM";
    const b=pos(selector),mate=pos(pol==="P"?"ASM2464PDX.UDM":"ASM2464PDX.UDP"),inner=pol==="N",sign=inner?1:-1;
    const h=(Math.abs(b.x-mate.x)+2*hp*(Math.SQRT2-1)+.1*(2-Math.SQRT2))/Math.SQRT2;
    const via={x:34.8,y:b.y-h},join={x:35.4,y:b.y+sign*hp};
    const escape=inner?[w(b),v(b,"top","bottom",true),w(b,"bottom"),w({x:b.x+hp,y:b.y+hp},"bottom"),w(join,"bottom")]
      :[w(b),w({x:via.x-.1,y:b.y}),w({x:via.x,y:b.y-.1}),w(via),v(via,"top","bottom",true),w(via,"bottom"),w({x:via.x+h-hp,y:join.y},"bottom"),w(join,"bottom")];
    const line=[{x:35.4,y:b.y},{x:35.5,y:b.y},{x:38.96,y:94.4},{x:41.8,y:94.4},
      {x:42.6,y:95.2},{x:42.6,y:97.91175}];
    const endVia={x:42.6-sign*.3,y:98.1};
    const topLine=[{x:42.6,y:98.28825},{x:42.6,y:cy-.3},{x:42.9,y:cy},{x:44,y:cy}];
    const end=pos(pol==="P"?"USBC.A6":"USBC.A7");
    const top=offsetPairCenterline(topLine,sign*hp);
    add(`USB2_${pol}_TRUNK`,selector,[...escape,...offsetPairCenterline(line,sign*hp).slice(1).map(p=>w(p,"bottom")),
      w(endVia,"bottom"),v(endVia,"bottom","top"),w(endVia),...top.map(p=>w(p)),
      w({x:44+Math.abs(end.y-top[top.length-1].y),y:end.y}),w(end)]);
  }
  const aP=pos("USBC.A6"),bP=pos("USBC.B6"),aN=pos("USBC.A7"),bN=pos("USBC.B7");
  const pVia={x:45.75,y:99.2};
  add("USB2_P_RECEPTACLE","USBC.B6",reverse([w(aP),w({x:45.4,y:aP.y}),w({x:pVia.x,y:aP.y+pVia.x-45.4}),w(pVia),
    v(pVia,"top","bottom"),w(pVia,"bottom"),w({x:bP.x-(pVia.y-bP.y),y:pVia.y},"bottom"),w(bP,"bottom"),v(bP,"bottom","top"),w(bP)]));
  add("USB2_N_RECEPTACLE","USBC.B7",reverse([w(aN),v(aN,"top","bottom"),w(aN,"bottom"),
    w({x:aN.x+aN.y-bN.y,y:bN.y},"bottom"),w(bN,"bottom"),v(bN,"bottom","top"),w(bN)]));
  phase._parsedProps.pcbTracePaths=paths as typeof phase._parsedProps.pcbTracePaths;
}
