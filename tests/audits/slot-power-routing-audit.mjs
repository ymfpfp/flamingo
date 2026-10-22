import {assembledPlacements,checkAssemblyPlacement} from './layout-audit.mjs';
import terminals from '../../manufacturing/slot-power-routing/terminals.json';
import specs from '../../manufacturing/slot-power-routing/control-specs.json';
export function auditSlotPowerRouting(json){
 const failures=[],parts=assembledPlacements(json),traces=json.filter(e=>e.type==='pcb_trace'),sources=new Map(json.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
 failures.push(...checkAssemblyPlacement(json));
 const names=new Map(json.filter(e=>e.type==='source_component').map(e=>[e.source_component_id,e.name]));
 const at=selector=>{const [part,pin]=selector.split('.'),terminal=terminals.find(p=>p.name===part);if(terminal)return terminal;const s=json.find(e=>e.type==='source_port'&&names.get(e.source_component_id)===part&&e.port_hints.includes(pin));return json.find(e=>e.type==='pcb_port'&&e.source_port_id===s?.source_port_id)};
 for(const p of [...terminals.filter(t=>t.contact).map(t=>({name:t.name+'_TRACE',from:t.name+'.top',to:t.selector,width:t.width,layer:'top'})),...specs]){
  const found=traces.filter(t=>sources.get(t.source_trace_id)?.name===p.name);if(found.length!==1){failures.push(p.name+': expected one attributed physical route');continue;}
  const t=found[0];if(t.route.some(q=>q.route_type!=='wire'||q.layer!==p.layer||q.width<p.width-1e-8))failures.push(p.name+': wrong layer/width');
  for(const endpoint of [at(p.from),at(p.to)])if(!endpoint||![t.route[0],t.route.at(-1)].some(q=>Math.hypot(q.x-endpoint.x,q.y-endpoint.y)<1e-4))failures.push(p.name+': wrong endpoint');
 }
 for(const t of terminals){const source=[...sources.values()].find(s=>s.display_name===t.name+' connectivity'),via=json.find(e=>e.type==='pcb_via'&&(source?e.source_trace_id===source.source_trace_id:Math.hypot(e.x-t.x,e.y-t.y)<1e-5&&e.source_net_id===json.find(n=>n.type==='source_net'&&n.name===t.net)?.source_net_id));
  if(!via||Math.hypot(via.x-t.x,via.y-t.y)>1e-5||Math.abs(via.outer_diameter-t.copperDiameter)>1e-6||Math.abs(via.hole_diameter-t.drillDiameter)>1e-6||via.layers.length!==6)failures.push(t.name+': missing specified full-stack via');
 }
 return {passed:!failures.length,failures,assembledComponentsOnTop:parts.filter(p=>p.layer==='top').length,contactRoutes:terminals.filter(t=>t.contact).length,controlRoutes:specs.length,
 scope:'Fixed top assembly, named power contacts, native control routes and specified full-stack vias. Copper continuity, widths and clearances require the separate physical audit.'};
}
