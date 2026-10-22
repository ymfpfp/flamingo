// Compare the final copper with the board before this authorized local pass.
// Only the exact ground/clock/power changes recorded in source may differ.
import{readFileSync,writeFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{assembledPlacements,layoutDigest,routeDigest,traceConnections}from'../lib/layout-geometry.mjs';
import{circuitGraph}from'../lib/circuit-graph.mjs';
import{checkAssemblyRework}from'../lib/assembly-rework.mjs';
import{runAllNetlistChecks,runAllPlacementChecks,checkSchematicPlacement,checkEachPcbPortConnectedToPcbTraces,checkSourceTracesHavePcbTraces}from'@tscircuit/checks';
const read=p=>JSON.parse(readFileSync(p)),out='dist/control-routing/controls17/',file=process.argv[2];
if(!file)throw Error('A built Circuit JSON is required');
const baseline=read('dist/control-routing/final-audit.circuit.json'),actual=read(file),failures=[];
const ground=read('manufacturing/control-routing/ground-rework.json'),clock=read('manufacturing/control-routing/clock-rework.json'),power=read('manufacturing/control-routing/power-via-rework.json');
const controls=read('manufacturing/control-routing/local-control-rework.json');
const changed=[...ground.changes,...clock.changes,...power.traceChanges,...controls.traceChanges],allowed=new Map(changed.map(r=>[r.name,r]));
const bc=traceConnections(baseline),ac=traceConnections(actual),traces=actual.filter(e=>e.type==='pcb_trace'),counts=new Map();
for(const t of traces){const k=ac.get(t.source_trace_id)+':'+routeDigest(t.route);counts.set(k,(counts.get(k)??0)+1)}
for(const t of baseline.filter(e=>e.type==='pcb_trace')){
 const name=bc.get(t.source_trace_id),a=allowed.get(name),before=routeDigest(t.route);
 const replacement=controls.replacedTraces.find(r=>r.name===name);
 if(replacement){
  if(before!==replacement.before)throw Error('Recorded original replacement is stale: '+name);
  for(const r of replacement.replacements){const key=r.name+':'+r.after,n=counts.get(key)??0;if(!n)failures.push('Missing exact authorized replacement: '+r.name);else counts.set(key,n-1);}
  continue;
 }
 if(a&&before!==a.before)throw Error('Recorded original trace is stale: '+name);
 const k=name+':'+(a?.after??before),n=counts.get(k)??0;
 if(!n)failures.push('Unpreserved original trace: '+name);else counts.set(k,n-1);
}
const shape=v=>layoutDigest({x:v.x,y:v.y,pad:v.outer_diameter,hole:v.hole_diameter,layers:v.layers});
const av=actual.filter(e=>e.type==='pcb_via'),near=(v,p)=>Math.hypot(v.x-p[0],v.y-p[1])<1e-6;
const retired=ground.retiredVias.map(v=>[v.x,v.y]);
const relocated=[...(ground.relocatedVias??[]),...power.changes,...(power.flashFeedRelocation?[power.flashFeedRelocation]:[])];
for(const v of baseline.filter(e=>e.type==='pcb_via')){
 if(retired.some(p=>near(v,p)))continue;
 const m=relocated.find(m=>near(v,m.before));
 const target=m?{...v,x:m.after[0],y:m.after[1],outer_diameter:m.afterPad??v.outer_diameter,hole_diameter:m.afterHole??v.hole_diameter}:v;
 if(!av.some(a=>shape(a)===shape(target)))failures.push('Unpreserved original via: '+v.pcb_via_id);
}
// Logical net identity at every retained/moved via must also remain unchanged.
function viaNets(json){
 const graph=circuitGraph(json),ports=new Map(json.filter(e=>e.type==='pcb_port').map(p=>[p.pcb_port_id,p]));
 const st=new Map(json.filter(e=>e.type==='source_trace').map(t=>[t.source_trace_id,t]));
 const pt=new Map(json.filter(e=>e.type==='pcb_trace').map(t=>[t.pcb_trace_id,t]));
 const names=new Map();for(const n of json.filter(e=>e.type==='source_net')){const r=graph.root(n.source_net_id);names.set(r,[...(names.get(r)??[]),n.name].sort())}
 return v=>{const s=st.get(v.source_trace_id??pt.get(v.pcb_trace_id)?.source_trace_id),id=v.source_net_id??s?.connected_source_port_ids[0]??s?.connected_source_net_ids[0]??v.pcb_port_ids?.map(p=>ports.get(p)?.source_port_id).find(Boolean);return JSON.stringify(names.get(graph.root(id))??[])};
}
const bn=viaNets(baseline),an=viaNets(actual);
for(const v of baseline.filter(e=>e.type==='pcb_via')){
 if(retired.some(p=>near(v,p)))continue;
 const m=relocated.find(m=>near(v,m.before)),p=m?.after??[v.x,v.y];const a=av.find(a=>near(a,p));
 if(a&&bn(v)!==an(a))failures.push('Via changed electrical net: '+v.pcb_via_id);
}
const components=read('manufacturing/control-routing/component-rework.json');
const placements=assembledPlacements(actual),assemblyFailures=checkAssemblyRework(placements,layoutDigest(assembledPlacements(baseline)),components);
const assemblyPreserved=!assemblyFailures.length;
failures.push(...assemblyFailures);
const preservation={passed:!failures.length,failures,authorizedChangedTraces:changed.map(r=>r.name),authorizedReplacedTraces:controls.replacedTraces,retiredGroundVias:ground.retiredVias,relocatedPowerVias:relocated,authorizedComponentMoves:components.changes,allOtherOldTracesPreserved:!failures.some(f=>/trace|replacement/i.test(f)),allOtherOldViasPreserved:!failures.some(f=>f.includes('via')),assemblyPreserved,allTop:placements.every(p=>p.layer==='top'),assembledCount:placements.length,traceCount:traces.length,viaCount:av.length,sourceSha256:createHash('sha256').update(readFileSync(file)).digest('hex')};
writeFileSync(out+'final-preservation.json',JSON.stringify(preservation,null,2)+'\n');
const native={netlist:await runAllNetlistChecks(actual),placement:await runAllPlacementChecks(actual),schematic:checkSchematicPlacement(actual),ports:checkEachPcbPortConnectedToPcbTraces(actual),missing:checkSourceTracesHavePcbTraces(actual)};
native.sourceSha256=preservation.sourceSha256;
// CC1/CC2 are now requested: no signal connectivity finding is deferred.
native.unexpectedConnectivity=[...native.ports,...native.missing];
writeFileSync(out+'final-native-connectivity.json',JSON.stringify(native,null,2)+'\n');
console.log(`Preservation ${preservation.passed?'PASS':'FAIL'}; native netlist ${native.netlist.length}, placement ${native.placement.length}, schematic ${native.schematic.length}; open port findings ${native.ports.length}, missing source traces ${native.missing.length}`);
if(!preservation.passed||native.netlist.length||native.placement.length||native.schematic.length||native.unexpectedConnectivity.length)process.exitCode=1;
