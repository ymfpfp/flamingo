import type {AnyCircuitElement} from "tscircuit";
import {bridgeClockConnections,bridgeClockRules as rules} from "../../lib/bridge-clock-routing";
import {isClockNeckSegment} from "../../lib/high-speed-rules";

export function auditBridgeClockRouting(json:AnyCircuitElement[]){
  const failures:string[]=[];
  const parts=new Map(json.filter(e=>e.type==="source_component").map(e=>[e.source_component_id,e.name]));
  const sources=new Map(json.filter(e=>e.type==="source_trace").map(e=>[e.source_trace_id,e]));
  const sourcePorts=json.filter(e=>e.type==="source_port"),pcbPorts=json.filter(e=>e.type==="pcb_port");
  const port=(selector:string)=>{
    const [component,pin]=selector.split(".");
    const s=sourcePorts.find(e=>parts.get(e.source_component_id??"")===component&&e.port_hints?.includes(pin!));
    const p=pcbPorts.find(e=>e.source_port_id===s?.source_port_id);
    if(!p)throw Error(`Clock audit port not found: ${selector}`);return p;
  };
  const ground=json.filter(e=>e.type==="source_net").find(e=>e.name==="GND");
  const returns=json.filter(e=>e.type==="pcb_via").filter(e=>(e.source_net_id===ground?.source_net_id
    ||sources.get(e.source_trace_id??"")?.connected_source_net_ids?.includes(ground?.source_net_id??""))
    &&["inner1","inner4"].every(l=>e.layers.includes(l as "inner1"|"inner4")));
  const records=bridgeClockConnections.map(c=>{
    const copper=json.filter(e=>e.type==="pcb_trace").filter(e=>sources.get(e.source_trace_id??"")?.name===c.name);
    if(copper.length!==1)failures.push(`${c.name}: expected one complete route, found ${copper.length}`);
    let lengthMm=0,viaCount=0,neckLengthMm=0;
    for(const t of copper){
      for(const endpoint of [c.from,c.to].filter(p=>!p.startsWith("net."))){
        const p=port(endpoint);
        if(![t.route[0],t.route[t.route.length-1]].some(q=>q&&q.route_type!=="through_pad"
          &&Math.hypot(q.x-p.x,q.y-p.y)<1e-5&&p.layers.includes(q.route_type==="wire"?q.layer:"top")))
          failures.push(`${c.name}: route misses ${endpoint}`);
      }
      for(const [i,a] of t.route.entries()){
        if(a.route_type==="via"){
          viaCount++;
          const physical=json.filter(e=>e.type==="pcb_via").find(e=>e.pcb_trace_id===t.pcb_trace_id&&Math.hypot(e.x-a.x,e.y-a.y)<1e-5);
          if(physical?.outer_diameter!==rules.viaDiameter||physical?.hole_diameter!==rules.viaHole
            ||![a.from_layer,a.to_layer].every(l=>["top","bottom"].includes(l)))failures.push(`${c.name}: invalid via geometry`);
          if(!c.name.includes("CASE")&&!returns.some(v=>Math.hypot(v.x-a.x,v.y-a.y)<=1.0001))
            failures.push(`${c.name}: missing nearby reference-plane return via`);
          continue;
        }
        if(a.route_type!=="wire"||!["top","bottom"].includes(a.layer)){
          failures.push(`${c.name}: unsupported route/layer`);continue;
        }
        const b=t.route[i+1];
        if(b?.route_type!=="wire"||b.layer!==a.layer)continue;
        const length=Math.hypot(b.x-a.x,b.y-a.y);lengthMm+=length;
        if(!length)continue;
        if(c.name.includes("CASE")){
          if(Math.abs(a.width-.25)>1e-6)failures.push(`${c.name}: invalid case-ground trace width`);
        }else if(Math.abs(a.width-rules.width)>1e-6){
          if(Math.abs(a.width-rules.neckWidth)>1e-6||!isClockNeckSegment(c.name,a,b))
            failures.push(`${c.name}: invalid width outside a scoped BGA neck`);
          else neckLengthMm+=length;
        }
      }
    }
    const expected=c.name.endsWith("_PHY")?2:0;
    if(viaCount!==expected)failures.push(`${c.name}: expected ${expected} vias, found ${viaCount}`);
    return {name:c.name,lengthMm,viaCount,neckLengthMm};
  });
  const length=(name:string)=>records.find(e=>e.name===name)?.lengthMm??0;
  const crystal=["XI","XO"].map(name=>({name,copperLengthMm:length(`CLOCK_${name}_BRIDGE`)+length(`CLOCK_${name}_XTAL`)}));
  const refclk=["P","N"].map(name=>({name,copperLengthMm:length(`CLOCK_REFCLK_${name}_PHY`)+length(`CLOCK_REFCLK_${name}_CON`)}));
  for(const c of crystal)if(!c.copperLengthMm||c.copperLengthMm>=rules.crystalMaxLength)
    failures.push(`${c.name}: exceeds the 12.7 mm crystal-route limit`);
  for(const c of refclk)if(!c.copperLengthMm||c.copperLengthMm>=rules.refclkMaxLength)
    failures.push(`REFCLK_${c.name}: exceeds the 177.8 mm connector limit`);
  const crystalSkewMm=Math.abs(crystal[0].copperLengthMm-crystal[1].copperLengthMm);
  const refclkSkewMm=Math.abs(refclk[0].copperLengthMm-refclk[1].copperLengthMm);
  if(refclkSkewMm>=rules.refclkMaxSkew)failures.push("REFCLK: exceeds ASMedia 0.127 mm P/N skew");
  for(const pin of ["pin2","pin4"]){
    const p=port(`XCLK.${pin}`);
    if(!returns.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<.001))failures.push(`Crystal ${pin}: missing grounded cover-land via`);
  }
  for(const p of json.filter(e=>e.type==="pcb_component").filter(e=>["XCLK","C1","R_PCIE_REFCLK_P","R_PCIE_REFCLK_N"].includes(parts.get(e.source_component_id)??"")))
    if(p.layer!=="top")failures.push(`${parts.get(p.source_component_id)}: must remain on top`);
  for(const l of ["inner1","inner4"])if(!json.some(e=>e.type==="pcb_copper_pour"&&e.layer===l&&e.source_net_id===ground?.source_net_id))
    failures.push(`Missing clock ground reference ${l}`);
  return {passed:!failures.length,failures,crystal,crystalSkewMm,refclk,refclkSkewMm,records,
    limitations:"Nominal 85 ohm surface geometry; fixed BGA, pad and via launches require final SI review. Drawn copper length excludes package delay, component internal spans and via depth. Crystal startup/frequency remain hardware checks."};
}
