type Point = {x:number; y:number};

// Extrude an authored guard centerline into a constant-width pour outline.
// This only constructs the polygon; native copper-pour solving applies every
// pad/trace clearance. Signal routing is independent of these outlines.
function guardOutline(points: Point[], width: number): Point[] {
  const normals = points.slice(1).map((p,i)=>{
    const dx=p.x-points[i].x,dy=p.y-points[i].y,length=Math.hypot(dx,dy);
    return {x:-dy/length,y:dx/length};
  });
  const side=(sign:number)=>points.map((p,i)=>{
    const a=normals[Math.max(0,i-1)],b=normals[Math.min(i,normals.length-1)];
    const scale=sign*width/2/(1+a.x*b.x+a.y*b.y);
    return {x:p.x+(a.x+b.x)*scale,y:p.y+(a.y+b.y)*scale};
  });
  return [...side(1),...side(-1).reverse()];
}

const band=(name:string,layers: Array<"top"|"bottom">,width:number,xy:number[][])=>({
  name,layers,nominalWidthMm:width,
  centerline:xy.map(([x,y])=>({x,y})),
  outline:guardOutline(xy.map(([x,y])=>({x,y})),width),
});

// Deliberate surface guard bands replace the large rectangular flood. Native
// clearances may taper a band at a fixed component or connector launch.
export const usbGuardBands = [
  band("SOUTH_BGA",["top","bottom"],.5,
    [[35.9,95.5],[36.8,95.5],[39.4,92.9],[40.3,92.9]]),
  band("NORTH",["top","bottom"],.5,[[37.8,105.45],[46.8,105.45]]),
  band("SOUTH_CONNECTOR",["top","bottom"],.6,
    [[45.2,93],[46.6,93]]),
  band("NORTH_CONNECTOR",["top","bottom"],.6,
    [[45.5,105.45],[45.5,104.3],[46.55,104.3]]),
  band("MIDDLE",["top"],.5,
    [[36.3,100],[38.4,100],[39.2,99.2],[39.2,98.6],[39.7,98.1],[40.8,98.1]]),
  band("MIDDLE",["bottom"],.6,
    [[38.9,98.4],[40.5,98.4],[40.9,98.8],[40.9,102.2],[40.5,102.6],[38.7,102.6]]),
  band("USB2_INNER",["bottom"],.5,[[40.7,95.7],[41.1,95.7],[41.1,97.1]]),
];

// Authored outer fence rows. Hole spacing stays below ASMedia's 40 mil
// (1.016 mm); every via joins both reference planes.
export const usbShieldFences = [
  [{x:36.85,y:95.5},{x:37.45,y:94.85},{x:38.1,y:94.2},
    {x:38.7,y:93.5},{x:39.4,y:92.9},{x:40.3,y:93.0}],
  [37.8,38.7,39.6,40.5,41.4,42.3,43.2,44.1,45,45.9,46.8].map(x=>({x,y:x===38.7||x===39.6?105.55:105.45})),
  [{x:45.5,y:93},{x:46.4,y:93}],
  [{x:45.5,y:105.2},{x:45.5,y:104.3},{x:46.35,y:104.3}],
  [{x:36.8,y:100},{x:37.6,y:100},{x:38.4,y:100},{x:38.95,y:99.45},
    {x:39.2,y:98.6},{x:39.85,y:98.1},{x:40.7,y:98.1}],
  [{x:39.2,y:98.6},{x:40.1,y:98.45},{x:40.9,y:98.8},{x:40.9,y:99.3},
    {x:40.9,y:100.3},{x:40.9,y:101.3},{x:40.9,y:102.3},
    {x:40.5,y:102.8},{x:39.6,y:102.6},{x:38.7,y:102.6}],
  [{x:40.9,y:95.7},{x:41,y:96.5}],
] as const;
