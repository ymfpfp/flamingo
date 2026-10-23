// Choose stitching sites with tscircuit's native solver, then limit the result
// to the authored left-side power corridor. This performs no signal routing.
import {readFileSync,writeFileSync} from 'node:fs';
import {SOLVERS} from '@tscircuit/core';
const [source,output]=process.argv.slice(2),j=JSON.parse(readFileSync(source));
const net=name=>j.find(e=>e.type==='source_net'&&e.name===name).source_net_id;
const selected=[];
for(const [name,layers,accept,clearance]of [
  ['V12V',['top','inner3'],v=>v.x>=1&&v.x<=4&&v.y>=52&&v.y<=61,.3],
  ['SLOT_12V',['top','bottom'],v=>v.x>=1&&v.x<=4&&v.y>=64&&v.y<=122,.95],
]){
  const solver=new SOLVERS.ViaStitchSolver({circuitJson:j,options:{sourceNetIds:[net(name)],layers,
    viaStitchPitch:name==='SLOT_12V'?.5:2,viaHoleDiameter:.3,viaOuterDiameter:.6,pourEdgeClearance:.15,
    obstacleClearance:clearance,minimumViaSeparation:name==='SLOT_12V'?2:1}});
  solver.solve();if(solver.failed)throw Error(solver.error);
  for(const v of solver.getOutput().pcbVias.filter(accept))selected.push({
    name:`SP_SURFACE_${name}_${selected.length+1}`,net:name,x:v.x,y:v.y,drillDiameter:.3,copperDiameter:.6});
}
writeFileSync(output,JSON.stringify(selected,null,2)+'\n');
console.log(JSON.stringify({source,output,stitches:selected},null,2));
