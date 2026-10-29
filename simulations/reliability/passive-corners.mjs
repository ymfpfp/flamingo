// Source-bound SPICE checks of passive USB sensing and reset power cycles.
// No input clamp, bridge internals, PSU or regulator behavior is inferred.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {circuitGraph} from '../../lib/circuit-graph.mjs';
import {createEngine, runtimeHash} from '../power-reset/engine.mjs';

const file = process.argv[2] ?? 'dist/board.circuit.json';
const out = process.argv[3] ?? 'dist/reliability-2026-10-23/passive';
mkdirSync(out, {recursive: true});
const raw = readFileSync(file), board = JSON.parse(raw), g = circuitGraph(board);
const engine = await createEngine();
const sha = value => createHash('sha256').update(value).digest('hex');
const r = name => g.component(name).resistance;
const c = name => g.component(name).capacitance;
for (const [a, ap, b, bp] of [
  ['R_RST','pin1','ATX','pin1'], ['R_RST','pin2','C_RST','pin1'],
  ['C_RST','pin2','ATX','pin3'], ['R_VBUS_TOP','pin1','USBC','A4'],
  ['R_VBUS_TOP','pin2','R_VBUS_BOTTOM','pin1'],
  ['R_VBUS_BOTTOM','pin1','C_VBUS_SENSE','pin1'],
  ['R_VBUS_BOTTOM','pin2','ATX','pin3'], ['C_VBUS_SENSE','pin2','ATX','pin3'],
]) if (g.net(a,ap) !== g.net(b,bp)) throw Error(`Topology changed: ${a}.${ap}`);

// Exact solution for a first-order RC driven by a piecewise-linear source.
// This independent solution also includes the specified constant leakage.
function exact(points, t, tau, gain, offset) {
  let y = gain*points[0][1]+offset, now = points[0][0];
  for (let k=1; k<=points.length; k++) {
    const a=points[Math.min(k-1,points.length-1)];
    const b=points[k] ?? [t, a[1]];
    const end=Math.min(t,b[0]);
    if (end<=now) continue;
    const slope=b[0]===a[0]?0:gain*(b[1]-a[1])/(b[0]-a[0]);
    const initial=gain*a[1]+offset;
    const dt=end-now;
    y=initial+slope*(dt-tau)+(y-initial+slope*tau)*Math.exp(-dt/tau);
    now=end;
    if(now>=t) return y;
  }
  return y;
}
function at(w, t) {
  let a=0,b=w.timeMs.length-1;
  if(t<w.timeMs[0] || t>w.timeMs[b]) throw Error('Outside waveform');
  while(b-a>1){const m=(a+b)>>1;if(w.timeMs[m]<=t)a=m;else b=m;}
  return w.volts[a]+(w.volts[b]-w.volts[a])*(t-w.timeMs[a])/(w.timeMs[b]-w.timeMs[a]);
}
function crossing(w, threshold, start, end, rising=true) {
  for(let i=1;i<w.timeMs.length;i++) {
    if(w.timeMs[i]<start || w.timeMs[i-1]>end) continue;
    const a=w.volts[i-1],b=w.volts[i];
    if(rising ? a<threshold&&b>=threshold : a>threshold&&b<=threshold) {
      const t=w.timeMs[i-1]+(threshold-a)/(b-a)*(w.timeMs[i]-w.timeMs[i-1]);
      if(t>=start&&t<=end)return t;
    }
  }
  return null;
}
let maxErrorMV=0;
async function simulate(name, points, resistors, cap, end, step, analytic, stepFactor=1) {
  const deck=`${name}\n.options reltol=1e-7 abstol=1e-12 vntol=1e-9 method=trap\nV_SOURCE source 0 PWL(${points.flatMap(([t,v])=>[`${t}m`,v]).join(' ')})\n${resistors}\nC_FILTER out 0 ${cap}\n.tran ${step*stepFactor}m ${end}m 0 ${step*stepFactor}m\n.save v(out)\n.end\n`;
  const sim=await engine.simulate(deck);
  const q=sim.simulationResultCircuitJson?.find(x=>x.name==='out');
  if(!q || q.timestamps_ms.length!==q.voltage_levels.length || q.timestamps_ms.at(-1)<end-1e-6
    || q.voltage_levels.some(x=>!Number.isFinite(x))
    || q.timestamps_ms.some((t,i)=>!Number.isFinite(t)||(i>0&&t<=q.timestamps_ms[i-1]))) throw Error(`Incomplete simulation: ${name}`);
  const w={timeMs:q.timestamps_ms,volts:q.voltage_levels};
  let error=0;
  for(let i=0;i<w.timeMs.length;i++)error=Math.max(error,Math.abs(w.volts[i]-analytic(w.timeMs[i]))*1000);
  maxErrorMV=Math.max(maxErrorMV,error);
  if(error>.12) throw Error(`SPICE/exact RC disagreement: ${name}: ${error} mV`);
  writeFileSync(`${out}/${name}.cir`,deck);
  return {w,error};
}
const vbus=[];
for(const supplyV of [4.75,5,5.25,5.5])
for(const topFactor of [.99,1.01])for(const bottomFactor of [.99,1.01])
for(const capFactor of [.5,1,1.2])for(const leakageUA of [-10,10]) {
  const top=r('R_VBUS_TOP')*topFactor,bottom=r('R_VBUS_BOTTOM')*bottomFactor;
  const cap=c('C_VBUS_SENSE')*capFactor,rt=top*bottom/(top+bottom);
  const gain=bottom/(top+bottom),offset=-leakageUA*1e-6*rt,tau=rt*cap*1000;
  const points=[[0,0],[1,0],[1.01,supplyV],[41,supplyV],[41.01,0],[90,0]];
  const name=`vbus-${vbus.length}`;
  const {w,error}=await simulate(name,points,`R_TOP source out ${top}\nR_BOTTOM out 0 ${bottom}\nI_LEAK out 0 ${leakageUA}u`,cap,90,.02,t=>exact(points,t,tau,gain,offset));
  const attach=crossing(w,2,1,41),detach=crossing(w,.8,41,90,false);
  vbus.push({name,supplyV,topFactor,bottomFactor,capFactor,leakageUA,tauMs:tau,
    steadyStateV:supplyV*gain+offset,timeToGuaranteedHighMs:attach===null?null:attach-1,
    detachToGuaranteedLowMs:detach===null?null:detach-41,
    maximumSenseV:Math.max(...w.volts),exactErrorMV:error,
    inputHighPass:attach!==null&&at(w,40)>=2,detachedLowPass:detach!==null&&at(w,89)<=.8,
    above3V6TableValue:supplyV*gain+offset>3.6});
}
const reset=[], samples=[];
for(const supplyV of [3.135,3.465])for(const offMs of [.1,1,3,10,30,100,300,1000])
for(const capFactor of [.5,1,1.2])for(const resistanceFactor of [.99,1.01]) {
  const resistance=r('R_RST')*resistanceFactor,cap=c('C_RST')*capFactor;
  const tau=resistance*cap*1000,restart=1001+offMs,end=restart+500;
  const points=[[0,0],[1,0],[2,supplyV],[1000,supplyV],[1001,0],[restart,0],[restart+1,supplyV],[end,supplyV]];
  const name=`reset-${reset.length}`;
  const {w,error}=await simulate(name,points,`R_RESET source out ${resistance}`,cap,end,.1,t=>exact(points,t,tau,1,0));
  const low=crossing(w,.8,1000,restart,false);
  const high=crossing(w,1.58,restart,end);
  reset.push({name,supplyV,offMs,capFactor,resistanceFactor,tauMs:tau,
    resetBeforeRestartV:at(w,restart),reachesGuaranteedLow:low!==null,
    offToGuaranteedLowMs:low===null?null:low-1000,
    restartToEarliestReleaseMs:high===null?null:high-restart,
    releaseAlreadyPossibleAtRestart:at(w,restart)>=1.58,exactErrorMV:error});
  if(supplyV===3.465&&resistanceFactor===1.01&&capFactor===1.2&&[10,100,300].includes(offMs)) {
    const ids=w.timeMs.flatMap((t,i)=>t>=990&&i%5===0?[i]:[]);
    samples.push({name,offMs,timeMs:ids.map(i=>w.timeMs[i]-1000),resetV:ids.map(i=>w.volts[i])});
  }
  if(reset.length%24===0)console.log(`${reset.length}/96 reset cycles complete`);
}
const refinement=[];
for(const offMs of [10,100,300]) {
  const supplyV=3.465,resistance=r('R_RST')*1.01,cap=c('C_RST')*1.2,restart=1001+offMs,end=restart+500;
  const points=[[0,0],[1,0],[2,supplyV],[1000,supplyV],[1001,0],[restart,0],[restart+1,supplyV],[end,supplyV]];
  const {w,error}=await simulate(`refine-${offMs}`,points,`R_RESET source out ${resistance}`,cap,end,.1,t=>exact(points,t,resistance*cap*1000,1,0),.2);
  const base=reset.find(x=>x.supplyV===supplyV&&x.offMs===offMs&&x.capFactor===1.2&&x.resistanceFactor===1.01);
  const delta=Math.abs(at(w,restart)-base.resetBeforeRestartV)*1000;
  refinement.push({offMs,voltageDifferenceMV:delta,exactErrorMV:error,passed:delta<.02});
}
const report={sourceFile:file,sourceSha256:sha(raw),runnerSha256:sha(readFileSync(new URL(import.meta.url))),runtimeSha256:runtimeHash,
  values:{R_RST:r('R_RST'),C_RST:c('C_RST'),R_VBUS_TOP:r('R_VBUS_TOP'),R_VBUS_BOTTOM:r('R_VBUS_BOTTOM'),C_VBUS_SENSE:c('C_VBUS_SENSE')},
  scope:'Passive RC networks from the compiled board. Prescribed supply waveforms. No chip, input-clamp, supervisor or converter prediction.',
  assumptions:{vbusLeakageUA:[-10,10],vbusLeakageNote:'Sensitivity to the section 6.3.6 digital-pin table value. State-dependent internal pulls are omitted.',
    capFactors:[.5,1,1.2],capacitanceNote:'Sensitivity factors, not guaranteed effective capacitance bounds.',resetLeakageUA:0,
    resetSupply:'Ideal low-impedance VCCH, including forced discharge to zero. Actual shutdown can be slower.',
    thresholds:'ASM2464PDX sections 6.3.6 and 6.3.7: high 2.0 V, low 0.8 V, earliest reset rising threshold 1.58 V.'},
  numericalChecks:{maximumExactErrorMV:maxErrorMV,refinement,passed:refinement.every(x=>x.passed)},
  summary:{vbusCases:vbus.length,resetCases:reset.length,refinementCases:refinement.length,
    vbusAllReachHighAndLow:vbus.every(x=>x.inputHighPass&&x.detachedLowPass),
    vbusMaximumSenseV:Math.max(...vbus.map(x=>x.maximumSenseV)),
    vbusNormalMaximumSenseV:Math.max(...vbus.filter(x=>x.supplyV<=5.25).map(x=>x.maximumSenseV)),
    maximumAttachToHighMs:Math.max(...vbus.map(x=>x.timeToGuaranteedHighMs)),
    maximumDetachToLowMs:Math.max(...vbus.map(x=>x.detachToGuaranteedLowMs)),
    resetCasesWithoutGuaranteedLow:reset.filter(x=>!x.reachesGuaranteedLow).length,
    allResetCornersReachLowAtOffMs:[...new Set(reset.map(x=>x.offMs))].filter(ms=>reset.filter(x=>x.offMs===ms).every(x=>x.reachesGuaranteedLow))},
  vbus,reset,limitations:['VBUS is explicitly a 5 V tolerant pin. Exceeding the 3.6 V logic-table entry is an interpretation item, not proof of absolute-maximum damage.',
    'Powered-off tolerance, internal pulls, input injection current and back-power behavior remain unmodeled.',
    'A reset low interval alone does not qualify restart: rail order, clocks, reset pulse width and firmware remain separate.',
    'The reset sweep has zero leakage. The 1 uA specification is only at VIN=0, so it cannot establish a full-trajectory leakage bound.'],hardwareQualified:false};
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
writeFileSync(`${out}/waveforms.json`,JSON.stringify(samples));
console.log(JSON.stringify(report.summary,null,2));
if(!report.numericalChecks.passed||!report.summary.vbusAllReachHighAndLow)process.exitCode=1;
