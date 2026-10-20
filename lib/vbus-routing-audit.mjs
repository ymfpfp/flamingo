import {assembledPlacements,layoutDigest,routeDigest} from './power-distribution-audit.mjs';
import preserved from '../manufacturing/vbus-routing/preserved-layout.json';
import specs from '../manufacturing/vbus-routing/specs.json';
import paths from '../manufacturing/vbus-routing/paths.json';
import terminals from '../manufacturing/vbus-routing/terminals.json';

export function auditVbusRouting(json){
  const failures=[],parts=assembledPlacements(json);
  if(parts.length!==preserved.assembledCount||parts.some(p=>p.layer!=='top')||layoutDigest(parts)!==preserved.assembledPlacementSha256)failures.push('Assembled components must retain their fixed top placements');
  const traces=json.filter(e=>e.type==='pcb_trace'),byId=new Map(traces.map(e=>[e.pcb_trace_id,e]));
  for(const[id,digest]of Object.entries(preserved.traceGeometrySha256))if(!byId.has(id)||routeDigest(byId.get(id).route)!==digest)failures.push('Previous trace changed: '+id);
  const sources=new Map(json.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
  for(const spec of specs){
    const t=traces.filter(t=>sources.get(t.source_trace_id)?.name===spec.name),path=paths.find(p=>p.name===spec.name);
    if(t.length!==1||!path||![routeDigest(path.route),routeDigest([...path.route].reverse())].includes(routeDigest(t[0].route))){failures.push(spec.name+': missing or changed saved route');continue;}
    if(t[0].route.some(q=>q.route_type!=='wire'||q.layer!==spec.layer||q.width<.127-1e-8))failures.push(spec.name+': wrong layer or trace width');
  }
  for(const p of terminals){
    const v=json.filter(e=>e.type==='pcb_via'&&Math.hypot(e.x-p.x,e.y-p.y)<1e-5);
    if(v.length!==1||v[0].layers.length!==6||Math.abs(v[0].hole_diameter-p.drillDiameter)>1e-6||Math.abs(v[0].outer_diameter-p.copperDiameter)>1e-6)failures.push(p.name+': missing or changed full-stack via');
  }
  return {passed:!failures.length,failures,assembledComponentsOnTop:parts.length,preservedTraceCount:Object.keys(preserved.traceGeometrySha256).length,connections:specs.length,newVias:terminals.filter(t=>!t.existing).length,scope:'Fixed top assembly, native saved routes and full-stack via dimensions. Physical connectivity, spacing, reference planes and fabrication checks are checked separately.'};
}
