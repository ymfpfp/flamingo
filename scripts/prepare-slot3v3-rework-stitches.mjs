// Native proposals only. Full-stack clearance and isolation are checked before
// these candidates can be added to the authored terminal list.
import {readFileSync,writeFileSync} from 'node:fs';
import {SOLVERS} from '@tscircuit/core';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Expected Circuit JSON and candidate output');
const j=JSON.parse(readFileSync(source));
const net=j.find(e=>e.type==='source_net'&&e.name==='SLOT_3V3').source_net_id;
const outline=JSON.parse(readFileSync('manufacturing/power-distribution/cost-reduction-copper.json'))
  .find(r=>r.name==='SP_3V3_BOTTOM_PARALLEL').outline;
// The native fill discards islands without a via. This is proposal intent,
// never fabricated copper. Rebuild from source after accepting safe sites.
j.push({type:'pcb_copper_pour',pcb_copper_pour_id:'candidate_slot_bottom_intent',
  shape:'brep',layer:'bottom',source_net_id:net,
  brep_shape:{outer_ring:{vertices:outline},inner_rings:[]}});
const options={sourceNetIds:[net],layers:['bottom','inner3'],viaHoleDiameter:.25,
  viaOuterDiameter:.5,viaStitchPitch:.2,pourEdgeClearance:.04,
  obstacleClearance:.1,minimumViaSeparation:.3,gridOrigin:{x:0,y:.1}};
const solver=new SOLVERS.ViaStitchSolver({circuitJson:j,options});
solver.solve();if(solver.failed)throw Error(solver.error);
writeFileSync(output,JSON.stringify({generator:'tscircuit SOLVERS.ViaStitchSolver',source,options,...solver.getOutput()},null,2)+'\n');
console.log('Native slot stitch proposals:',solver.getOutput().pcbVias.length);
