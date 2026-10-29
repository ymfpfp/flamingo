// Use tscircuit's own stitch solver. A separate physical check must accept
// every site as a full-stack via before it is added to the authored circuit.
import {readFileSync,writeFileSync} from 'node:fs';
import {SOLVERS} from '@tscircuit/core';
import {vcclParallelOutline} from '../lib/power-distribution';
const [source,output]=process.argv.slice(2);
if(!source||!output)throw Error('Expected source Circuit JSON and output path');
const j=JSON.parse(readFileSync(source));
// The native fill omits unanchored islands. Seed candidate generation with
// the authored L4 VCCL intent, then require full-stack clearance and a native
// source rebuild. This intent is never exported as finished board copper.
if(process.argv.includes('--vccl-intent'))j.push({type:'pcb_copper_pour',pcb_copper_pour_id:'candidate_vccl_intent',shape:'brep',
  layer:'inner3',source_net_id:j.find(e=>e.type==='source_net'&&e.name==='VCCL').source_net_id,
  brep_shape:{outer_ring:{vertices:vcclParallelOutline},inner_rings:[]}});
const ids=j.filter(e=>e.type==='source_net'&&['VCCL','VDD'].includes(e.name)).map(e=>e.source_net_id);
const records=[];
for(const layers of [['top','inner2'],['bottom','inner2'],['top','inner3'],['bottom','inner3'],['inner2','inner3']]){
  const options={sourceNetIds:ids,layers,viaHoleDiameter:.15,viaOuterDiameter:.3,
    viaStitchPitch:.25,pourEdgeClearance:.05,obstacleClearance:.1,minimumViaSeparation:.4};
  const solver=new SOLVERS.ViaStitchSolver({circuitJson:j,options});
  solver.solve();if(solver.failed)throw Error(solver.error);
  records.push({layers,options,...solver.getOutput()});
}
writeFileSync(output,JSON.stringify({generator:'tscircuit SOLVERS.ViaStitchSolver',source,usesAuthoredVcclIntent:process.argv.includes('--vccl-intent'),records},null,2)+'\n');
console.log(records.map(r=>({layers:r.layers,sites:r.pcbVias.length})));
