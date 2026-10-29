// Evaluate installed-device cases and independently refine the largest stresses.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createEngine} from '../power-reset/engine.mjs';
const dir=process.argv[2]??'dist/reliability-2026-10-23/slot12v';
const raw=readFileSync(`${dir}/results.json`),data=JSON.parse(raw);
const soaRaw=readFileSync('simulations/slot-power/si4497-soa.json'),soa=JSON.parse(soaRaw);
const sha=x=>createHash('sha256').update(x).digest('hex');
if(data.boardConfiguration!=='installed-rc10k')throw Error('Installed Si4497 configuration required');
const curves=Object.entries(soa.constantPowerCurvesW).map(([x,y])=>[+x,y]).sort((a,b)=>a[0]-b[0]);
function limit(t){
  if(t<=curves[0][0])return curves[0][1];
  const timed=curves.filter(([x])=>x<1e10);
  if(t>timed.at(-1)[0])return curves.at(-1)[1];
  for(let i=1;i<timed.length;i++)if(t<=timed[i][0]){
    const [a,x]=timed[i-1],[b,y]=timed[i];return x*(y/x)**(Math.log(t/a)/Math.log(b/a));
  }
  throw Error('Missing SOA curve');
}
const rows=data.rows.map(q=>({...q,events:Object.fromEntries(Object.entries(q.events).map(([name,e])=>{
  const p=e.linearPeakPowerW,derate=soa.curveReadReserve*(soa.maximumJunctionC-q.temp)/125;
  if(derate<=0)throw Error('Invalid initial temperature');
  const equivalentRatio=p?p/(limit(e.energyJ/p)*derate):0;
  const fullDurationRatio=p?p/(limit(e.linearDurationMs/1000)*derate):0;
  return [name,{...e,equivalentRatio,fullDurationRatio,
    pulseCurrentPass:e.peakCurrentA<=soa.pulseCurrentCeilingA&&e.reversePeakA<=soa.pulseCurrentCeilingA}];
}))}));
const summary=[];
const temperatures=[...new Set(rows.map(q=>q.temp))].sort((a,b)=>a-b);
for(const temp of temperatures)for(const kind of ['control','source'])for(const cardUF of [0,1000,2000]){
  const rr=rows.filter(r=>r.temp===temp&&r.kind===kind&&r.cardUF===cardUF);
  if(!rr.length)continue;
  const events=rr.flatMap(q=>Object.entries(q.events).map(([name,e])=>({...e,index:q.index,event:name})));
  const worst=key=>events.reduce((a,b)=>b[key]>a[key]?b:a);
  summary.push({temp,kind,cardUF,cases:rr.length,worstEquivalent:worst('equivalentRatio'),
    worstFullDuration:worst('fullDurationRatio'),peakForwardA:worst('peakCurrentA').peakCurrentA,
    peakReverseA:worst('reversePeakA').reversePeakA});
}
const selected=new Set();
for(const key of ['peakCurrentA','reversePeakA','linearPeakPowerW','energyJ']) {
  const events=rows.flatMap(q=>Object.values(q.events).map(e=>({...e,index:q.index})));
  selected.add(events.reduce((a,b)=>b[key]>a[key]?b:a).index);
}
for(const temp of temperatures.slice(0,2)) {
  const rr=rows.filter(q=>q.kind==='control'&&q.temp===temp&&q.cardUF===1000);
  if(rr.length)selected.add(rr.reduce((a,b)=>Math.max(...Object.values(b.events).map(e=>e.fullDurationRatio))>
    Math.max(...Object.values(a.events).map(e=>e.fullDurationRatio))?b:a).index);
}
const engine=await createEngine(),refinement=[];
for(const index of selected){
  const q=rows.find(q=>q.index===index),key=String(index).padStart(3,'0');
  const deck=readFileSync(`${dir}/case-${key}.cir`,'utf8').replace(/\.tran (\S+) (\S+) 0 (\S+)/,'.tran 2u $2 0 2u');
  const end=+deck.match(/\.tran \S+ ([\d.]+)m/)[1];
  const graphs=(await engine.simulate(deck)).simulationResultCircuitJson;
  const wave=name=>{const w=graphs?.find(w=>w.name===name);if(!w||w.timestamps_ms.at(-1)<end-.01||w.voltage_levels.some(v=>!Number.isFinite(v)))throw Error('Truncated refinement');return w;};
  const ts=wave('out').timestamps_ms,id=wave('imon').voltage_levels,p=wave('pmon').voltage_levels,vs=wave('vds').voltage_levels;
  const max=a=>a.reduce((x,y)=>Math.max(x,y),-Infinity);
  const baseForward=Math.max(...Object.values(q.events).map(e=>e.peakCurrentA));
  const baseReverse=Math.max(...Object.values(q.events).map(e=>e.reversePeakA));
  const basePower=Math.max(...Object.values(q.events).map(e=>e.peakPowerW));
  const delta=(a,b)=>Math.abs(a-b)/Math.max(Math.abs(b),1e-9);
  const forward=delta(max(id),baseForward),reverseDifferenceA=Math.abs(Math.max(0,max(id.map(v=>-v)))-baseReverse),power=delta(max(p),basePower);
  const reverseToleranceA=Math.max(.001,.05*baseReverse);
  // Compare total forward-linear energy across the complete simulated cycle.
  let energy=0;
  for(let i=1;i<ts.length;i++)if(vs[i]>.36&&id[i]>.05&&vs[i-1]>.36&&id[i-1]>.05)energy+=(ts[i]-ts[i-1])/2000*(p[i]+p[i-1]);
  const baseEnergy=Object.values(q.events).reduce((s,e)=>s+e.energyJ,0);
  const energyDifference=delta(energy,baseEnergy);
  refinement.push({index,temp:q.temp,kind:q.kind,maximumStepUS:2,forwardPeakRelativeDifference:forward,
    reversePeakDifferenceA:reverseDifferenceA,reversePeakToleranceA:reverseToleranceA,
    powerPeakRelativeDifference:power,linearEnergyRelativeDifference:energyDifference,
    passed:Math.max(forward,power,energyDifference)<.05&&reverseDifferenceA<reverseToleranceA});
  writeFileSync(`${dir}/refine-${key}.cir`,deck);
}
const report={sourceSha256:data.boardSha256,resultsSha256:sha(raw),soaSha256:sha(soaRaw),
  scope:'Installed 12 V switch. Fixed-temperature electrical model and estimated single-pulse SOA extension.',
  cases:rows.length,allSettled:rows.every(q=>q.finalOutputV>.85*q.supply),
  maximumChargeResidual:Math.max(...rows.map(q=>q.chargeResidual)),
  summary,numericalChecks:{refinement,passed:refinement.every(q=>q.passed)&&rows.every(q=>q.chargeResidual<.02)},
  limitations:['Hot SOA scaling is an estimate, not a manufacturer guarantee. The board thermal impedance remains unknown.',
    'Both equivalent-pulse and full-duration bounds are recorded. Neither simulates heat accumulation or linear-mode thermal instability.',
    'The source model can sink reverse current. Actual PSU behavior and card auxiliary supplies remain outside this model.',
    '70 A is a pulse ceiling, not authorization for repetitive pulses. Body-diode survival needs a separate review.'],hardwareQualified:false};
writeFileSync(`${dir}/summary.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cases:report.cases,allSettled:report.allSettled,maximumChargeResidual:report.maximumChargeResidual,refinement},null,2));
if(!report.numericalChecks.passed||!report.allSettled)process.exitCode=1;
