import {assembledPlacements,checkAssemblyPlacement} from "./layout-audit.mjs";
import contacts from "../../manufacturing/vcch-routing/contacts.json";
import terminals from "../../manufacturing/vcch-routing/terminals.json";

export function auditVcchRouting(json){
  const failures=[],parts=assembledPlacements(json);
  failures.push(...checkAssemblyPlacement(json));
  const traces=json.filter(e=>e.type==="pcb_trace"),sources=new Map(json.filter(e=>e.type==="source_trace").map(e=>[e.source_trace_id,e]));
  for(const p of contacts){
    const found=traces.filter(t=>sources.get(t.source_trace_id)?.name===`${p.name}_TRACE`);
    if(found.length!==1){failures.push(`${p.name}: expected one correctly attributed contact`);continue;}
    const trace=found[0],terminal=terminals.find(t=>t.name===p.name);
    if(trace.route.some(q=>q.route_type!=="wire"||q.layer!=="top"||q.width<.1-1e-8))failures.push(`${p.name}: contact must remain on top at >=0.1 mm`);
    for(const expected of [p.route[0],terminal])if(![trace.route[0],trace.route.at(-1)].some(q=>Math.hypot(q.x-expected.x,q.y-expected.y)<1e-4))failures.push(`${p.name}: physical endpoint changed`);
  }
  for(const rail of ["VCCH","VCCA33"]){
    const net=json.find(e=>e.type==="source_net"&&e.name===rail);
    if(!json.some(e=>e.type==="pcb_copper_pour"&&e.source_net_id===net?.source_net_id&&["inner2","inner3"].includes(e.layer)))failures.push(`${rail}: missing inner power copper`);
  }
  return {passed:!failures.length,failures,contactRoutes:contacts.length,
    assembledComponentsOnTop:parts.filter(p=>p.layer==="top").length,
    scope:"Fixed top-side assembly, named 3.3 V contacts, and L3/L4 power regions.",
    limitations:"Physical supply and ground continuity, clearances, SI layout regressions, and voltage/load qualification are separate checks."};
}
