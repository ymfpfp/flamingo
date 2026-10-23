// Create acceptance inputs from the CURRENT policy and actual board terminals.
// Historical routing-search jobs can predate approved layers and launch rules.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {circuitGraph} from '../lib/circuit-graph.mjs';
import {controlNets,controlProfiles,controlRoutingPolicy} from '../lib/control-routing-config.mjs';
const file=process.argv[2]??'dist/board.circuit.json',raw=readFileSync(file),board=JSON.parse(raw);
const graph=circuitGraph(board),out=process.argv[3]??'dist/first-try-review';
mkdirSync(out,{recursive:true});
const jobs=controlNets.map(spec=>{
  const terminals=spec.terminals.map(selector=>{
    const [part,pin]=selector.split('.'),p=graph.port(part,pin);
    const pp=board.find(e=>e.type==='pcb_port'&&e.source_port_id===p.source_port_id);
    if(!pp)throw Error('Missing physical terminal: '+selector);
    return {...pp,selector,sourcePortId:p.source_port_id};
  });
  if(terminals.some(t=>graph.root(t.sourcePortId)!==graph.root(terminals[0].sourcePortId)))throw Error('Different nets: '+spec.name);
  return {name:spec.name,profile:spec.profile,rule:controlProfiles[spec.profile],terminals,
    allowedSignalLayers:controlRoutingPolicy.authoredSignalLayersByNet[spec.name]??controlRoutingPolicy.allowedSignalLayers,
    ...(controlRoutingPolicy.fixedPadLaunchPolicies[spec.name]?{fixedPadLaunchPolicy:controlRoutingPolicy.fixedPadLaunchPolicies[spec.name]}:{})};
});
writeFileSync(`${out}/control-jobs.json`,JSON.stringify(jobs,null,2)+'\n');
writeFileSync(`${out}/control-job-provenance.json`,JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),
  policySha256:createHash('sha256').update(JSON.stringify({controlNets,controlProfiles,controlRoutingPolicy})).digest('hex'),
  note:'Acceptance inventory only. No routing, clearance changes or new policy exemptions.'},null,2)+'\n');
console.log('Prepared current acceptance policy for '+jobs.length+' control nets.');
