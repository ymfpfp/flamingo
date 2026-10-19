import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import SVGPathCommander from "svg-path-commander";
import {pcb_silkscreen_graphic} from "circuit-json";
import {strokeArc,transformArcRing} from "../lib/arc-silkscreen";
import {flamingoSilkscreen} from "../lib/flamingo-silkscreen";
import {tsMarkSilkscreen} from "../lib/ts-mark-silkscreen";
import {arcGeometry,distance} from "../scripts/lib-artwork-arcs.mjs";
import flamingo from "../assets/artwork/flamingo-paths.json";

function signedArea(vertices){
 return vertices.reduce((area,a,i)=>{
  const b=vertices[(i+1)%vertices.length];
  let contribution=(a.x*b.y-a.y*b.x)/2;
  if(a.bulge){const {radius,sweep}=arcGeometry(a,b,a.bulge);contribution+=radius**2*(sweep-Math.sin(sweep))/2;}
  return area+contribution;
 },0);
}
function segmentDistance(p,segment){
 const {start:a,end:b,bulge}=segment;
 if(!bulge){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}
 const {center,radius,sweep}=arcGeometry(a,b,bulge);
 const alpha=Math.atan2(p.y-center.y,p.x-center.x)-Math.atan2(a.y-center.y,a.x-center.x);
 const delta=Math.atan2(Math.sin(alpha),Math.cos(alpha))*Math.sign(sweep);
 return delta>=-1e-8&&delta<=Math.abs(sweep)+1e-8?Math.abs(distance(p,center)-radius):Math.min(distance(p,a),distance(p,b));
}

test("flamingo arcs follow the independent Bezier source within 0.01 mm",()=>{
 const svg=readFileSync(new URL("../assets/artwork/flamingo.svg",import.meta.url),"utf8");
 let maximumError=0;
 for(const [,id,d] of svg.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)){
  const fitted=flamingo.paths.find(p=>p.id===id).segments;
  let previous,first;
  for(const segment of new SVGPathCommander(d).toAbsolute().segments){
   const command=segment[0];
   if(command==="M"){previous={x:segment[1],y:segment[2]};first=previous;continue;}
   const end=command==="C"?{x:segment[5],y:segment[6]}:command==="Z"?first:{x:segment[1],y:segment[2]};
   for(let i=0;i<=100;i++){
    const t=i/100,u=1-t;
    const x=command==="C"?u**3*previous.x+3*u*u*t*segment[1]+3*u*t*t*segment[3]+t**3*end.x:previous.x*u+end.x*t;
    const y=command==="C"?u**3*previous.y+3*u*u*t*segment[2]+3*u*t*t*segment[4]+t**3*end.y:previous.y*u+end.y*t;
    const p={x:(x-280)*.045,y:(572-y)*.045};
    maximumError=Math.max(maximumError,Math.min(...fitted.map(s=>segmentDistance(p,s))));
   }
   previous=end;
  }
 }
 assert.ok(maximumError<=.0101,`Maximum fit error ${maximumError} mm`);
});

test("every flamingo stroke has concentric arc sides, 0.25 mm width, and round caps",()=>{
 for(const segment of flamingo.paths.flatMap(p=>p.segments)){
  const vertices=strokeArc(segment,.25).outer_ring.vertices;
  const length=segment.bulge?(()=>{const {radius,sweep}=arcGeometry(segment.start,segment.end,segment.bulge);return radius*Math.abs(sweep);})():distance(segment.start,segment.end);
  const expectedArea=.25*length+Math.PI*.125**2;
  assert.ok(Math.abs(signedArea(vertices)+expectedArea)<1e-7);
  assert.equal(vertices.filter(p=>Math.abs(p.bulge??0)===1).length,2);
  const moved=transformArcRing(vertices,{pcbX:42,pcbY:49,pcbRotation:130}).vertices;
  assert.ok(Math.abs(signedArea(moved)-signedArea(vertices))<1e-7);
 }
});

test("badge uses four exact 1.2 mm corner arcs and an exact circular knockout",()=>{
 const graphic=tsMarkSilkscreen({pcbX:25,pcbY:46})[0];
 const outer=graphic.brep_shape.outer_ring.vertices;
 assert.equal(outer.length,8);assert.equal(outer.filter(p=>p.bulge).length,4);
 outer.forEach((p,i)=>{if(p.bulge)assert.ok(Math.abs(arcGeometry(p,outer[(i+1)%8],p.bulge).radius-1.2)<1e-10);});
 assert.ok(signedArea(outer)<0);
 const dot=graphic.brep_shape.inner_rings[0].vertices;
 assert.equal(dot.length,2);assert.ok(dot.every(p=>p.bulge===1));
 const first=arcGeometry(dot[0],dot[1],1),second=arcGeometry(dot[1],dot[0],1);
 assert.ok(distance(first.center,second.center)<1e-10);
 assert.ok(signedArea(dot)>0);
 assert.ok(graphic.brep_shape.inner_rings.every(r=>signedArea(r.vertices)>0));
});

test("artwork remains valid BRep geometry and SVG preview retains true arc commands",()=>{
 for(const graphic of [...flamingoSilkscreen({pcbX:42,pcbY:49,pcbRotation:130}),...tsMarkSilkscreen({pcbX:25,pcbY:46})])pcb_silkscreen_graphic.parse(graphic);
 for(const name of ["flamingo-arcs.svg","ts-mark.svg"]){
  const svg=readFileSync(new URL(`../assets/artwork/${name}`,import.meta.url),"utf8");
  assert.match(svg,/ A /);
 }
});
