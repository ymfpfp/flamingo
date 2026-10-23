// Compare physical geometry by stable logical names, independent of generated IDs.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assembledPlacements,layoutDigest,routeDigest,traceConnections} from '../../lib/layout-geometry.mjs';

const [beforeFile,afterFile,out]=process.argv.slice(2);
if(!out)throw Error('Usage: bun verify_coordinated_preservation.mjs before after output-directory');
const beforeBytes=readFileSync(beforeFile),afterBytes=readFileSync(afterFile);
const before=JSON.parse(beforeBytes),after=JSON.parse(afterBytes);
const sha=x=>createHash('sha256').update(x).digest('hex');
const allowed=new Set(['ASM2464PDX.PTXP1|net.ASM_PTXP1','ASM2464PDX.PTXN1|net.ASM_PTXN1',
 'ASM2464PDX.PTXP2|net.ASM_PTXP2','ASM2464PDX.PTXN2|net.ASM_PTXN2',
 'ASM2464PDX.PTXP3|net.ASM_PTXP3','ASM2464PDX.PTXN3|net.ASM_PTXN3',
 'CLOCK_REFCLK_P_PHY','CLOCK_REFCLK_N_PHY','PDN_BGA_Y16_TRACE','PDN_BGA_U17_TRACE',
 'PDN_BGA_U18_TRACE','PDN_BGA_AA18_TRACE']);
function routes(json){
 const names=traceConnections(json),map=new Map();
 for(const e of json.filter(e=>e.type==='pcb_trace')){
  const key=names.get(e.source_trace_id),a=map.get(key)??[];
  a.push(routeDigest(e.route));map.set(key,a);
 }
 return new Map([...map].map(([k,v])=>[k,v.sort()]));
}
const oldRoutes=routes(before),newRoutes=routes(after);
const routeChanges=[...new Set([...oldRoutes.keys(),...newRoutes.keys()])].filter(k=>
 JSON.stringify(oldRoutes.get(k))!==JSON.stringify(newRoutes.get(k))).map(k=>
 ({name:k,before:oldRoutes.get(k),after:newRoutes.get(k)}));
const geometryKeys=['shape','x','y','width','height','radius','ccw_rotation','layer','layers',
 'hole_diameter','outer_diameter','soldermask_margin','solderpaste_margin',
 'rect_pad_width','rect_pad_height','rect_ccw_rotation','outer_width','outer_height'];
function pads(json){
 const sc=new Map(json.filter(e=>e.type==='source_component').map(e=>[e.source_component_id,e.name]));
 const co=new Map(json.filter(e=>e.type==='pcb_component').map(e=>[e.pcb_component_id,sc.get(e.source_component_id)]));
 return new Map(json.filter(e=>e.type==='pcb_smtpad').map(e=>[
  `${co.get(e.pcb_component_id)}:${e.port_hints?.at(-1)??e.pcb_port_id}`,
  Object.fromEntries(geometryKeys.filter(k=>e[k]!==undefined).map(k=>[k,e[k]]))]));
}
const bp=pads(before),ap=pads(after);
const padChanges=[...new Set([...bp.keys(),...ap.keys()])].filter(k=>layoutDigest(bp.get(k))!==layoutDigest(ap.get(k)))
 .map(k=>({pad:k,before:bp.get(k),after:ap.get(k)}));
const sourceBefore=JSON.parse(readFileSync(`${out}/before-sources.json`,'utf8'));
const checks={
 allOtherRoutesPreserved:routeChanges.length===12&&routeChanges.every(c=>allowed.has(c.name)&&c.before?.length===1&&c.after?.length===1),
 allAssembledPlacementsPreserved:layoutDigest(assembledPlacements(before))===layoutDigest(assembledPlacements(after)),
 onlyTx3LandsChanged:padChanges.length===2&&padChanges.every(p=>['ASM2464PDX:Y15','ASM2464PDX:AA15'].includes(p.pad)),
 pcieConnectorRoutingSourcePreserved:sha(readFileSync('lib/pcie-connector-routing.ts'))===sourceBefore['lib/pcie-connector-routing.ts'],
 pcieRxRoutingSourcePreserved:sha(readFileSync('lib/pcie-rx-routing.ts'))===sourceBefore['lib/pcie-rx-routing.ts'],
 onlyOneViaRetired:before.filter(e=>e.type==='pcb_via').length-after.filter(e=>e.type==='pcb_via').length===1,
 allAssembledPartsOnTop:assembledPlacements(after).every(e=>e.layer==='top'),
};
const baseline=JSON.parse(readFileSync('manufacturing/layout-baseline.json','utf8'));
const authorized=routeChanges.map(c=>{
 const previous=baseline.traces.find(e=>e.connection===c.name);
 if(!previous)throw Error('No original preservation baseline for '+c.name);
 return {name:c.name,before:previous.digest,after:c.after[0],priorToThisRework:c.before[0],
  reason:'User-authorized coordinated TX3 BGA redesign, local TX1/TX2 and GND changes, and REFCLK bridge-via clearance adjustment; connector routing preserved.'};
});
// Record the earlier, already applied RX3 width correction exactly. That route
// is unchanged in this redesign; the old global baseline lacked its record.
const rxName='ASM2464PDX.PRXN3|net.ASM_PRXN3';
if(JSON.stringify(oldRoutes.get(rxName))!==JSON.stringify(newRoutes.get(rxName)))throw Error('RX3 changed unexpectedly');
const rxBaseline=baseline.traces.find(e=>e.connection===rxName);
authorized.push({name:rxName,before:rxBaseline.digest,after:newRoutes.get(rxName)[0],
 reason:'Records the prior user-authorized RX3 neck-width cleanup. RX3 copper is unchanged by the coordinated TX3 redesign.'});
const passed=Object.values(checks).every(Boolean);
const result={beforeSourceSha256:sha(beforeBytes),sourceSha256:sha(afterBytes),passed,checks,
 routeCountBefore:before.filter(e=>e.type==='pcb_trace').length,routeCountAfter:after.filter(e=>e.type==='pcb_trace').length,
 unchangedRouteCount:after.filter(e=>e.type==='pcb_trace').length-routeChanges.length,
 routeChanges,padChanges,
 scope:'Exact 1e-6 mm normalized physical-route comparison and pad/assembly checks. Electrical package and connector models are excluded.'};
writeFileSync(`${out}/preservation.json`,JSON.stringify(result,null,2)+'\n');
if(!passed)throw Error(JSON.stringify(checks));
writeFileSync('manufacturing/bridge-bga/tx3-rework.json',JSON.stringify({authorized:true,
 authorization:'User requested coordinated BGA redesign to make TX3 symmetric and rerun all-channel checks; leave the PCIe connector as is.',
 beforeSourceSha256:sha(beforeBytes),sourceSha256:sha(afterBytes),traceChanges:authorized,
 assemblyPreserved:true,connectorPreserved:true},null,2)+'\n');
console.log(JSON.stringify({passed,checks,changedRoutes:routeChanges.length,unchangedRoutes:result.unchangedRouteCount,padChanges:padChanges.map(p=>p.pad)}));
