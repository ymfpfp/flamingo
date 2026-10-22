import {assembledPlacements,checkAssemblyPlacement,checkSpecifiedRoutes} from './layout-audit.mjs';
import specs from '../../manufacturing/ground-returns/specs.json';
import terminals from '../../manufacturing/ground-returns/terminals.json';
import {circuitGraph} from '../../lib/circuit-graph.mjs';
import requirements from '../../manufacturing/ground-returns/requirements.json';

export function auditGroundReturns(json){
 const failures=[],parts=assembledPlacements(json);
 failures.push(...checkAssemblyPlacement(json));
 failures.push(...checkSpecifiedRoutes(json, specs));
 for(const t of terminals){
  const v=json.filter(e=>e.type==='pcb_via'&&Math.hypot(e.x-t.x,e.y-t.y)<1e-5);
  if(v.length!==1||v[0].layers.length!==6||Math.abs(v[0].hole_diameter-t.drillDiameter)>1e-6||Math.abs(v[0].outer_diameter-t.copperDiameter)>1e-6)failures.push(t.name+': missing or changed ground via');
 }
 const removed=requirements.removedFloatingGroundVia;
 if(json.some(e=>e.type==='pcb_via'&&Math.hypot(e.x-removed.position.x,e.y-removed.position.y)<1e-5))failures.push('Floating auxiliary via remains inside the connector copper keepout');
 const g=circuitGraph(json),ground=g.net('ATX','pin3'),ports=new Map(json.filter(e=>e.type==='pcb_port').map(e=>[e.pcb_port_id,e]));
 const groundPortErrors=json.filter(e=>e.type==='pcb_port_not_connected_error'&&e.pcb_port_ids?.some(id=>g.root(ports.get(id)?.source_port_id)===ground));
 if(groundPortErrors.length)failures.push(`${groundPortErrors.length} native GND/GNDA connectivity errors remain`);
 return {passed:!failures.length,failures,assembledComponentsOnTop:parts.length,groundContacts:specs.length,nativeGroundPortErrors:groundPortErrors.length,newVias:terminals.filter(t=>!t.existing).length,reusedGroundVias:terminals.filter(t=>t.existing).length,scope:'Fixed top assembly, ground contacts and zero native GND/GNDA port errors. Physical plane connectivity and fabrication/ASMedia geometry are checked separately.'};
}
