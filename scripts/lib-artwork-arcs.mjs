// Circular-arc fitting for vector artwork, in millimeters. A bulge is tan(sweep/4)
// and belongs to the starting vertex, matching Circuit JSON's BRep convention.
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function arcGeometry(start, end, bulge) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const chord = Math.hypot(dx, dy);
  const offset = (1 - bulge * bulge) / (4 * bulge);
  const center = {x: (start.x + end.x) / 2 - dy * offset, y: (start.y + end.y) / 2 + dx * offset};
  return {center, radius: chord * (1 + bulge * bulge) / (4 * Math.abs(bulge)), sweep: 4 * Math.atan(bulge)};
}
function lineError(points) {
  const a = points[0], b = points.at(-1), dx = b.x - a.x, dy = b.y - a.y, length = distance(a, b);
  if (length < 1e-10) return Infinity;
  return Math.max(...points.map(p => {
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/(length*length)));
    return distance(p,{x:a.x+t*dx,y:a.y+t*dy});
  }));
}
function circleFit(points, minimumRadius) {
  const a=points[0], b=points[Math.floor(points.length/2)], c=points.at(-1);
  const bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y;
  const det=2*(bx*cy-by*cx);
  if(Math.abs(det)<1e-12)return null;
  const bb=bx*bx+by*by,cc=cx*cx+cy*cy;
  const center={x:a.x+(bb*cy-cc*by)/det,y:a.y+(bx*cc-cx*bb)/det};
  const radius=distance(a,center);if(radius<minimumRadius)return null;
  const sign=Math.sign(det);let sweep=0,previous=Math.atan2(a.y-center.y,a.x-center.x),error=0;
  for(const p of points.slice(1)){
    const angle=Math.atan2(p.y-center.y,p.x-center.x);
    const step=Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
    if(step*sign < -1e-7)return null;
    sweep+=step;previous=angle;error=Math.max(error,Math.abs(distance(p,center)-radius));
  }
  if(Math.abs(sweep)>Math.PI/2+1e-7||Math.abs(sweep)<1e-7)return null;
  return {bulge:Math.tan(sweep/4),error};
}
export function fitArcs(points,{tolerance=.01,minimumRadius=0}={}) {
  points=points.filter((p,i)=>i===0||distance(p,points[i-1])>1e-10);
  if(points.length<2)return [];
  if(points.length===2)return [{start:points[0],end:points[1],bulge:0,error:0}];
  const start=points[0],end=points.at(-1);
  const error=lineError(points);
  if(error<=tolerance)return [{start,end,bulge:0,error}];
  const arc=circleFit(points,minimumRadius);
  if(arc&&arc.error<=tolerance)return [{start,end,...arc}];
  const middle=Math.floor(points.length/2);
  return [...fitArcs(points.slice(0,middle+1),{tolerance,minimumRadius}),...fitArcs(points.slice(middle),{tolerance,minimumRadius})];
}
export function fitRing(vertices,options={}) {
  const dense=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],n=Math.max(1,Math.ceil(distance(a,b)/.005));
    for(let j=0;j<n;j++)dense.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});
  }
  dense.push(dense[0]);
  return fitArcs(dense,options).map(s=>({...s.start,...(s.bulge?{bulge:s.bulge}:{})}));
}
export function reverseRing(vertices) {
  return [...vertices].reverse().map((p,i)=>{
    const b=vertices[(vertices.length-2-i+vertices.length)%vertices.length].bulge;
    return {x:p.x,y:p.y,...(b?{bulge:-b}:{})};
  });
}
export function ringSvg(vertices) {
  let d=`M ${vertices[0].x} ${-vertices[0].y}`;
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length];
    if(a.bulge){const {radius}=arcGeometry(a,b,a.bulge);d+=` A ${radius} ${radius} 0 ${Math.abs(a.bulge)>1?1:0} ${a.bulge<0?1:0} ${b.x} ${-b.y}`;}
    else d+=` L ${b.x} ${-b.y}`;
  }
  return d+' Z';
}
