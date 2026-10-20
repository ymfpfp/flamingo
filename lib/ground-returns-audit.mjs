import {assembledPlacements,layoutDigest,routeDigest} from './power-distribution-audit.mjs';
import preserved from '../manufacturing/ground-returns/preserved-layout.json';
import specs from '../manufacturing/ground-returns/specs.json';
import paths from '../manufacturing/ground-returns/paths.json';
import terminals from '../manufacturing/ground-returns/terminals.json';
import {circuitGraph} from './schematic-audit.mjs';
import requirements from '../manufacturing/ground-returns/requirements.json';

export function auditGroundReturns(json){
 const failures=[],parts=assembledPlacements(json);
 if(parts.length!==preserved.assembledCount||parts.some(p=>p.layer!=='top')||layoutDigest(parts)!==preserved.assembledPlacementSha256)failures.push('All assembled components must retain their fixed top placements');
 const traces=json.filter(e=>e.type==='pcb_trace'),byId=new Map(traces.map(e=>[e.pcb_trace_id,e]));
 for(const[id,digest]of Object.entries(preserved.traceGeometrySha256))if(!byId.has(id)||routeDigest(byId.get(id).route)!==digest)failures.push('Previous trace changed: '+id);
 const sources=new Map(json.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
 for(const spec of specs){
  const found=traces.filter(t=>sources.get(t.source_trace_id)?.name===spec.name),path=paths.find(p=>p.name===spec.name);
  if(found.length!==1||!path||![routeDigest(path.route),routeDigest([...path.route].reverse())].includes(routeDigest(found[0].route))){failures.push(spec.name+': missing or changed native route');continue;}
  if(found[0].route.some(q=>q.route_type!=='wire'||q.layer!==spec.layer||q.width<spec.width-1e-8))failures.push(spec.name+': wrong ground contact layer or width');
 }
 for(const t of terminals){
  const v=json.filter(e=>e.type==='pcb_via'&&Math.hypot(e.x-t.x,e.y-t.y)<1e-5);
  if(v.length!==1||v[0].layers.length!==6||Math.abs(v[0].hole_diameter-t.drillDiameter)>1e-6||Math.abs(v[0].outer_diameter-t.copperDiameter)>1e-6)failures.push(t.name+': missing or changed ground via');
 }
 const removed=requirements.removedFloatingGroundVia;
 if(json.some(e=>e.type==='pcb_via'&&Math.hypot(e.x-removed.position.x,e.y-removed.position.y)<1e-5))failures.push('Floating auxiliary via remains inside the connector copper keepout');
 const g=circuitGraph(json),ground=g.net('ATX','pin3'),ports=new Map(json.filter(e=>e.type==='pcb_port').map(e=>[e.pcb_port_id,e]));
 const groundPortErrors=json.filter(e=>e.type==='pcb_port_not_connected_error'&&e.pcb_port_ids?.some(id=>g.root(ports.get(id)?.source_port_id)===ground));
 if(groundPortErrors.length)failures.push(`${groundPortErrors.length} native GND/GNDA connectivity errors remain`);
 return {passed:!failures.length,failures,assembledComponentsOnTop:parts.length,preservedTraceCount:Object.keys(preserved.traceGeometrySha256).length,groundContacts:specs.length,nativeGroundPortErrors:groundPortErrors.length,newVias:terminals.filter(t=>!t.existing).length,reusedGroundVias:terminals.filter(t=>t.existing).length,scope:'Fixed top assembly, 520 preserved traces, existing ground contacts and zero native GND/GNDA port errors. Physical plane connectivity and fabrication/ASMedia geometry are checked separately.'};
}
