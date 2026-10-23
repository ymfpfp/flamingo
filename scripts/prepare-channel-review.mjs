// Extract emitted high-speed geometry. This does not route or change the board.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {circuitGraph} from '../lib/circuit-graph.mjs';
import {usb4Contacts} from '../lib/usb4-routing';
import {pcieTxContacts} from '../lib/pcie-tx-routing';
import {pcieRxContacts} from '../lib/pcie-rx-routing';
import {auditUsb4Routing} from '../tests/audits/usb4-routing-audit';
import {auditPcieTxRouting} from '../tests/audits/pcie-tx-routing-audit';
import {auditPcieRxRouting} from '../tests/audits/pcie-rx-routing-audit';
import {auditBridgeClockRouting} from '../tests/audits/bridge-clock-routing-audit';
const input=process.argv[2]??'dist/si-channel-review/board.circuit.json',out=process.argv[3]??'dist/si-channel-review';
mkdirSync(out,{recursive:true});
const raw=readFileSync(input),j=JSON.parse(raw),sha=createHash('sha256').update(raw).digest('hex');
const graph=circuitGraph(j),st=new Map(j.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
const traces=j.filter(e=>e.type==='pcb_trace'),vias=j.filter(e=>e.type==='pcb_via');
const gnd=j.find(e=>e.type==='source_net'&&e.name==='GND'),groundRoot=graph.root(gnd.source_net_id);
const traceRoot=id=>{const t=st.get(id);const ids=[...(t?.connected_source_port_ids??[]),...(t?.connected_source_net_ids??[])];return ids.length?graph.root(ids[0]):null;};
const viaRoot=v=>v.source_net_id?graph.root(v.source_net_id):traceRoot(v.source_trace_id??traces.find(t=>t.pcb_trace_id===v.pcb_trace_id)?.source_trace_id);
// Autorouted returns carry a source_trace_id rather than source_net_id.
// Both reference planes must connect through the same return-via barrel.
const groundVias=vias.filter(v=>viaRoot(v)===groundRoot&&['inner1','inner4'].every(l=>v.layers.includes(l)));
const gndPlanes=j.filter(e=>e.type==='pcb_copper_pour'&&e.source_net_id&&graph.root(e.source_net_id)===groundRoot);
const sc=new Map(j.filter(e=>e.type==='source_component').map(e=>[e.name,e]));
const pos=(part,pin)=>{const p=graph.port(part,pin);const pcb=j.find(e=>e.type==='pcb_port'&&e.source_port_id===p.source_port_id);if(!pcb)throw Error('Missing port');return pcb;};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pads=p=>j.filter(e=>['pcb_smtpad','pcb_plated_hole'].includes(e.type)&&e.pcb_port_id===p.pcb_port_id);
function oriented(trace,start){
  let route=trace.route;
  if(distance(route[0],start)>1e-4){if(distance(route.at(-1),start)>1e-4)throw Error('Route endpoint mismatch');route=[...route].reverse();}
  const physicalVias=route.filter(p=>p.route_type==='via').map(p=>{
    const matches=vias.filter(v=>v.pcb_trace_id===trace.pcb_trace_id&&distance(v,p)<1e-5);
    if(matches.length!==1)throw Error('Missing physical via');
    const v=matches[0];return {...v,nearestGroundViaMm:Math.min(...groundVias.map(g=>distance(g,v))),
      nearestGroundVias:groundVias.map(g=>({...g,distanceMm:distance(g,v)})).sort((a,b)=>a.distanceMm-b.distanceMm).slice(0,4)};
  });
  const segments=[];
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    if(a.route_type==='wire'&&b.route_type==='wire'&&a.layer===b.layer&&distance(a,b)>1e-9)
      segments.push({from:{x:a.x,y:a.y},to:{x:b.x,y:b.y},layer:a.layer,widthMm:a.width,lengthMm:distance(a,b)});
  }
  return {traceId:trace.pcb_trace_id,sourceName:st.get(trace.source_trace_id)?.name,route,segments,vias:physicalVias,
    lengthMm:segments.reduce((s,p)=>s+p.lengthMm,0),neckLengthMm:segments.filter(s=>s.widthMm<.1).reduce((s,p)=>s+p.lengthMm,0)};
}
function routeBetween(start,end){
  const matches=traces.filter(t=>[start,end].every(p=>[t.route[0],t.route.at(-1)].some(q=>distance(p,q)<1e-4)));
  if(matches.length!==1)throw Error('Missing/ambiguous endpoint route');return oriented(matches[0],start);
}
const channels=[];
for(const pair of ['TX1','TX2','RX1','RX2']){
  const conductors=['P','N'].map(pol=>{
    const c=usb4Contacts.find(c=>c.name===`${pair}_${pol}`),start=pos('ASM2464PDX',c.ball),end=pos('USBC',c.contact);
    const cap=`C_USB_${c.name}`,clamp=`D_USB_${c.name}`,shunt=`R_USB_${c.name}`;
    const starts=[start,pos(clamp,'pin1'),pos(cap,'pin1'),pos(shunt,'pin1')];
    const stages=['PHY_A','PHY_B','CON_A','CON_B'].map((stage,i)=>{
      const matches=traces.filter(t=>st.get(t.source_trace_id)?.name===`USB4_${c.name}_${stage}`);
      if(matches.length!==1)throw Error('Incomplete USB channel');return oriented(matches[0],starts[i]);
    });
    return {polarity:pol,ball:c.ball,connectorContact:c.contact,start,end,startPads:pads(start),endPads:pads(end),stages,
      components:[{kind:'esd',component:sc.get(clamp),signalPads:pads(pos(clamp,'pin1')),groundPads:pads(pos(clamp,'pin2'))},
        {kind:'series-capacitor',component:sc.get(cap),pads:[...pads(pos(cap,'pin1')),...pads(pos(cap,'pin2'))]},
        {kind:'shunt-resistor',component:sc.get(shunt),signalPads:pads(pos(shunt,'pin1')),groundPads:pads(pos(shunt,'pin2'))}]};
  });
  channels.push({name:`USB4_${pair}`,bus:'USB4',direction:pair.startsWith('TX')?'TX':'RX',nyquistGHz:10,conductors});
}
const txSlots=[['B14','B15'],['B19','B20'],['B23','B24'],['B27','B28']];
for(const c of pcieTxContacts){
  const conductors=['P','N'].map((pol,i)=>{
    const ball=i===0?c.positive:c.negative,start=pos('ASM2464PDX',ball),end=pos('PCIe',txSlots[c.lane][i]),cap=`C_TX${c.lane}_${pol}`;
    return {polarity:pol,ball,connectorContact:txSlots[c.lane][i],start,end,startPads:pads(start),endPads:pads(end),
      stages:[routeBetween(start,pos(cap,'pin1')),routeBetween(pos(cap,'pin2'),end)],
      components:[{kind:'series-capacitor',component:sc.get(cap),pads:[...pads(pos(cap,'pin1')),...pads(pos(cap,'pin2'))]}]};
  });channels.push({name:`PCIE_TX${c.lane}`,bus:'PCIe',direction:'TX',nyquistGHz:8,conductors});
}
for(const c of pcieRxContacts){
  const conductors=['P','N'].map((pol,i)=>{
    const ball=i===0?c.positive:c.negative,start=pos('ASM2464PDX',ball),end=pos('PCIe',c.slot[i]);
    return {polarity:pol,ball,connectorContact:c.slot[i],start,end,startPads:pads(start),endPads:pads(end),stages:[routeBetween(start,end)],components:[]};
  });channels.push({name:`PCIE_RX${c.lane}`,bus:'PCIe',direction:'RX',nyquistGHz:8,conductors});
}
for(const c of channels)for(const p of c.conductors){
  p.lengthMm=p.stages.reduce((s,t)=>s+t.lengthMm,0);p.neckLengthMm=p.stages.reduce((s,t)=>s+t.neckLengthMm,0);
  p.viaCount=p.stages.reduce((s,t)=>s+t.vias.length,0);
}
const audits={usb:auditUsb4Routing(j),tx:auditPcieTxRouting(j),rx:auditPcieRxRouting(j),clocks:auditBridgeClockRouting(j)};
if(Object.values(audits).some(a=>!a.passed))throw Error('Routing geometry failed');
const referenceClock={audit:audits.clocks,conductors:['P','N'].map(pol=>{
  const start=pos('ASM2464PDX',`REFCLK_${pol}0`),end=pos('PCIe',`REFCLK_${pol}`),resistor=`R_PCIE_REFCLK_${pol}`;
  return {polarity:pol,start,end,startPads:pads(start),endPads:pads(end),component:sc.get(resistor),
    stages:[routeBetween(start,pos(resistor,'pin1')),routeBetween(pos(resistor,'pin2'),end)]};
}),qualification:'Geometry and nominal impedance only. Loaded driver behavior, clock jitter and package/card clock models remain open.'};
const baseline=JSON.parse(readFileSync('dist/board.circuit.json'));
const types=[...new Set([...j,...baseline].map(e=>e.type))];
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const perTypeIdentical=types.every(t=>JSON.stringify(canonical(j.filter(e=>e.type===t)))===JSON.stringify(canonical(baseline.filter(e=>e.type===t))));
const result={sourceFile:input,sourceSha256:sha,units:'mm',stackup:JSON.parse(readFileSync('manufacturing/stackup/selected.json')),
  sameElementsAsPriorReview:perTypeIdentical,priorReviewSha256:createHash('sha256').update(readFileSync('dist/board.circuit.json')).digest('hex'),
  note:'Full geometry inventory and passive-model input. No electromagnetic solution is implied. Port pads are PCB endpoints; package and connector internals are outside this geometry.',
  channels,audits,referenceClock,groundPlanes:gndPlanes,groundVias,
  unresolved:['Factory cross section and frequency-dependent laminate/roughness data','Finished via construction and retained inner pads',
    'ASM2464PDX package and TX/RX IBIS-AMI models','GT-USB-7087B 4-port/through/crosstalk model with reference planes',
    'X1618WVS-164-9TV30 PCIe connector multiport S-parameters','USB4 receive capacitor wideband model',
    'Capacitor/ESD models to at least 12 GHz, preferably 20 GHz','Validated 3D extraction of BGA/via/cap/connector launches',
    'PCIe endpoint/card channel and USB cable/partner models for complete end-to-end eye/BER assessment',
    'Loaded REFCLK driver/receiver and jitter models']};
writeFileSync(`${out}/geometry.json`,JSON.stringify(result,null,2)+'\n');
writeFileSync(`${out}/field-solver-handoff.json`,JSON.stringify({...result,boardContext:j.filter(e=>['pcb_board','pcb_trace','pcb_via','pcb_smtpad','pcb_plated_hole','pcb_hole','pcb_cutout','pcb_copper_pour'].includes(e.type))},null,2)+'\n');
console.log(JSON.stringify({sourceSha256:sha,sameElementsAsPriorReview:perTypeIdentical,channels:channels.map(c=>({name:c.name,lengthMm:c.conductors.map(p=>p.lengthMm),viaCount:c.conductors.map(p=>p.viaCount)}))},null,2));
