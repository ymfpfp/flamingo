import type {AnyCircuitElement} from "tscircuit";
import {buckConnections,buckRails,buckRules} from "../../lib/buck-routing";
import {electricalMargins} from "./schematic-audit.mjs";

// Inspect emitted copper, including the narrow pin exits. This is a local
// geometry/DC screen; the board-wide PDN and regulator hardware tests follow.
export function auditBuckRouting(json:AnyCircuitElement[]){
  const failures:string[]=[];
  const components=json.filter(e=>e.type==="source_component");
  const names=new Map(components.map(e=>[e.source_component_id,e.name]));
  const sourcePorts=json.filter(e=>e.type==="source_port"),ports=json.filter(e=>e.type==="pcb_port");
  const sources=new Map(json.filter(e=>e.type==="source_trace").map(e=>[e.source_trace_id,e]));
  const traces=json.filter(e=>e.type==="pcb_trace");
  // Fraction of a straight segment inside an axis-aligned rectangular land.
  // Do not credit unknown/rotated pad geometry.
  const insidePad=(a:{x:number;y:number},b:{x:number;y:number},pad:AnyCircuitElement)=>{
    if(pad.type!=="pcb_smtpad"||pad.shape!=="rect")return null;
    let lo=0,hi=1;
    for(const [start,delta,center,size] of [[a.x,b.x-a.x,pad.x,pad.width],[a.y,b.y-a.y,pad.y,pad.height]]){
      if(Math.abs(delta)<1e-12){if(Math.abs(start-center)>size/2)return null;continue;}
      const p=(center-size/2-start)/delta,q=(center+size/2-start)/delta;
      lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));
      if(hi<=lo)return null;
    }
    return [lo,hi];
  };
  const port=(selector:string)=>{
    const [name,pin]=selector.split(".");
    const source=sourcePorts.find(p=>names.get(p.source_component_id??"")===name&&p.port_hints?.includes(pin!));
    // Vias have synthetic source ports and a named pcb_component.
    const connectivity=[...sources.values()].find(e=>e.display_name===`${name} connectivity`);
    const via=json.filter(e=>e.type==="pcb_via").find(e=>e.source_trace_id===connectivity?.source_trace_id);
    const p=ports.find(p=>source?p.source_port_id===source.source_port_id:
      via?.pcb_port_ids?.includes(p.pcb_port_id)&&p.layers.includes(pin as "top"|"bottom"));
    if(!p)throw Error(`Missing buck audit port ${selector}`);return p;
  };
  const records=buckConnections.map(c=>{
    const found=traces.filter(t=>sources.get(t.source_trace_id??"")?.name===c.name);
    if(found.length!==1)failures.push(`${c.name}: expected one routed connection, found ${found.length}`);
    let lengthMm=0,resistance20Ohm=0,viaCount=0,minimumWidthMm=Infinity;
    for(const t of found){
      for(const endpoint of [c.from,c.to]){
        const p=port(endpoint);
        if(![t.route[0],t.route[t.route.length-1]].some(q=>q&&q.route_type!=="through_pad"
          &&Math.hypot(q.x-p.x,q.y-p.y)<1e-4&&p.layers.includes(q.route_type==="wire"?q.layer:q.from_layer)))
          failures.push(`${c.name}: wrong endpoint ${endpoint}`);
      }
      for(const [i,a] of t.route.entries()){
        if(a.route_type==="via"){viaCount++;continue;}
        if(a.route_type!=="wire"){failures.push(`${c.name}: unsupported copper`);continue;}
        const expectedLayer=c.name==="BUCK_ENABLE_LINK"?"bottom":"top";
        if(c.name!=="BUCK_ENABLE_TRUNK"&&a.layer!==expectedLayer)failures.push(`${c.name}: unexpected ${a.layer} routing`);
        const b=t.route[i+1];if(b?.route_type!=="wire"||a.layer!==b.layer)continue;
        const length=Math.hypot(a.x-b.x,a.y-b.y);if(length<1e-9)continue;
        lengthMm+=length;minimumWidthMm=Math.min(minimumWidthMm,a.width);
        resistance20Ohm+=1.724e-5*length/(.035*a.width);
        const allowed=c.name.endsWith("_SW")?[.5,.8,1.2]:c.name.endsWith("_VIN")?[.5,.9]:
          c.name.endsWith("_INPUT_BULK")?[1,.7]:[c.width];
        if(!allowed.some(w=>Math.abs(w-a.width)<1e-6))failures.push(`${c.name}: incorrect trace width`);
      }
    }
    if(viaCount!==c.maxVias)failures.push(`${c.name}: expected ${c.maxVias} route vias, found ${viaCount}`);
    const precision0603=c.name==="BUCK_VDD_FB_DIVIDER"&&components.some(e=>e.name==="R_VDD_FBT"&&e.manufacturer_part_number==="PTFR0603B1K87N9");
    let exposedLengthMm:number|undefined;
    if(c.name.endsWith("_FB_DIVIDER")){
      const ends=[port(c.from),port(c.to)];
      const pads=json.filter(e=>e.type==="pcb_smtpad"&&ends.some(p=>p.pcb_port_id===e.pcb_port_id));
      exposedLengthMm=0;
      for(const t of found)for(let i=0;i<t.route.length-1;i++){
        const a=t.route[i],b=t.route[i+1];if(a.route_type!=="wire"||b.route_type!=="wire")continue;
        const intervals=pads.map(p=>insidePad(a,b,p)).filter((q):q is number[]=>q!==null).sort((a,b)=>a[0]-b[0]);
        let covered=0,end=0;
        for(const [lo,hi] of intervals){covered+=Math.max(0,hi-Math.max(lo,end));end=Math.max(end,hi);}
        exposedLengthMm+=Math.hypot(a.x-b.x,a.y-b.y)*(1-covered);
      }
      // Original 0402/0402 budget: 1.3 mm minus two 0.270002 mm half-lands.
      // Retain that exposed-wire limit when the 0603 land moves the pin center.
      if(exposedLengthMm>.76+1e-5)failures.push(`${c.name}: exposed feedback trace exceeds 0.76 mm project budget`);
    }
    const maximum=c.name.endsWith("_SW")?3:c.name.endsWith("_VIN")?2:c.name.endsWith("_INPUT_BULK")?3:
      /_OUTPUT_[AB]$/.test(c.name)?5:c.name.endsWith("_VOS")?4:c.name.endsWith("_FB_INPUT")?3.5:
      c.name.endsWith("_FB_SENSE")?6:c.name.endsWith("_FB_DIVIDER")?(precision0603?1.6:1.3):c.name.startsWith("BUCK_MONITOR_")?3:30;
    if(lengthMm>maximum+1e-5)failures.push(`${c.name}: local trace exceeds ${maximum} mm project budget`);
    return {name:c.name,lengthMm,exposedLengthMm,minimumWidthMm,viaCount,resistance20Ohm,
      lineSegmentDropAt3A80CMV:resistance20Ohm*(1+.00393*60)*3*1000};
  });
  const margins=electricalMargins(json);
  for(const c of margins.converter){
    if(!c.staticVoltageRangePass||!c.datasheetLcSelectionPass||c.nominalSwitchingFrequencyHz!==2.5e6)
      failures.push(`${c.rail}: ASMedia static-voltage / TPS62903 LC screening failed`);
  }
  for(const r of buckRails){
    for(const stage of ["A","B"]){
      const route=records.find(c=>c.name===`BUCK_${r}_OUTPUT_${stage}`);
      if(!route||route.lineSegmentDropAt3A80CMV>5)failures.push(`${r}: output trace estimate exceeds 5 mV local budget at 3 A / 80 C`);
    }
    const p=port(`${r}_BUCK.GND`),ground=json.filter(e=>e.type==="source_net").find(e=>e.name==="GND");
    const near=json.filter(e=>e.type==="pcb_via").filter(v=>Math.hypot(v.x-p.x,v.y-p.y)<1.5
      &&(v.source_net_id===ground?.source_net_id||v.subcircuit_connectivity_map_key===ground?.subcircuit_connectivity_map_key
        ||sources.get(v.source_trace_id??"")?.connected_source_port_ids.some(id=>sourcePorts.find(p=>p.source_port_id===id)?.subcircuit_connectivity_map_key===ground?.subcircuit_connectivity_map_key))
      &&v.layers.includes("inner1")&&v.layers.includes("inner4"));
    if(near.length<4)failures.push(`${r}: fewer than four nearby grounded return/thermal vias`);
  }
  for(const c of json.filter(e=>e.type==="pcb_component").filter(e=>names.has(e.source_component_id)))
    if(c.layer!=="top")failures.push(`${names.get(c.source_component_id)}: assembly must remain on top`);
  for(const rail of buckRails)for(const pin of (rail==="VDD"?["PG"]:["PG","SS"])){
    const p=port(`${rail}_BUCK.${pin}`);
    if(traces.some(t=>t.route.some(q=>q.route_type==="wire"&&q.layer==="top"&&Math.hypot(q.x-p.x,q.y-p.y)<1e-5)))
      failures.push(`${rail}.${pin}: intentionally unused pin was routed`);
  }
  return {passed:!failures.length,failures,records,converters:margins.converter,
    localOutputTraceDropBudgetMV:5,loadEnvelopeA:buckRules.loadEnvelopeA,
    scope:"Local buck loops, feedback, mode, ground returns, enable connection and VCCH supervisor sense routes. ATX 5 V feeds, supervisor supply and bridge power regions have separate distribution audits.",
    limitations:"Resistance estimates use 35 um copper at 20 C and 80 C, and exclude package/pad spreading, planes, component ESR/DCR and ground return. Copper pours add parallel paths. Full PDN, ripple, startup, thermal and load-step performance remain unqualified."};
}
