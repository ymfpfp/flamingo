import {readFile,writeFile} from 'node:fs/promises';
import {createEngine} from '../power-reset/engine.mjs';
const root='dist/slot-mosfet-focused-2026-10-22';
const engine=await createEngine(),checks=[];
for(const index of [0,96,100,130,118]){
  const key=String(index).padStart(3,'0'),base=JSON.parse(await readFile(`${root}/case-${key}.json`));
  const old=await readFile(`${root}/case-${key}.cir`,'utf8');
  const deck=old.replace(/\.tran .*\n/,m=>m.replace(/\.tran \S+/ ,'.tran 1u').replace(/0 \S+\n/,'0 1u\n'));
  const sim=await engine.simulate(deck),gg=sim.simulationResultCircuitJson;
  const w=n=>gg.find(g=>g.name===n),ts=w('out').timestamps_ms,p=w('pmon').voltage_levels,id=w('imon').voltage_levels;
  const end=+deck.match(/\.tran \S+ ([\d.]+)m/)[1];
  if(ts.at(-1)<end-.01)throw Error('Refinement did not complete');
  const ppk=p.reduce((a,v)=>Math.max(a,v),0),ipk=id.reduce((a,v)=>Math.max(a,v),0);
  const bpk=Math.max(...Object.values(base.events).map(e=>e.peakPowerW)),bi=Math.max(...Object.values(base.events).map(e=>e.peakCurrentA));
  const pdelta=Math.abs(ppk/bpk-1),idelta=Math.abs(ipk/bi-1);
  checks.push({index,config:base.config,temp:base.temp,kind:base.kind,basePeakW:bpk,refinedPeakW:ppk,basePeakA:bi,refinedPeakA:ipk,powerRelativeDifference:pdelta,currentRelativeDifference:idelta,passed:pdelta<.03&&idelta<.03});
  console.log(checks.at(-1));
}
await writeFile(`${root}/numerics.json`,JSON.stringify({checks,passed:checks.every(c=>c.passed)},null,2));
if(checks.some(c=>!c.passed))throw Error('Refinement disagreement');
