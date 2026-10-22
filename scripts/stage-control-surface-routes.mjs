// Replay native routes as fixed surface sections with one explicit plated via
// per physical site. This prevents duplicate drills at shared tree branches.
import {readFileSync,writeFileSync} from 'node:fs';
const file=process.argv[2],jobsFile=process.argv[3],net=process.argv[4];
if(!file||!jobsFile||!net)throw Error('Usage: candidate.json jobs.json NET');
const raw=JSON.parse(readFileSync(file)),rows=raw.results ?? [raw];
const row=rows.find(r=>r.net===net),job=JSON.parse(readFileSync(jobsFile)).find(j=>j.name===net);
const refillDraft=process.argv.includes('--refill-draft');
const referenceOnly=row?.physicalCheck?.failures?.length>0&&row.physicalCheck.failures.every(f=>f.rule==='ground-reference');
if(!row?.solved||!(row.physicalCheck?.passed||refillDraft&&referenceOnly)||!job)
  throw Error('A physically checked route is required; --refill-draft only admits old reference-plane openings pending native refill');
const viaMap=new Map(),vias=[];
const key=p=>`${p.x.toFixed(7)}:${p.y.toFixed(7)}`;
for(const t of row.traces)for(const p of t.route.filter(p=>p.route_type==='via')){
  if(!viaMap.has(key(p))){const name=`CONTROL_${net}_VIA_${vias.length}`;viaMap.set(key(p),name);
    vias.push({name,x:p.x,y:p.y,diameter:p.via_diameter,hole:p.via_hole_diameter,connectsTo:job.terminals[0].selector});}
}
const terminal=(p,layer)=>{
  const t=job.terminals.find(t=>Math.hypot(t.x-p.x,t.y-p.y)<1e-5&&t.layers.includes(layer));
  if(t)return t.selector;
  const contact=row.physicalCheck.verifiedTerminalPadContacts?.find(c=>c.layer===layer&&Math.hypot(c.x-p.x,c.y-p.y)<1e-7);
  if(job.fixedPadLaunchPolicy?.policy==='cc-launch-policy'&&contact&&job.terminals.some(t=>t.selector===contact.selector&&t.layers.includes(layer)))return contact.selector;
  throw Error(`Native branch has an unregistered endpoint at ${p.x},${p.y},${layer}`);
};
const segments=[];
for(const trace of row.traces){
  const r=trace.route;
  let i=0;
  while(i<r.length){
    if(r[i].route_type!=='wire'){i++;continue;}
    const start=i,layer=r[i].layer;
    while(i+1<r.length&&r[i+1].route_type==='wire'&&r[i+1].layer===layer)i++;
    const end=i,prev=r[start-1],next=r[end+1];
    const from=prev?.route_type==='via'?`${viaMap.get(key(prev))}.${prev.to_layer}`:terminal(r[start],layer);
    const to=next?.route_type==='via'?`${viaMap.get(key(next))}.${next.from_layer}`:terminal(r[end],layer);
    const points=r.slice(start,end+1).map(p=>[p.x,p.y]);
    if(points.length===1)points.push([...points[0]]);
    if(r.slice(start,end+1).some(p=>Math.abs(p.width-job.rule.widthMm)>1e-7))throw Error('Unexpected native width');
    segments.push({name:`CONTROL_${net}_SECTION_${segments.length}`,from,to,width:job.rule.widthMm,layer,points});
    i++;
  }
}
const path='manufacturing/control-routing/routed-surface.json';
let saved=[];try{saved=JSON.parse(readFileSync(path));}catch(error){if(error.code!=='ENOENT')throw error;}
saved=saved.filter(r=>r.net!==net);
saved.push({net,nativeCandidate:file,viaCount:vias.length,vias,segments,...(!row.physicalCheck.passed?{nativeRefillDraft:true}:{})});
writeFileSync(path,JSON.stringify(saved,null,2)+'\n');
console.log(`${net}: staged ${segments.length} surface sections and ${vias.length} unique vias; source build and refill verification pending`);
