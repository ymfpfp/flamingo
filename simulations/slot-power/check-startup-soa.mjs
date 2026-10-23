import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {circuitGraph} from '../../lib/circuit-graph.mjs';
import {createEngine} from '../power-reset/engine.mjs';

// This runner screens the existing circuit. It does not change component values.
const input = process.argv[2] ?? 'dist/board.circuit.json';
const out = process.argv[3] ?? 'dist/slot-startup-soa-2026-10-22';
const quick = process.argv.includes('--quick');
await mkdir(out, {recursive:true});
await mkdir(`${out}/cases`, {recursive:true});
const raw=await readFile(input), board=JSON.parse(raw), g=circuitGraph(board);
const hash=x=>createHash('sha256').update(x).digest('hex');
const soa=JSON.parse(await readFile('simulations/slot-power/soa-inputs.json'));
const vendorRaw=await readFile('simulations/slot-power/vendor/DMP2008UFG.spice.txt','utf8');
const vendor=vendorRaw.replace(/\r/g,'').replace(/^\.SIMULATOR DEFAULT\s*$/gmi,'')
  .replace('IS=1E-15 N=10)','IS=1E-15)').replace('Rta 30 23 1E-20','Rta 30 23 1E-6');
const configs=[
  {rail:'3V3',v:3.3,amps:3,part:'DMP2008UFG-7',soaPart:'DMP2008UFG',bulk:['C135','C136'],ceramic:['C131'],esr:.010,uvlo:[2.3,2.8]},
  {rail:'12V',v:12,amps:5.5,part:'AO4407A',soaPart:'AO4407A',bulk:['C134'],ceramic:['C132','C133'],esr:.012,uvlo:[8,10]},
];
for(const c of configs){
  if(g.component(`Q_SLOT_${c.rail}`).manufacturer_part_number!==c.part)throw Error('Unexpected MOSFET');
  c.rgate=g.component(`R_SLOT_GATE_${c.rail}`).resistance;
  c.roff=g.component(`R_SLOT_OFF_${c.rail}`).resistance;
  c.cgate=g.component(`C_SLOT_GATE_${c.rail}`).capacitance;
  c.bleed=g.component(`R_SLOT_DISCHARGE_${c.rail}`).resistance;
  c.bulkF=c.bulk.map(n=>g.component(n).capacitance);
  c.ceramicF=c.ceramic.reduce((s,n)=>s+g.component(n).capacitance,0);
  if(g.net(`Q_SLOT_${c.rail}`,'pin5')!==g.net(c.bulk[0],'pin1'))throw Error('Bulk net mismatch');
}
// Approximate AO4407A model: gfs=21 S at 10 A implies KP=21^2/(2*10).
// Series resistance fits the typical ~10 mOhm at VGS=-10 V. Large external
// 10 uF gate capacitance dominates nanofarad internal capacitances. The hot
// threshold and mobility coefficients below are sensitivity assumptions.
function aoModel(temp,variant='nominal'){
  const vto=(variant==='low-threshold'?1.7:variant==='high-threshold'?3:2.3)-.004*(temp-25);
  const kp=22.05*(298.15/(temp+273.15))**1.5*(variant==='strong'?1.5:variant==='weak'?.67:1);
  return `.SUBCKT AO_APPROX d g s
M1 di g si si PA L=1u W=1u
RD d di .0015
RS s si .0015
CGS g si 1.765n
CGD g di .295n
DBODY d s PB
.MODEL PA PMOS(LEVEL=1 VTO=${-vto} KP=${kp} LAMBDA=0 TNOM=${temp})
.MODEL PB D(IS=1e-9 N=1.2 RS=.02 BV=30)
.ENDS AO_APPROX`;
}
function interp(x,xs,ys){
  if(x<=xs[0])return ys[0];if(x>=xs.at(-1))return ys.at(-1);
  const k=xs.findIndex(a=>a>=x),u=Math.log(x/xs[k-1])/Math.log(xs[k]/xs[k-1]);
  return Math.exp(Math.log(ys[k-1])*(1-u)+Math.log(ys[k])*u);
}
function limit25(part,v,seconds){
  const p=soa.parts[part],curves=p.curves??p.constantPowerCurvesW;
  // Use the DC curve for durations longer than the longest timed curve.
  const entries=Object.entries(curves).sort((a,b)=>+a[0]-+b[0]);
  const currents=entries.map(([,data])=>{
    if(!p.curves)return Math.min(data/v,p.pulseCurrentCeilingA,v/p.rdsBoundaryOhm);
    const pts=data.filter((q,i)=>!i||q[0]>data[i-1][0]);
    return interp(v,pts.map(q=>q[0]),pts.map(q=>q[1]));
  });
  const times=entries.map(q=>+q[0]);
  const timed=times.filter(t=>t<1e10);
  const value=seconds>timed.at(-1)?currents.at(-1):interp(Math.max(seconds,times[0]),times,currents);
  return value*soa.curveReadReserveFactor;
}
function screen(c,ts,vs,is,ps,lo,hi,temp){
  const ids=ts.flatMap((t,i)=>t>=lo&&t<=hi?[i]:[]);
  if(!ids.length)throw Error('Missing event');
  const peakKey=key=>ids.reduce((a,b)=>key[b]>key[a]?b:a,ids[0]);
  const ii=peakKey(is);
  const linear=ids.filter(i=>vs[i]>Math.max(.05,c.v*.03)&&is[i]>.05);
  const reversePeakCurrentA=ids.reduce((v,i)=>Math.max(v,-is[i]),0);
  if(!linear.length)return {eventStartMs:lo,eventEndMs:hi,linearDurationMs:0,peakCurrentA:is[ii],peakPowerW:0,reversePeakCurrentA,equivalentRatio:0,boundingRatio:0,energyJ:0};
  const ip=linear.reduce((a,b)=>ps[b]>ps[a]?b:a,linear[0]);
  const a=linear[0],b=linear.at(-1),duration=Math.max((ts[b]-ts[a])/1000,1e-6);
  let energy=0;
  for(let i=a+1;i<=b;i++)energy+=(ts[i]-ts[i-1])/2000*(ps[i]+ps[i-1]);
  const vMax=linear.reduce((v,i)=>Math.max(v,vs[i]),0);
  const peakP=ps[ip],eqTime=Math.max(energy/Math.max(peakP,1e-12),1e-6);
  const derate=(150-temp)/125;
  const allowed=limit25(c.soaPart,vMax,eqTime)*derate;
  // Equivalent constant-power pulse uses the largest VDS in this event. This
  // is more conservative than selecting only the VDS at maximum dissipation.
  const equivalentRatio=(peakP/vMax)/allowed;
  const boundingRatio=linear.reduce((r,i)=>Math.max(r,is[i]/(limit25(c.soaPart,vs[i],duration)*derate)),0);
  return {eventStartMs:lo,eventEndMs:hi,linearDurationMs:duration*1000,peakCurrentA:is[ii],peakPowerW:peakP,
    energyJ:energy,equivalentWidthMs:eqTime*1000,largestVdsV:vMax,reversePeakCurrentA,
    peakPowerPoint:{timeMs:ts[ip],currentA:is[ip],vdsV:vs[ip]},
    equivalentAllowedCurrentA:allowed,equivalentRatio,boundingRatio,
    estimatedScreenStatus:equivalentRatio>1?'outside-equivalent-SOA-screen':boundingRatio<=1?'inside-bounding-SOA-screen':'equivalent-only-margin'};
}
const engine=await createEngine();
const cases=[];
function add(c,extra){cases.push({rail:c.rail,supplyFactor:1.05,temp:125,gateFactor:.5,cardUF:1000,load:'uvlo',driver:'limited',modelVariant:'nominal',...extra});}
for(const c of configs){
  if(quick){add(c,{kind:'cold',temp:25});add(c,{kind:'control-restart',offMs:1000});continue;}
  for(const temp of [25,85,125])for(const supplyFactor of [.95,1.05])
  for(const gateFactor of [.5,1.1])for(const cardUF of [0,1000])for(const load of ['idle','resistive','uvlo'])
    add(c,{kind:'cold',temp,supplyFactor,gateFactor,cardUF,load});
  for(const offMs of [1,10,100,1000,3000])for(const temp of [85,125])
  for(const gateFactor of [.5,1.1])for(const load of ['resistive','uvlo'])
    add(c,{kind:'control-restart',offMs,temp,gateFactor,load});
  for(const offMs of [1,10,100])for(const sourceControl of ['stays-high','goes-low'])
  for(const load of ['resistive','uvlo'])add(c,{kind:'source-restart',offMs,sourceControl,load});
  for(const driver of ['resistive'])for(const kind of ['cold','control-restart'])
  for(const load of ['resistive','uvlo'])add(c,{kind,offMs:1000,driver,load});
  for(const cardUF of [2000])for(const temp of [25,125])add(c,{kind:'cold',cardUF,temp});
  if(c.rail==='12V')for(const modelVariant of ['low-threshold','high-threshold','strong','weak'])
  for(const kind of ['cold','control-restart'])add(c,{kind,offMs:1000,modelVariant});
}
const results=[],selected=new Map();
const start=Date.now();
for(let ix=0;ix<cases.length;ix++){
  const q=cases[ix],c=configs.find(c=>c.rail===q.rail),supply=c.v*q.supplyFactor;
  const off=40,re=off+(q.offMs??0),end=q.kind==='cold'?35:re+35;
  const control=q.kind==='cold'?`PWL(0 0 2m 0 2.001m 2.4 ${end}m 2.4)`
    :q.kind==='source-restart'&&q.sourceControl==='stays-high'?`PWL(0 0 2m 0 2.001m 2.4 ${end}m 2.4)`
    :`PWL(0 0 2m 0 2.001m 2.4 ${off}m 2.4 ${off+.001}m 0 ${re}m 0 ${re+.001}m 2.4 ${end}m 2.4)`;
  const vin=q.kind==='source-restart'?`PWL(0 0 .1m ${supply} ${off}m ${supply} ${off+.1}m 0 ${re}m 0 ${re+.1}m ${supply} ${end}m ${supply})`
    :`PWL(0 0 .1m ${supply} ${end}m ${supply})`;
  const bulk=c.bulkF.map((f,i)=>`R_ESR${i} out bulk${i} ${c.esr+.003}\nC_BULK${i} bulk${i} 0 ${f*1.44} IC=0`).join('\n');
  const load=q.load==='idle'?'R_LOAD out 0 1e9':q.load==='resistive'?`R_LOAD out 0 ${c.v/c.amps}`
    :`B_LOAD out 0 I={${c.amps}*min(max((V(out)-${c.uvlo[0]})/${c.uvlo[1]-c.uvlo[0]},0),1)}`;
  const sink=q.driver==='limited'?'min(max(V(sink),0)/2.8,.01)':'max(V(sink),0)/2.8';
  const deck=`Slot SOA ${ix}: ${JSON.stringify(q)}
.temp ${q.temp}
.options reltol=1e-5 abstol=1e-9 vntol=1e-7 method=gear
V_SUPPLY vin 0 ${vin}
R_SOURCE vin lin .025
L_SOURCE lin source 200n
V_CONTROL control 0 ${control}
B_DRIVER sink 0 I={min(max(V(control)/1.8,0),1)*${sink}}
D_DRIVER 0 sink DCLAMP
.model DCLAMP D(IS=1e-12 RS=1 CJO=20p TT=10n)
R_GATE sink gate ${c.rgate}
R_PULLUP source gate ${c.roff}
C_GATE source gate ${c.cgate*q.gateFactor} IC=0
X_POWER drain gate source ${c.rail==='3V3'?'DMP2008UFG':'AO_APPROX'}
V_DRAIN drain out 0
${bulk}
${q.cardUF?`R_CARD out card .02\nC_CARD card 0 ${q.cardUF*1e-6} IC=0`:''}
C_CERAMIC out 0 ${c.ceramicF} IC=0
R_BLEED out 0 ${c.bleed}
${load}
B_IMON imon 0 V={I(V_DRAIN)}
B_PMON pmon 0 V={max(V(source,drain)*I(V_DRAIN),0)}
B_VDS vds 0 V={V(source,drain)}
B_VGS vgs 0 V={V(source,gate)}
${c.rail==='3V3'?vendor:aoModel(q.temp,q.modelVariant)}
.tran 10u ${end}m 0 50u
.save v(out) v(imon) v(pmon) v(vds) v(vgs) v(source)
.end
`;
  await writeFile(`${out}/last-input.cir`,deck);
  let graphs,solverAttempt,usedDeck;
  for(solverAttempt=0;solverAttempt<3;solverAttempt++){
    const attempt=solverAttempt===0?deck:deck.replace('method=gear',solverAttempt===1?'method=trap itl4=500 trtol=1':'method=gear itl4=1000 trtol=1')
      .replace('.tran 10u', '.tran 2u').replace('0 50u','0 2u');
    usedDeck=attempt;
    const sim=await engine.simulate(attempt);
    graphs=sim.simulationResultCircuitJson;
    const w=graphs.find(x=>x.type==='simulation_transient_voltage_graph'&&x.name==='out');
    if(w?.timestamps_ms.at(-1)>=end-.01&&w.voltage_levels.every(Number.isFinite))break;
  }
  const wave=n=>{
    const w=graphs.find(x=>x.type==='simulation_transient_voltage_graph'&&x.name===n);
    if(!w||w.timestamps_ms.at(-1)<end-.01||!w.voltage_levels.every(Number.isFinite))throw Error('Invalid waveform: '+n);
    return w;
  };
  const ts=wave('out').timestamps_ms,vout=wave('out').voltage_levels,vs=wave('vds').voltage_levels;
  const is=wave('imon').voltage_levels,ps=wave('pmon').voltage_levels,vg=wave('vgs').voltage_levels;
  const sourceV=wave('source').voltage_levels;
  let netCharge=0;
  const loadAt=v=>q.load==='idle'?v/1e9:q.load==='resistive'?v*c.amps/c.v
    :c.amps*Math.min(Math.max((v-c.uvlo[0])/(c.uvlo[1]-c.uvlo[0]),0),1);
  const netAt=i=>is[i]-loadAt(vout[i])-vout[i]/c.bleed;
  for(let i=1;i<ts.length;i++)netCharge+=(ts[i]-ts[i-1])/2000*(netAt(i)+netAt(i-1));
  const expectedCharge=(c.bulkF.reduce((a,b)=>a+b,0)*1.44+c.ceramicF+q.cardUF*1e-6)*(vout.at(-1)-vout[0]);
  const first=screen(c,ts,vs,is,ps,2,q.kind==='cold'?end:off,q.temp);
  const events={startup:first};
  if(q.kind!=='cold'){
    events.shutdown=screen(c,ts,vs,is,ps,off,re,q.temp);
    events.restart=screen(c,ts,vs,is,ps,re,end,q.temp);
  }
  const at=time=>ts.findIndex(t=>t>=time);
  const r={index:ix,...q,solverAttempt,part:c.part,sourceV:supply,gateCapacitanceUF:c.cgate*q.gateFactor*1e6,
    boardCapacitanceUF:c.bulkF.reduce((a,b)=>a+b,0)*1.44e6,events,
    finalOutputV:vout.at(-1),finalGateV:vg.at(-1),settled:vout.at(-1)>=.9*supply,
    chargeBalance:{integratedC:netCharge,expectedC:expectedCharge,relativeResidual:Math.abs(netCharge-expectedCharge)/Math.max(Math.abs(expectedCharge),1e-9)},
    voltageBeforeRestartV:q.kind==='cold'?null:vout[at(re)-1],gateBeforeRestartV:q.kind==='cold'?null:vg[at(re)-1],
    minimumSourceVAfterInitialRamp:ts.reduce((a,t,i)=>t>.2&&q.kind!=='source-restart'?Math.min(a,sourceV[i]):a,Infinity),
    largestEquivalentRatio:Math.max(...Object.values(events).map(e=>e.equivalentRatio)),
    largestBoundingRatio:Math.max(...Object.values(events).map(e=>e.boundingRatio))};
  if(!Number.isFinite(r.minimumSourceVAfterInitialRamp))r.minimumSourceVAfterInitialRamp=null;
  results.push(r);
  await writeFile(`${out}/cases/${String(ix).padStart(3,'0')}.json`,JSON.stringify(r));
  for(const [event,ev] of Object.entries(events)){
    const key=`${c.rail}-${q.kind}-${event}`;
    if(!selected.has(key)||ev.equivalentRatio>selected.get(key).ratio){
      const keep=ts.map((t,i)=>i).filter(i=>i%5===0||Math.abs(ts[i]-ev.peakPowerPoint?.timeMs)<.1);
      selected.set(key,{ratio:ev.equivalentRatio,index:ix,event,deck:usedDeck,timeMs:keep.map(i=>ts[i]),
        outputV:keep.map(i=>vout[i]),currentA:keep.map(i=>is[i]),powerW:keep.map(i=>ps[i]),vdsV:keep.map(i=>vs[i]),vgsV:keep.map(i=>vg[i])});
    }
  }
  if(ix===0||(ix+1)%20===0||ix+1===cases.length){
    console.log(`${ix+1}/${cases.length}: ${q.rail} ${q.kind} ${q.temp} C, max equivalent ratio ${r.largestEquivalentRatio.toFixed(2)}`);
    await writeFile(`${out}/progress.json`,JSON.stringify({done:results.length,total:cases.length,elapsedSeconds:(Date.now()-start)/1000}));
  }
}
const summary=configs.map(c=>{
  const rr=results.filter(r=>r.rail===c.rail),worst=key=>rr.reduce((a,b)=>b[key]>a[key]?b:a);
  return {rail:c.rail,part:c.part,cases:rr.length,unsettled:rr.filter(r=>!r.settled).length,
    outsideEquivalentScreen:rr.filter(r=>r.largestEquivalentRatio>1).length,
    worstEquivalent:worst('largestEquivalentRatio'),worstBounding:worst('largestBoundingRatio')};
});
const report={date:'2026-10-22',sourceFile:input,sourceSha256:hash(raw),runnerSha256:hash(await readFile(new URL(import.meta.url))),
  scope:'Existing discrete slot switches: cold startup, preheated startup, control off/on, and source off/on. No hardware or BOM change.',
  configs,models:{DMP2008UFG:{type:'Vendor typical electrical SPICE',file:'simulations/slot-power/vendor/DMP2008UFG.spice.txt',sha256:hash(vendorRaw),adaptations:['Remove simulator directive','Remove unsupported MOS N parameter','Replace 1e-20 ohm with 1e-6 ohm for numerical convergence']},
    AO4407A:{type:'Approximate Level-1 fit, not a vendor model',kp25:22.05,vto25:2.3,seriesResistanceOhm:.003,
      assumedThresholdTemperatureCoefficientVPerC:-.004,assumedMobilityExponent:-1.5,modelSource:aoModel(25)}},
  assumptions:{sourceResistanceOhm:.025,sourceInductanceNH:200,sourceRiseUS:100,gateDriver:'10 mA ceiling / 2.8 ohm, plus uncapped sensitivity. Approximate reverse body diode includes 20 pF / 10 ns regularization for source-cycle convergence.',
    bulkFactor:1.44,cardUF:'0 / 1000, plus 2000 sensitivity',load:'Idle, resistive full load, and UVLO-ramped full current. Each rail checked independently.',
    initialTemperatureC:[25,85,125],hotRestartDefinition:'Preheated fixed electrical temperature, continuous gate and output-capacitor state across disable/enable. Source interruption is a separate case.',
    equivalentPulse:'Integrate positive VDS*ID during forward conduction with VDS > max(50 mV, 3% nominal rail) and ID > 50 mA. Equivalent duration E/Ppeak. Evaluate Ppeak/VDSmax against the interpolated SOA at VDSmax.',
    boundingPulse:'Compare every point against the SOA for the complete forward-linear event duration.',
    hotDerating:'(150 - initialTemperatureC)/125, plus 10% curve-reading reserve. Ambient-reference curve extension is an estimate.'},
  soaInputsFile:'simulations/slot-power/soa-inputs.json',soaInputsSha256:hash(await readFile('simulations/slot-power/soa-inputs.json')),
  cases:results.length,summary,results,elapsedSeconds:(Date.now()-start)/1000,hardwareQualified:false,
  limitations:[...soa.limitations,'Fixed-temperature electrical models omit electrothermal feedback and thermal accumulation. Hot cases do not qualify unlimited automatic retry.',
    'Source cycling uses an ideal bidirectional supply behind 25 milliohm / 200 nH. Actual PSU sink capability, cable behavior and auxiliary card power are unknown. Reverse peaks are recorded separately. Body-diode pulsed survival is not qualified by the forward SOA check.',
    'A result outside the approximate screen is evidence for design review, not proof of physical failure. A result inside it is not hardware qualification.',
    'The 1.44 capacitor factor is +20% initial tolerance followed by a separate +20% drift sensitivity, not a measured capacitance distribution.',
    'No short-circuit cutoff, current limit, or thermal shutdown exists in the current slot circuit. Hard shorts and insertion with live slot power are outside this startup review.']};
await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');
for(const [key,w] of selected){await writeFile(`${out}/${key}.cir`,w.deck);delete w.deck;}
await writeFile(`${out}/selected-waveforms.json`,JSON.stringify([...selected].map(([name,w])=>({name,...w}))));
console.log(JSON.stringify(summary.map(s=>({rail:s.rail,cases:s.cases,unsettled:s.unsettled,outside:s.outsideEquivalentScreen,worst:s.worstEquivalent.largestEquivalentRatio})),null,2));
