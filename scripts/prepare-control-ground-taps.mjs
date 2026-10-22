// Explicit short GND joins reuse existing grounded pads and return vias.
// These joins lie on existing local ground corridors; no router is implemented.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {circuitGraph} from '../lib/circuit-graph.mjs';

const out='dist/control-routing/controls17/ground-taps/';
const input=process.argv[2] ?? 'dist/control-routing/final-audit.circuit.json';
const python=process.env.PCIE_SI_PYTHON ?? 'python3';
mkdirSync(out,{recursive:true});
const raw=JSON.parse(readFileSync(input)),original=raw.circuitJson ?? raw;
const graph=circuitGraph(original),ground=original.find(e=>e.type==='source_net'&&e.name==='GND');
const taps=[['D4','E4'],['F4','E4'],['H4','J4'],['L4','J4'],['L2','K2']];
const sources=new Map(original.filter(e=>e.type==='source_trace').map(s=>[s.source_trace_id,s]));
const names=taps.map(([pin])=>`PDN_BGA_${pin}_TRACE`);
const removed=original.filter(e=>e.type==='pcb_trace'&&names.includes(sources.get(e.source_trace_id)?.name));
const oldVia=original.filter(e=>e.type==='pcb_via'&&sources.get(e.source_trace_id)?.display_name==='PDN_BGA_H4 connectivity');
if(removed.length!==5||oldVia.length!==1)throw Error('Authorized GND rework baseline mismatch');
const ids=new Set(removed.map(t=>t.pcb_trace_id));
const base=original.filter(e=>!(e.type==='pcb_trace'&&ids.has(e.pcb_trace_id))&&e!==oldVia[0]);
const port=pin=>{
  const sp=graph.port('ASM2464PDX',pin),pp=original.find(e=>e.type==='pcb_port'&&e.source_port_id===sp.source_port_id);
  if(graph.root(sp.source_port_id)!==graph.root(ground.source_net_id))throw Error('Selected tap is not GND');
  return {...pp,selector:`ASM2464PDX.${pin}`,sourcePortId:sp.source_port_id};
};
const jobs=taps.map(([pin,to])=>({name:`GND_TAP_${pin}`,terminals:[port(pin),port(to)],
  rule:{widthMm:.1,clearanceMm:.1,maxLengthMm:5,reference:'GND'}}));
const results=jobs.map(job=>({net:job.name,solved:true,traces:[{type:'pcb_trace',pcb_trace_id:job.name,
  source_trace_id:removed.find(t=>sources.get(t.source_trace_id).name===`PDN_BGA_${job.name.split('_').at(-1)}_TRACE`).source_trace_id,
  route:job.terminals.map(p=>({route_type:'wire',x:p.x,y:p.y,width:.1,layer:'top'}))}]}));
for(const [name,value]of Object.entries({'baseline.circuit.json':base,'jobs.json':jobs,'candidates.json':{results}}))
  writeFileSync(out+name,JSON.stringify(value));
const run=(...args)=>{const r=spawnSync(python,args,{encoding:'utf8'});if(r.error||r.status!==0)throw r.error??Error(r.stderr||r.stdout);console.log(r.stdout.trim());};
run('simulations/control-routing/prepare_obstacles.py',out+'baseline.circuit.json',out+'obstacles.json');
run('simulations/control-routing/check_acceptance.py',out+'baseline.circuit.json',out+'jobs.json',out+'candidates.json',out+'physical-audit.json',out+'obstacles.json');
const audit=JSON.parse(readFileSync(out+'physical-audit.json'));
if(!audit.passed)throw Error('Ground tap failed physical checks; no source change');
writeFileSync(out+'candidate.circuit.json',JSON.stringify([...base,...results.flatMap(r=>r.traces)]));
writeFileSync(out+'changes.json',JSON.stringify({applied:false,taps,removedTraceNames:names,removedVia:oldVia[0],
  addedTraces:results.flatMap(r=>r.traces),newViaCount:0,
  remainingChecks:['Native source integration and refill','Every affected ground pad reaches L2/L5',
    'PCIe/USB preservation, isolation, reference and fabrication clearance','Native placement, shorts and style']},null,2));
console.log('Five short GND taps passed screening; no new vias.');
