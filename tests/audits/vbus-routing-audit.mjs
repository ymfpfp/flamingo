import {assembledPlacements,checkAssemblyPlacement,checkSpecifiedRoutes} from './layout-audit.mjs';
import specs from '../../manufacturing/vbus-routing/specs.json';
import terminals from '../../manufacturing/vbus-routing/terminals.json';

export function auditVbusRouting(json){
  const failures=[],parts=assembledPlacements(json);
 failures.push(...checkAssemblyPlacement(json));
 failures.push(...checkSpecifiedRoutes(json, specs));
  for(const p of terminals){
    const v=json.filter(e=>e.type==='pcb_via'&&Math.hypot(e.x-p.x,e.y-p.y)<1e-5);
    if(v.length!==1||v[0].layers.length!==6||Math.abs(v[0].hole_diameter-p.drillDiameter)>1e-6||Math.abs(v[0].outer_diameter-p.copperDiameter)>1e-6)failures.push(p.name+': missing or changed full-stack via');
  }
  return {passed:!failures.length,failures,assembledComponentsOnTop:parts.length,connections:specs.length,newVias:terminals.filter(t=>!t.existing).length,scope:'Fixed top assembly, native fixed paths and full-stack via dimensions. Physical connectivity, spacing, reference planes and fabrication checks are checked separately.'};
}
