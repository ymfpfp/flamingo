// Native fixed-layer routing between placed ground pads and plane-return vias.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {getSimpleRouteJsonFromCircuitJson,SOLVERS} from 'tscircuit';
import {circuitGraph} from '../lib/schematic-audit.mjs';
const dir='manufacturing/ground-returns/',out='dist/ground-returns/';mkdirSync(out,{recursive:true});
const raw=JSON.parse(readFileSync(process.argv[2]??out+'before.json')),j=raw.circuitJson??raw,g=circuitGraph(j);
const terminals=JSON.parse(readFileSync(dir+'terminals.json')),specs=JSON.parse(readFileSync(dir+'specs.json'));
// Same-net vias are transparent to the wire router, but their drills still
// need fabrication spacing. Check placed barrels before the expensive build.
const barrels=j.filter(e=>e.type==='pcb_via').map(v=>({name:v.pcb_via_id,x:v.x,y:v.y,drillDiameter:v.hole_diameter}));
for(const t of terminals.filter(t=>!t.existing)){
 for(const v of barrels){const gap=Math.hypot(t.x-v.x,t.y-v.y)-(t.drillDiameter+v.drillDiameter)/2;if(gap<.2-1e-5)throw Error(`${t.name} to ${v.name}: drill gap ${gap} mm < 0.2 mm`);}
 barrels.push(t);
}
const {simpleRouteJson:input}=getSimpleRouteJsonFromCircuitJson({circuitJson:j});
const sources=new Map(j.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
const point=selector=>{
 const [part,pin]=selector.split('.'),t=terminals.find(t=>t.name===part);
 if(t)return {x:t.x,y:t.y,layer:pin,pointId:selector,net:g.net(...t.selector.split('.'))};
 const sp=g.port(part,pin),p=j.find(e=>e.type==='pcb_port'&&e.source_port_id===sp.source_port_id);
 return {...p,layer:'top',pointId:p.pcb_port_id,net:g.net(part,pin)};
};
const added=terminals.filter(t=>!t.existing).map(t=>({type:'rect',center:{x:t.x,y:t.y},width:t.copperDiameter,height:t.copperDiameter,layers:['top','inner1','inner2','inner3','inner4','bottom'],connectedTo:[g.net(...t.selector.split('.'))]}));
const output=[];
for(const spec of specs){
 const a=point(spec.from),b=point(spec.to),net=a.net;
 if(net!==b.net)throw Error('Different nets '+spec.name);
 const bounds={minX:Math.min(a.x,b.x)-2,maxX:Math.max(a.x,b.x)+2,minY:Math.min(a.y,b.y)-2,maxY:Math.max(a.y,b.y)+2};
 const conn={name:spec.name,netConnectionName:net,width:spec.width,nominalTraceWidth:spec.width,pointsToConnect:[a,b].map(p=>({x:p.x,y:p.y,layer:spec.layer,pointId:p.pointId,...(p.pcb_port_id?{pcb_port_id:p.pcb_port_id}:{})}))};
 const obstacles=[...input.obstacles.filter(o=>!o.circuitJsonMetadata?.pcb_copper_pour_id),...added]
  .filter(o=>o.layers.includes(spec.layer)&&o.center.x+o.width/2>=bounds.minX&&o.center.x-o.width/2<=bounds.maxX&&o.center.y+o.height/2>=bounds.minY&&o.center.y-o.height/2<=bounds.maxY)
  .map(o=>({...o,layers:[spec.layer],connectedTo:o.connectedTo.some(id=>g.root(id)===net||id===a.pointId||id===b.pointId)?[net,spec.name]:o.connectedTo}));
 const traces=j.filter(e=>e.type==='pcb_trace').filter(t=>{const s=sources.get(t.source_trace_id);return s&&g.root(s.connected_source_port_ids[0]??s.connected_source_net_ids[0])!==net});
 const local={...input,outline:undefined,bounds,layerCount:6,minTraceWidth:spec.width,minTraceToPadEdgeClearance:.15,obstacles,connections:[conn],traces,buses:[{name:spec.name,connectionNames:[spec.name],traceWidth:spec.width,preferredLayer:spec.layer}]};
 const solver=new SOLVERS.BusLanesSolver(local,{smoothTuning:false,denseSearch:false}),start=performance.now();
 while(!solver.solved&&!solver.failed){solver.step();if(performance.now()-start>30000)throw Error(spec.name+': native route exceeded 30 seconds');if(solver.iterations%100===0)await new Promise(r=>setTimeout(r,0));}
 if(!solver.solved)throw Error(spec.name+': '+solver.error);
 let route=solver.traces[0].route;
 if(Math.hypot(route[0].x-a.x,route[0].y-a.y)>1e-5)route=[...route].reverse();
 if(route.some(p=>p.route_type!=='wire'||p.layer!==spec.layer))throw Error('Unexpected layer '+spec.name);
 output.push({name:spec.name,connection:spec.select,route:route.map(({route_type,x,y,layer,width})=>({route_type,x,y,layer,width}))});
 console.log(spec.name,route.length,'points');
}
writeFileSync(dir+'paths.json',JSON.stringify(output,null,2)+'\n');
writeFileSync(out+'native-result.json',JSON.stringify({solver:'tscircuit SOLVERS.BusLanesSolver',output},null,2)+'\n');
