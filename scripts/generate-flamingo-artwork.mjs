import {readFileSync, writeFileSync} from "node:fs";
import SVGPathCommander from "svg-path-commander";
import {fitArcs, arcGeometry} from "./lib-artwork-arcs.mjs";

// Preserve the editable Bezier trace, fitting the PCB centerlines with true
// circular arcs. Sampling is only used to measure the 0.01 mm fit tolerance.
const source = readFileSync(new URL("../assets/artwork/flamingo.svg", import.meta.url), "utf8");
const scale = 17.1 / 380;
const paths = [...source.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)].map(([, id, d]) => {
  const path = new SVGPathCommander(d).toAbsolute();
  const segments=[];
  let current, start;
  for(const command of path.segments){
    if(command[0]==="M"){current={x:command[1],y:command[2]};start=current;continue;}
    const curve=new SVGPathCommander(`M ${current.x} ${current.y} ${command[0]==="Z"?`L ${start.x} ${start.y}`:command.join(" ")}`);
    const length=curve.getTotalLength(),count=Math.max(2,Math.ceil(length*scale/.005));
    const points=Array.from({length:count+1},(_,i)=>{
      const p=curve.getPointAtLength(length*i/count);
      return {x:(p.x-280)*scale,y:(572-p.y)*scale};
    });
    segments.push(...fitArcs(points,{tolerance:.01,minimumRadius:.15}));
    current=curve.getPointAtLength(length);
  }
  return {id,segments};
});
if (paths.length !== 3) throw new Error("Expected the outline and two legs");
writeFileSync(new URL("../assets/artwork/flamingo-paths.json", import.meta.url), JSON.stringify({
  source: "flamingo.svg", width: 17.1, height: 24.48, strokeWidth: 0.25, fitTolerance: 0.01, paths,
}) + "\n");
const svgPaths=paths.map(path=>{
  let d=`M ${path.segments[0].start.x} ${-path.segments[0].start.y}`;
  for(const segment of path.segments){
    if(segment.bulge){const {radius}=arcGeometry(segment.start,segment.end,segment.bulge);d+=` A ${radius} ${radius} 0 0 ${segment.bulge<0?1:0} ${segment.end.x} ${-segment.end.y}`;}
    else d+=` L ${segment.end.x} ${-segment.end.y}`;
  }
  return `<path id="${path.id}" d="${d}"/>`;
});
writeFileSync(new URL("../assets/artwork/flamingo-arcs.svg",import.meta.url),`<svg xmlns="http://www.w3.org/2000/svg" width="17.1mm" height="24.48mm" viewBox="-8.55 -12.24 17.1 24.48"><g fill="none" stroke="#000" stroke-width="0.25" stroke-linecap="round" stroke-linejoin="round">${svgPaths.join("")}</g></svg>\n`);
const all=paths.flatMap(p=>p.segments);
console.log(`Generated ${all.filter(s=>s.bulge).length} true arcs and ${all.filter(s=>!s.bulge).length} lines; maximum sampled error ${Math.max(...all.map(s=>s.error)).toFixed(5)} mm`);
