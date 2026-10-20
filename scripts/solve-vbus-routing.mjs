// Use the native fixed-layer solver; this script defines constraints, not a router.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {getSimpleRouteJsonFromCircuitJson,SOLVERS} from 'tscircuit';
import {circuitGraph} from '../lib/schematic-audit.mjs';
const dir='manufacturing/vbus-routing/',out='dist/vbus-routing/';mkdirSync(out,{recursive:true});
const raw=JSON.parse(readFileSync(process.argv[2]??out+'before.circuit.json')),j=raw.circuitJson??raw,g=circuitGraph(j);
const terminals=JSON.parse(readFileSync(dir+'terminals.json')),specs=JSON.parse(readFileSync(dir+'specs.json'));
const {simpleRouteJson:input}=getSimpleRouteJsonFromCircuitJson({circuitJson:j});
const source=new Map(j.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
const point=s=>{const [part,pin]=s.split('.'),t=terminals.find(t=>t.name===part);if(t)return {x:t.x,y:t.y,layer:pin,pointId:s,net:g.net(...t.selector.split('.'))};const sp=g.port(part,pin),p=j.find(e=>e.type==='pcb_port'&&e.source_port_id===sp.source_port_id);return {...p,layer:'top',pointId:p.pcb_port_id,net:g.net(part,pin)};};
const added=terminals.map(t=>({type:'rect',center:{x:t.x,y:t.y},width:t.copperDiameter,height:t.copperDiameter,layers:['top','inner1','inner2','inner3','inner4','bottom'],connectedTo:[g.net(...t.selector.split('.'))]}));
const output=[],native=[];
for(const spec of specs){
 const a=point(spec.from),b=point(spec.to),net=a.net,bounds={minX:Math.min(a.x,b.x)-3,maxX:Math.max(a.x,b.x)+3,minY:Math.min(a.y,b.y)-3,maxY:Math.max(a.y,b.y)+3};
 if(net!==b.net)throw Error('Different nets '+spec.name);
 if(Math.hypot(a.x-b.x,a.y-b.y)<1e-8){output.push({name:spec.name,connection:spec.select,route:[a,b].map(p=>({route_type:'wire',x:p.x,y:p.y,width:spec.width,layer:spec.layer}))});continue;}
 const conn={name:spec.name,netConnectionName:net,width:spec.width,nominalTraceWidth:spec.width,pointsToConnect:[a,b].map(p=>({x:p.x,y:p.y,layer:spec.layer,pointId:p.pointId,...(p.pcb_port_id?{pcb_port_id:p.pcb_port_id}:{})}))};
 let obstacles=[...input.obstacles.filter(o=>!o.circuitJsonMetadata?.pcb_copper_pour_id),...added].filter(o=>o.layers.includes(spec.layer)&&o.center.x+o.width/2>=bounds.minX&&o.center.x-o.width/2<=bounds.maxX&&o.center.y+o.height/2>=bounds.minY&&o.center.y-o.height/2<=bounds.maxY).map(o=>({...o,layers:[spec.layer],connectedTo:o.connectedTo.some(id=>g.root(id)===net||id===a.pointId||id===b.pointId)?[net,spec.name]:o.connectedTo}));
 const fixed=j.filter(e=>e.type==='pcb_trace').filter(t=>{const s=source.get(t.source_trace_id);return s&&g.root(s.connected_source_port_ids[0]??s.connected_source_net_ids[0])!==net});
 const traces=[...fixed,...native.filter(t=>t.net!==net).map(t=>t.trace)];
 const local={...input,outline:undefined,bounds,layerCount:6,minTraceWidth:spec.width,minTraceToPadEdgeClearance:.205,obstacles,connections:[conn],traces,buses:[{name:spec.name,connectionNames:[spec.name],traceWidth:spec.width,preferredLayer:spec.layer}]};
 const solver=new SOLVERS.BusLanesSolver(local,{smoothTuning:false,denseSearch:false});const start=performance.now();
 while(!solver.solved&&!solver.failed){solver.step();if(performance.now()-start>30000)throw Error(spec.name+': native route exceeded 30 seconds');if(solver.iterations%100===0)await new Promise(r=>setTimeout(r,0));}
 if(!solver.solved){writeFileSync(out+'partial.json',JSON.stringify(output,null,2));throw Error(spec.name+': '+solver.error);}
 const trace=solver.traces[0];let route=trace.route;if(Math.hypot(route[0].x-a.x,route[0].y-a.y)>1e-5)route=[...route].reverse();
 if(route.some(p=>p.route_type!=='wire'||p.layer!==spec.layer))throw Error('Unexpected layer '+spec.name);
 if(spec.select===spec.to)route=[...route].reverse();
 output.push({name:spec.name,connection:spec.select,route:route.map(({route_type,x,y,layer,width})=>({route_type,x,y,layer,width}))});native.push({net,trace});console.log(spec.name,route.length,'points');
}
writeFileSync(dir+'paths.json',JSON.stringify(output,null,2)+'\n');writeFileSync(out+'native-result.json',JSON.stringify({solver:'tscircuit SOLVERS.BusLanesSolver',output},null,2));
