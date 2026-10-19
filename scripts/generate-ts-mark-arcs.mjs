import {readFileSync,writeFileSync} from "node:fs";
import {fitRing,reverseRing,ringSvg} from "./lib-artwork-arcs.mjs";
const asset=new URL("../assets/artwork/",import.meta.url);
const source=JSON.parse(readFileSync(new URL("ts-mark-trace.json",asset),"utf8"));
const b=Math.tan(Math.PI/8),half=3,r=1.2;
// Clockwise outside; four exact quarter circles between the straight sides.
const outer=[{x:-half+r,y:half},{x:half-r,y:half,bulge:-b},{x:half,y:half-r},{x:half,y:-half+r,bulge:-b},{x:half-r,y:-half},{x:-half+r,y:-half,bulge:-b},{x:-half,y:-half+r},{x:-half,y:half-r,bulge:-b}];
// Two exact semicircles form the circular knockout.
const {x,y,radius}=source.dot;
const dot=[{x:x+radius,y,bulge:1},{x:x-radius,y,bulge:1}];
const letters=source.letters.map(points=>reverseRing(fitRing(points,{tolerance:.01})));
const rings=[outer,dot,...letters];
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="6mm" height="6mm" viewBox="-3 -3 6 6"><title>ts badge — circular dot and arc corners</title><path fill="#000" fill-rule="evenodd" d="${rings.map(ringSvg).join(" ")}"/></svg>\n`;
writeFileSync(new URL("ts-mark.svg",asset),svg);
writeFileSync(new URL("ts-mark.json",asset),JSON.stringify({width:6,height:6,fitTolerance:.01,svg,outer_ring:{vertices:outer},inner_rings:[dot,...letters].map(vertices=>({vertices}))})+"\n");
console.log(`Generated badge with exact circular dot, four corner arcs, and ${letters.flat().filter(p=>p.bulge).length} letter arcs`);
