import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {assembledPlacements,routeDigest,traceConnections,layoutDigest} from '../lib/layout-geometry.mjs';
const [beforeFile,afterFile,output='dist/power-distribution/preservation.json']=process.argv.slice(2);
if(!beforeFile||!afterFile)throw Error('Usage: bun scripts/check-pdn-preservation.mjs before.json after.json [output.json]');
const read=file=>{const j=JSON.parse(readFileSync(file));return j.circuitJson??j;};
const before=read(beforeFile),after=read(afterFile);
const routes=j=>{const connections=traceConnections(j);return j.filter(e=>e.type==='pcb_trace')
  .map(e=>connections.get(e.source_trace_id)+':'+routeDigest(e.route)).sort();};
const viaGeometry=v=>({x:v.x,y:v.y,hole:v.hole_diameter,pad:v.outer_diameter,layers:v.layers});
const oldVias=before.filter(e=>e.type==='pcb_via'),newVias=after.filter(e=>e.type==='pcb_via');
const remaining=new Map();
for(const v of newVias){const key=layoutDigest(viaGeometry(v));remaining.set(key,(remaining.get(key)??0)+1);}
const missingVias=[];
for(const v of oldVias){const key=layoutDigest(viaGeometry(v)),count=remaining.get(key)??0;
  if(!count)missingVias.push(viaGeometry(v));else remaining.set(key,count-1);}
const addedVias=[];
for(const v of newVias){const key=layoutDigest(viaGeometry(v)),count=remaining.get(key)??0;
  if(count){addedVias.push(viaGeometry(v));remaining.set(key,count-1);}}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const parts=assembledPlacements(after);
const report={allExistingTracesUnchanged:equal(routes(before),routes(after)),
  allExistingViasUnchanged:!missingVias.length,missingVias,addedVias,
  allComponentPositionsUnchanged:equal(assembledPlacements(before),parts),
  allAssemblyOnTop:parts.every(p=>p.layer==='top'),traceCount:routes(after).length,
  previousViaCount:oldVias.length,viaCount:newVias.length,componentCount:parts.length,
  baselineFile:beforeFile,baselineSha256:hash(beforeFile),sourceFile:afterFile,sourceSha256:hash(afterFile),
  scope:'All physical trace routes with semantic connections, all previous via dimensions and sites, and all assembled placements. New copper and reference-plane antipads require separate physical/SI audits.'};
report.passed=report.allExistingTracesUnchanged&&report.allExistingViasUnchanged&&report.allComponentPositionsUnchanged&&report.allAssemblyOnTop;
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,addedVias:addedVias.length},null,2));if(!report.passed)process.exitCode=1;
