// Direct grounded via-in-pad contacts replace only the authorized local GND
// fanout. This prepares a candidate; it does not modify circuit source files.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {circuitGraph} from '../lib/circuit-graph.mjs';
import {buildControlRoutingJobs,buildMultilayerControlInput} from '../lib/control-routing.mjs';
import {layoutDigest} from '../lib/layout-geometry.mjs';
import {SOLVERS} from 'tscircuit';

const input=process.argv[2] ?? 'dist/control-routing/final-audit.circuit.json';
const out='dist/control-routing/controls17/ground-rework/';
const python=process.env.PCIE_SI_PYTHON ?? 'python3';
mkdirSync(out,{recursive:true});
const raw=JSON.parse(readFileSync(input)),original=raw.circuitJson ?? raw;
const graph=circuitGraph(original);
const pins=['D4','F4','H4','L2','L4'];
const names=pins.map(pin=>`PDN_BGA_${pin}_TRACE`);
const sources=new Map(original.filter(o=>o.type==='source_trace').map(o=>[o.source_trace_id,o]));
const removed=original.filter(o=>o.type==='pcb_trace'&&names.includes(sources.get(o.source_trace_id)?.name));
if(removed.length!==5)throw Error('Expected exactly five authorized local ground traces');
const oldVia=original.filter(o=>o.type==='pcb_via'&&sources.get(o.source_trace_id)?.display_name==='PDN_BGA_H4 connectivity');
if(oldVia.length!==1)throw Error('Expected one shared H4 ground via');
const ids=new Set(removed.map(o=>o.pcb_trace_id));
const base=original.filter(o=>!(o.type==='pcb_trace'&&ids.has(o.pcb_trace_id))&&o!==oldVia[0]);
const ground=original.find(o=>o.type==='source_net'&&o.name==='GND');
const jobs=pins.map(pin=>{
  const sp=graph.port('ASM2464PDX',pin);
  if(graph.root(sp.source_port_id)!==graph.root(ground.source_net_id))throw Error('Ground rework selected a signal pin');
  const pp=original.find(o=>o.type==='pcb_port'&&o.source_port_id===sp.source_port_id);
  return {name:`GND_REWORK_${pin}`,terminals:[{...pp,selector:`ASM2464PDX.${pin}`,sourcePortId:sp.source_port_id}],
    rule:{widthMm:.1,clearanceMm:.1,maxLengthMm:10,reference:'GND'}};
});
let results=jobs.map(job=>{
  const p=job.terminals[0];
  return {net:job.name,solved:true,traces:[{type:'pcb_trace',pcb_trace_id:job.name,route:[
    {route_type:'wire',x:p.x,y:p.y,width:.1,layer:'top'},
    {route_type:'via',x:p.x,y:p.y,from_layer:'top',to_layer:'bottom',via_diameter:.25,via_hole_diameter:.15,
      layers:['top','inner1','inner2','inner3','inner4','bottom']},
    {route_type:'wire',x:p.x,y:p.y,width:.1,layer:'bottom'}]}]};
});
for(const [name,value]of Object.entries({'baseline.circuit.json':base,'jobs.json':jobs,'candidates.json':{results}}))
  writeFileSync(out+name,JSON.stringify(value));
const run=(...args)=>{const r=spawnSync(python,args,{encoding:'utf8'});if(r.error||r.status!==0)throw r.error??Error(r.stderr||r.stdout);console.log(r.stdout.trim());};
run('simulations/control-routing/prepare_obstacles.py',out+'baseline.circuit.json',out+'obstacles.json');
if(process.argv.includes('--native')) {
  const cover=JSON.parse(readFileSync(out+'obstacles.json'));
  cover.pourGeometrySha256=layoutDigest(base.filter(e=>e.type==='pcb_copper_pour'&&['top','bottom'].includes(e.layer)));
  cover.isolationGeometrySha256=layoutDigest(base.filter(e=>e.type==='pcb_trace'));
  const spec={name:'GND_LOCAL_REWORK',profile:'ground',rule:{widthMm:.1,clearanceMm:.15,maxLengthMm:50,reference:'GND'},
    terminals:jobs.map(j=>j.terminals[0].selector)};
  const job=buildControlRoutingJobs(base,{pourCover:cover,additionalNets:[spec]}).find(j=>j.name===spec.name);
  job.routingPaddingMm=12;
  const srj=buildMultilayerControlInput(job,[],{fullStack:true});
  const layerNames=['top','inner1','inner2','inner3','inner4','bottom'];
  srj.allowedLayers=layerNames;
  srj.connections=job.terminals.map((p,i)=>({name:jobs[i].name,netConnectionName:job.name,
    pointsToConnect:[{x:p.x,y:p.y,layer:'top',pcb_port_id:p.pcb_port_id}]}));
  srj.obstacles=srj.obstacles.map(o=>({...o,
    ...(o.circuitJsonMetadata?.source_component_name==='ASM2464PDX'?{componentId:'bridge'}:{}),
    connectedTo:o.connectedTo.includes(job.name)?[job.name,...jobs.map(j=>j.name)]:o.connectedTo}));
  const buses=jobs.map(j=>({busId:j.name,connectionNames:[j.name],direction:'left',allowedLayers:['inner1'],termination:{type:'plane',layer:'inner1'}}));
  srj.buses=buses;
  const solver=new SOLVERS.FanoutSolver(srj,{sourceComponentId:'bridge',traceWidth:.1,clearance:.15,
    defaultDirection:'left',
    viaDiameter:.25,viaHoleDiameter:.15,allowBlindAndBuriedVias:false,allowSameNetMerges:true,
    buses});
  const start=performance.now();
  while(!solver.solved&&!solver.failed){solver.step();if(performance.now()-start>60000)throw Error('Native ground fanout timed out');
    if(solver.iterations%20===0)await new Promise(r=>setTimeout(r,0));}
  if(!solver.solved)throw Error(solver.error??'Native ground fanout failed');
  const output=solver.getOutput();
  if(!output.validation.valid)throw Error('Native ground fanout validation failed');
  writeFileSync(out+'native-output.json',JSON.stringify(output));
  results=jobs.map(job=>({net:job.name,solved:true,traces:output.fanoutTraces.filter(t=>t.connection_name===job.name||t.connectionName===job.name)}));
  if(results.some(r=>!r.traces.length))throw Error('Native ground fanout omitted a pin');
  writeFileSync(out+'candidates.json',JSON.stringify({results}));
}
run('simulations/control-routing/check_acceptance.py',out+'baseline.circuit.json',out+'jobs.json',out+'candidates.json',out+'physical-audit.json',out+'obstacles.json');
const audit=JSON.parse(readFileSync(out+'physical-audit.json'));
if(!audit.passed)throw Error('Ground via-in-pad candidate failed physical screening; no source change');
const vias=jobs.map(job=>{const terminal=job.terminals[0],p=results.find(r=>r.net===job.name).traces.flatMap(t=>t.route).find(p=>p.route_type==='via');return {type:'pcb_via',pcb_via_id:job.name,x:p.x,y:p.y,
  hole_diameter:.15,outer_diameter:.25,layers:['top','inner1','inner2','inner3','inner4','bottom'],
  from_layer:'top',to_layer:'bottom',source_net_id:ground.source_net_id,pcb_port_ids:[],subcircuit_id:terminal.subcircuit_id};});
const addedTraces=results.flatMap(r=>r.traces.map(t=>({...t,source_trace_id:removed.find(o=>sources.get(o.source_trace_id).name===`PDN_BGA_${r.net.split('_').at(-1)}_TRACE`).source_trace_id})));
writeFileSync(out+'candidate.circuit.json',JSON.stringify([...base,...vias,...addedTraces]));
writeFileSync(out+'changes.json',JSON.stringify({applied:false,removedTraceNames:names,removedVia:oldVia[0],addedVias:vias,
  addedTraces,remainingChecks:['Native pour refill and full-stack copper clearance','Every affected ground pad reaches L2/L5',
    'Existing PCIe/USB geometry, isolation and ground reference','Native placement, shorts and PCB style']},null,2));
console.log('Prepared five direct GND via-in-pad contacts; source integration and native refill pending.');
