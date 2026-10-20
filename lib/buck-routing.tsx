import {Fragment} from "react";
import type {AutoroutingPhase, Board, Port} from "tscircuit";
import type {FanoutTracePath} from "@tscircuit/props";
import {applyToPoint, compose, inverse, translate} from "transformation-matrix";

type Point={x:number;y:number};
type Route=FanoutTracePath["route"];
export const buckRails=["VCCL","VDD"] as const;
export const buckRules={senseWidth:.15,logicWidth:.25,groundWidth:.55,
  switchNeckWidth:.5,switchWidth:1.2,inputWidth:.9,outputWidth:2,
  viaHole:.2,viaDiameter:.4,loadEnvelopeA:3} as const;
const centers={VCCL:{x:26.220002,y:75.564},VDD:{x:35.820002,y:76.764}};
const grounded=[
  {suffix:"IC",part:(r:string)=>`${r}_BUCK.GND`,x:-1.6,y:-.45,width:.55},
  {suffix:"HF",part:(r:string)=>`C_${r}_HF.pin2`,x:-1.15,y:-1.864,width:.4},
  {suffix:"CIN",part:(r:string)=>`C_${r}_CIN.pin2`,x:-3.3,y:-3.564,width:1},
  {suffix:"COUT",part:(r:string)=>`C_${r}_COUT.pin2`,x:-4.2,y:.6,width:1},
  {suffix:"FBB",part:(r:string)=>`R_${r}_FBB.pin2`,x:3.83,y:3.286,width:.25},
  {suffix:"MODE",part:(r:string)=>`R_${r}_MODE.pin2`,x:3.95,y:-1.517184,width:.25},
  {suffix:"COUT_B",part:(r:string)=>`C_${r}_COUT_B.pin2`,x:2.2,y:6.7,width:.6},
] as const;
type Connection={name:string;from:string;to:string;select:string;phase:5|6|7|10;width:number;maxVias:number};
export const buckConnections:Connection[]=buckRails.flatMap(r=>[
  {name:`BUCK_${r}_SW`,from:`${r}_BUCK.SW`,to:`L_${r}.pin1`,select:`${r}_BUCK.SW`,phase:5,width:.5,maxVias:0},
  {name:`BUCK_${r}_VIN`,from:`${r}_BUCK.VIN`,to:`C_${r}_HF.pin1`,select:`${r}_BUCK.VIN`,phase:5,width:.5,maxVias:0},
  {name:`BUCK_${r}_INPUT_BULK`,from:`C_${r}_CIN.pin1`,to:`C_${r}_HF.pin1`,select:`C_${r}_CIN.pin1`,phase:5,width:1,maxVias:0},
  {name:`BUCK_${r}_OUTPUT_A`,from:`L_${r}.pin2`,to:`C_${r}_COUT.pin1`,select:`C_${r}_COUT.pin1`,phase:5,width:2,maxVias:0},
  {name:`BUCK_${r}_OUTPUT_B`,from:`L_${r}.pin2`,to:`C_${r}_COUT_B.pin1`,select:`C_${r}_COUT_B.pin1`,phase:5,width:2,maxVias:0},
  {name:`BUCK_${r}_MODE`,from:`${r}_BUCK.MODE`,to:`R_${r}_MODE.pin1`,select:`${r}_BUCK.MODE`,phase:5,width:.25,maxVias:0},
  {name:`BUCK_${r}_VOS`,from:`${r}_BUCK.VOS`,to:`C_${r}_COUT.pin1`,select:`${r}_BUCK.VOS`,phase:6,width:.15,maxVias:0},
  {name:`BUCK_${r}_FB_SENSE`,from:`R_${r}_FBT.pin1`,to:`C_${r}_COUT_B.pin1`,select:`R_${r}_FBT.pin1`,phase:6,width:.15,maxVias:0},
  {name:`BUCK_${r}_FB_INPUT`,from:`${r}_BUCK.FB`,to:`R_${r}_FBT.pin2`,select:`${r}_BUCK.FB`,phase:6,width:.15,maxVias:0},
  {name:`BUCK_${r}_FB_DIVIDER`,from:`R_${r}_FBB.pin1`,to:`R_${r}_FBT.pin2`,select:`R_${r}_FBB.pin1`,phase:6,width:.15,maxVias:0},
  {name:`BUCK_${r}_EN_ESCAPE`,from:`${r}_BUCK.EN`,to:`BUCK_EN_${r}.top`,select:`${r}_BUCK.EN`,phase:5,width:.25,maxVias:0},
  ...grounded.map(g=>({name:`BUCK_${r}_GND_${g.suffix}`,from:g.part(r),to:`BUCK_GND_${r}_${g.suffix}.top`,
    select:`BUCK_GND_${r}_${g.suffix}.top`,phase:5 as const,width:g.width,maxVias:0})),
]);
buckConnections.push(
  {name:"BUCK_ENABLE_LINK",from:"BUCK_EN_VCCL.bottom",to:"BUCK_EN_VDD.bottom",select:"BUCK_EN_VCCL.bottom",phase:6,width:.25,maxVias:0},
  {name:"BUCK_ENABLE_TRUNK",from:"U_BUCK_EN.N_RESET",to:"BUCK_EN_VDD.bottom",select:"U_BUCK_EN.N_RESET",phase:6,width:.25,maxVias:1},
  {name:"BUCK_ENABLE_PULLUP",from:"R_BUCK_EN_PU.pin2",to:"U_BUCK_EN.N_RESET",select:"R_BUCK_EN_PU.pin2",phase:7,width:.25,maxVias:0},
  {name:"BUCK_MONITOR_DIVIDER",from:"R_BUCK_EN_BOTTOM.pin1",to:"R_BUCK_EN_TOP.pin2",select:"R_BUCK_EN_BOTTOM.pin1",phase:10,width:.15,maxVias:0},
  {name:"BUCK_MONITOR_SENSE",from:"U_BUCK_EN.SENSE",to:"R_BUCK_EN_TOP.pin2",select:"U_BUCK_EN.SENSE",phase:10,width:.15,maxVias:0},
);
const groundOutlines={
  MAIN:[[-5,-4.8],[4.6,-4.8],[4.6,-1],[1,-1],[1,-.9],[-.5,-.9],[-.5,1.4],[-5,1.4]],
  FB:[[2.6,2],[4.4,2],[4.4,3.8],[2.6,3.8]],
  OUTPUT:[[1.9,5.9],[4.7,5.9],[4.7,7.5],[1.9,7.5]],
};
const vinOutline=[[.1,-4.8],[2.5,-4.8],[2.5,-1],[.1,-1]];
const outputOutline=[[-4.2,1.8],[-2.4,1.8],[-2.4,3.1],[-1.1,3.9],[4.2,3.9],[4.2,5.5],[-1.6,5.5],[-4.2,3.4]];
const extraGround=[[-2.2,-.45],[-1.6,.2],[-2.2,.2],[-3.9,-3.564],[-3.3,-4.2],[-4.5,0]];

export function BuckRouting(){return <>
  <autoroutingphase name="BUCK_POWER" phaseIndex={5} minTraceWidth={.15} pcbTracePaths={[]}/>
  <autoroutingphase name="BUCK_SENSE" phaseIndex={6} minTraceWidth={.15} pcbTracePaths={[]}/>
  {buckConnections.filter(c=>c.phase!==7&&c.phase!==10).map(c=><Fragment key={c.name}><trace name={c.name} from={c.from} to={c.to}
    routingPhaseIndex={c.phase} width={c.width} maxViaCount={c.maxVias}/></Fragment>)}
  {buckRails.map(r=>{
    const center=centers[r],outline=(points:number[][])=>points.map(([x,y])=>({x:x+center.x,y:y+center.y}));
    return <Fragment key={r}>
      {grounded.map(g=><Fragment key={g.suffix}><via name={`BUCK_GND_${r}_${g.suffix}`}
        pcbX={center.x+g.x} pcbY={center.y+g.y} connectsTo={g.part(r)}
        fromLayer="top" toLayer="bottom" holeDiameter={.2} outerDiameter={.4}/></Fragment>)}
      {extraGround.map(([x,y],i)=><Fragment key={i}><via name={`BUCK_GND_${r}_THERMAL_${i}`}
        pcbX={center.x+x} pcbY={center.y+y} connectsTo="net.GND"
        fromLayer="top" toLayer="bottom" holeDiameter={.2} outerDiameter={.4}/></Fragment>)}
      <via name={`BUCK_EN_${r}`} pcbX={center.x-.424942} pcbY={center.y-1.2}
        connectsTo={`${r}_BUCK.EN`} fromLayer="top" toLayer="bottom" holeDiameter={.2} outerDiameter={.4}/>
      {Object.entries(groundOutlines).map(([name,points])=><Fragment key={name}><copperpour
        name={`BUCK_${r}_GND_${name}`} connectsTo="net.GND" layer="top" outline={outline(points)}
        clearance={.25} padMargin={.25} traceMargin={.25} useThermalReliefs={false}/></Fragment>)}
      <copperpour name={`BUCK_${r}_VIN_COPPER`} connectsTo="net.V5V" layer="top" outline={outline(vinOutline)}
        clearance={.25} padMargin={.25} traceMargin={.25} useThermalReliefs={false}/>
      <copperpour name={`BUCK_${r}_OUTPUT_COPPER`} connectsTo={`net.${r}`} layer="top" outline={outline(outputOutline)}
        clearance={.25} padMargin={.25} traceMargin={.25} useThermalReliefs={false}/>
    </Fragment>;
  })}
</>}

// Native saved paths use authored local geometry, with explicit power widths.
// No path search, obstacle search or custom autorouter is implemented here.
export function prepareBuckRouting(board:Board,phase:AutoroutingPhase){
  const port=(selector:string)=>{const p=board.selectOne(selector,{type:"port"}) as Port|null;
    if(!p)throw Error(`Missing buck port ${selector}`);return p;};
  const pos=(s:string)=>port(s)._getGlobalPcbPositionAfterLayout();
  const routes=new Map<string,Route>();
  const wire=(p:Point,width:number,layer:"top"|"bottom"="top")=>({route_type:"wire" as const,...p,width,layer});
  for(const r of buckRails){
    const center=pos(`${r}_BUCK.SW`),c={x:center.x+.424942,y:center.y-.625094};
    const p=(x:number,y:number)=>({x:c.x+x,y:c.y+y});
    const w=(x:number,y:number,width:number)=>wire(p(x,y),width);
    const end=(s:string,width:number)=>wire(pos(s),width);
    const set=(suffix:string,route:Route)=>routes.set(`BUCK_${r}_${suffix}`,route);
    // Coincident contacts keep width changes beyond the adjacent IC lands.
    set("SW",[end(`${r}_BUCK.SW`,.5),w(-.424942,1.5,.5),w(-.424942,1.5,.8),
      w(0,1.924942,.8),w(0,1.924942,1.2),end(`L_${r}.pin1`,1.2)]);
    set("VIN",[end(`${r}_BUCK.VIN`,.5),w(.07493,-.95,.5),w(.420116,-1.295186,.5),
      w(.420116,-1.295186,.9),end(`C_${r}_HF.pin1`,.9)]);
    set("INPUT_BULK",[end(`C_${r}_CIN.pin1`,1),w(1.1676,-2.8,1),w(1.1676,-2.8,.7),
      w(.420116,-2.052516,.7),end(`C_${r}_HF.pin1`,.7)]);
    set("OUTPUT_A",[end(`C_${r}_COUT.pin1`,2),w(-3.3,3,2),w(-1.61509,4.68491,2),end(`L_${r}.pin2`,2)]);
    set("OUTPUT_B",[end(`C_${r}_COUT_B.pin1`,2),w(3.28491,4.68491,2),end(`L_${r}.pin2`,2)]);
    set("MODE",[end(`${r}_BUCK.MODE`,.25),w(1.4,-.500126,.25),w(3.28269,-2.382816,.25),end(`R_${r}_MODE.pin1`,.25)]);
    set("VOS",[end(`${r}_BUCK.VOS`,.15),w(-1.45,.625094,.15),w(-3.3,2.475094,.15),end(`C_${r}_COUT.pin1`,.15)]);
    set("FB_SENSE",[end(`R_${r}_FBT.pin1`,.15),w(4.532816,2.3,.15),w(4.7,2.3,.15),w(4.7,4.7,.15),end(`C_${r}_COUT_B.pin1`,.15)]);
    set("FB_INPUT",[end(`${r}_BUCK.FB`,.15),w(1.4,.499872,.15),w(2.400128,1.5,.15),end(`R_${r}_FBT.pin2`,.15)]);
    set("FB_DIVIDER",[end(`R_${r}_FBB.pin1`,.15),end(`R_${r}_FBT.pin2`,.15)]);
    set("EN_ESCAPE",[end(`${r}_BUCK.EN`,.25),end(`BUCK_EN_${r}.top`,.25)]);
    for(const g of grounded){
      const start=pos(g.part(r)),finish=pos(`BUCK_GND_${r}_${g.suffix}.top`);
      let points:Point[]=[start,finish];
      if(g.suffix==="FBB")points=[start,{x:finish.x,y:start.y+Math.abs(finish.x-start.x)},finish];
      set(`GND_${g.suffix}`,points.reverse().map(q=>wire(q,g.width)));
    }
  }
  const a=pos("BUCK_EN_VCCL.bottom"),b=pos("BUCK_EN_VDD.bottom");
  routes.set("BUCK_ENABLE_LINK",[wire(a,.25,"bottom"),wire({x:a.x,y:71},.25,"bottom"),
    wire({x:b.x,y:71},.25,"bottom"),wire(b,.25,"bottom")]);
  const reset=pos("U_BUCK_EN.N_RESET"),via={x:38.5,y:65.8};
  routes.set("BUCK_ENABLE_TRUNK",[wire(reset,.25),wire({x:38.25,y:reset.y},.25),wire({x:via.x,y:reset.y+.25},.25),wire(via,.25),
    {route_type:"via",...via,from_layer:"top",to_layer:"bottom",via_diameter:.4,via_hole_diameter:.2},
    wire(via,.25,"bottom"),wire({x:via.x,y:70.7},.25,"bottom"),wire({x:35.6,y:73.6},.25,"bottom"),
    wire({x:b.x,y:73.6},.25,"bottom"),wire(b,.25,"bottom")]);
  routes.set("BUCK_ENABLE_PULLUP",[wire(pos("R_BUCK_EN_PU.pin2"),.25),wire(reset,.25)]);
  const sense=pos("U_BUCK_EN.SENSE"),divider=pos("R_BUCK_EN_TOP.pin2");
  routes.set("BUCK_MONITOR_DIVIDER",[wire(pos("R_BUCK_EN_BOTTOM.pin1"),.15),wire(divider,.15)]);
  // A short top-layer detour clears the existing supervisor ground via.
  // Keep the high-impedance measurement away from the buck switching loops.
  const senseY=sense.y+.3;
  routes.set("BUCK_MONITOR_SENSE",[wire(sense,.15),wire({x:sense.x-.288977,y:sense.y},.15),
    wire({x:sense.x-.588977,y:senseY},.15),wire({x:divider.x+senseY-divider.y,y:senseY},.15),wire(divider,.15)]);
  phase._parsedProps.pcbTracePaths=buckConnections.filter(c=>c.phase===phase.props.phaseIndex).map(c=>{
    const at=port(c.select),before=at._getGlobalPcbPositionBeforeLayout(),after=pos(c.select);
    const transform=inverse(compose(translate(after.x-before.x,after.y-before.y),phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    const route=routes.get(c.name);if(!route)throw Error(`Missing buck path ${c.name}`);
    return {connection:c.select,route:route.map(q=>({...q,...applyToPoint(transform,{x:Number(q.x),y:Number(q.y)})}))};
  }) as typeof phase._parsedProps.pcbTracePaths;
}
