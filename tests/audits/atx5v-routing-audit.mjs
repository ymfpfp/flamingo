import {assembledPlacements,checkAssemblyPlacement} from "./layout-audit.mjs";
import contacts from "../../manufacturing/atx5v-routing/contacts.json";

export function auditAtx5vRouting(json){
  const failures=[],parts=assembledPlacements(json);
  failures.push(...checkAssemblyPlacement(json));
  const traces=json.filter(e=>e.type==="pcb_trace"),sources=new Map(json.filter(e=>e.type==="source_trace").map(e=>[e.source_trace_id,e]));
  const sourceParts=new Map(json.filter(e=>e.type==="source_component").map(e=>[e.source_component_id,e.name]));
  for(const p of contacts){
    const [part,pin]=p.selector.split(".");
    const sourcePort=json.find(e=>e.type==="source_port"&&sourceParts.get(e.source_component_id)===part&&e.port_hints.includes(pin));
    const pad=json.find(e=>e.type==="pcb_port"&&e.source_port_id===sourcePort?.source_port_id);
    const found=traces.filter(t=>sources.get(t.source_trace_id)?.name===`${p.name}_TRACE`);
    if(found.length!==1){failures.push(`${p.name}: expected one top contact`);continue;}
    const trace=found[0];
    if(trace.route.some(q=>q.route_type!=="wire"||q.layer!=="top"||q.width<.8-1e-8))failures.push(`${p.name}: contact must stay on top at >=0.8 mm`);
    for(const expected of [p,pad])if(!expected||![trace.route[0],trace.route.at(-1)].some(q=>Math.hypot(q.x-expected.x,q.y-expected.y)<1e-4))failures.push(`${p.name}: wrong physical contact endpoint`);
    const connectivity=[...sources.values()].find(t=>t.display_name===`${p.name} connectivity`);
    const via=json.find(e=>e.type==="pcb_via"&&e.source_trace_id===connectivity?.source_trace_id);
    if(!via||Math.abs(via.outer_diameter-p.copperDiameter)>1e-6||Math.abs(via.hole_diameter-p.drillDiameter)>1e-6||!via.layers.includes("inner3"))failures.push(`${p.name}: missing specified full-stack power via`);
  }
  const net=json.find(e=>e.type==="source_net"&&e.name==="V5V");
  if(!json.some(e=>e.type==="pcb_copper_pour"&&e.source_net_id===net?.source_net_id&&e.layer==="inner3"))failures.push("Missing L4 ATX 5 V feeder");
  return {passed:!failures.length,failures,
    assembledComponentsOnTop:parts.filter(p=>p.layer==="top").length,newContacts:contacts.length,
    scope:"Fixed top assembly, four wide capacitor contacts, full-stack power vias and L4 feeder presence. Physical continuity, clearances and input voltage drop are separate checks."};
}
