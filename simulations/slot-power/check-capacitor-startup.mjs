import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {circuitGraph} from '../../lib/circuit-graph.mjs';
import {createEngine} from '../power-reset/engine.mjs';

const input = process.argv[2] ?? 'dist/board.circuit.json';
const raw = await readFile(input), json = JSON.parse(raw), g = circuitGraph(json);
const names = ['C135', 'C136'];
for (const name of names) {
  const c = g.component(name);
  if (c.manufacturer_part_number !== 'APXF6R3ARA331MF61G' || Math.abs(c.capacitance-330e-6)>1e-12
    || g.net(name,'pin1')!==g.net('PCIe','A9') || g.net(name,'pin2')!==g.net('ATX','pin3')) {
    throw Error('Unexpected part or connection: '+name);
  }
}
const modelFile = 'simulations/slot-power/vendor/DMP2008UFG.spice.txt';
const originalModel = await readFile(modelFile,'utf8');
// Retain the vendor file intact. ngspice's Level-3 MOS model rejects the
// SIMetrix N=10 MOS-junction parameter. The explicit external body diode is
// unchanged. This adaptation is for forward-channel startup screening only.
const model = originalModel.replace(/\r/g,'').replace(/^\.SIMULATOR DEFAULT\s*$/gmi,'')
  .replace('IS=1E-15 N=10)', 'IS=1E-15)')
  .replace('Rta 30 23 1E-20', 'Rta 30 23 1E-6');
const engine = await createEngine();
const out = 'dist/slot-power/capacitor-startup'; await mkdir(out,{recursive:true});
const series = g.component('R_SLOT_GATE_3V3').resistance;
const pullup = g.component('R_SLOT_OFF_3V3').resistance;
const gateC = g.component('C_SLOT_GATE_3V3').capacitance;
const bleeder = g.component('R_SLOT_DISCHARGE_3V3').resistance;
const currentA = 3;
const results=[], waves=[];
for (const bank of ['old-560uF','new-2x330uF'])
for (const supplyV of [3.14,3.465])
for (const cardUF of [0,1000])
for (const load of ['idle','resistive-3A','uvlo-current-3A'])
for (const timing of ['fast','slow'])
for (const capFactor of [1.2,1.44]) {
  // Explicit sensitivity cases, not guaranteed vendor process corners.
  const temperatureC = timing==='fast'?25:85;
  const gateFactor = timing==='fast'?.5:1.1;
  // Initial +20% tolerance, then an additional +20% drift sensitivity.
  // The latter matches the analytical power screen, not a measured curve.
  const branchCaps = bank==='old-560uF'?[560e-6]:names.map(n=>g.component(n).capacitance);
  const esr = bank==='old-560uF'?.008:.010;
  const outputBranches = branchCaps.map((c,i)=>`R_ESR${i} out cap${i} ${esr+.003}\nC_BULK${i} cap${i} 0 ${c*capFactor} IC=0`).join('\n');
  const loadLine = load==='idle'?'R_LOAD out 0 1e9':load==='resistive-3A'?`R_LOAD out 0 ${3.3/currentA}`
    :`B_LOAD out 0 I={${currentA}*min(max((V(out)-2.3)/.5,0),1)}`;
  const deck = `Cold plug slot 3V3 startup: ${bank} ${supplyV}V ${cardUF}uF ${load} ${timing} ${capFactor}C
.temp ${temperatureC}
.options reltol=1e-5 abstol=1e-9 vntol=1e-7 method=gear
V_SUPPLY vin 0 PWL(0 0 100u ${supplyV} 30m ${supplyV})
R_SOURCE vin lin .025
L_SOURCE lin source 200n
V_CONTROL control 0 PWL(0 0 2m 0 2.001m 2.4 30m 2.4)
B_DRIVER gate_sink 0 I={min(max(V(control)/1.8,0),1)*min(max(V(gate_sink),0)/2.8,.01)}
R_GATE gate_sink gate ${series*(timing==='fast'?.99:1.01)}
R_PULLUP source gate ${pullup*(timing==='fast'?1.01:.99)}
C_GATE source gate ${gateC*gateFactor} IC=0
X_POWER drain gate source DMP2008UFG
V_DRAIN drain out 0
${outputBranches}
${cardUF?`R_CARD out card .02\nC_CARD card 0 ${cardUF*1e-6} IC=0`:''}
C_CERAMIC out 0 ${g.component('C131').capacitance} IC=0
R_BLEED out 0 ${bleeder}
${loadLine}
B_IMON imon 0 V={I(V_DRAIN)}
B_PMON pmon 0 V={max(V(source,drain)*I(V_DRAIN),0)}
B_VDS vds 0 V={V(source,drain)}
B_VGS vgs 0 V={V(source,gate)}
${model}
.tran 5u 30m 0 5u
.save v(out) v(imon) v(pmon) v(vds) v(vgs) v(source)
.end
`;
  await writeFile(`${out}/last-input.cir`,deck);
  const sim=await engine.simulate(deck);
  const graphs=sim.simulationResultCircuitJson;
  const wave=name=>{
    const q=graphs.find(e=>e.type==='simulation_transient_voltage_graph'&&e.name===name);
    if(!q||q.timestamps_ms.length<100||q.timestamps_ms.at(-1)<29.99||!q.voltage_levels.every(Number.isFinite)) throw Error('Invalid waveform '+name);
    return q;
  };
  const v=wave('out'), current=wave('imon'), power=wave('pmon'), vds=wave('vds'), vgs=wave('vgs');
  const t=v.timestamps_ms;
  const peak=(a)=>Math.max(...a.voltage_levels);
  const crossing=f=>{const k=v.voltage_levels.findIndex((x,i)=>t[i]>=2&&x>=supplyV*f);return k<0?null:t[k]-2;};
  let energyJ=0, chargeC=0;
  for(let i=1;i<t.length;i++){
    const dt=(t[i]-t[i-1])/1000;
    energyJ+=dt*(power.voltage_levels[i]+power.voltage_levels[i-1])/2;
    chargeC+=dt*(current.voltage_levels[i]+current.voltage_levels[i-1])/2;
  }
  const peakIndex=power.voltage_levels.indexOf(peak(power));
  const result={bank,supplyV,cardCapacitanceUF:cardUF,load,timing,temperatureC,gateCapacitanceUF:gateC*gateFactor*1e6,
    bulkCapacitanceFactor:capFactor,boardBulkCapacitanceUF:branchCaps.reduce((a,b)=>a+b,0)*1e6,
    boardBulkSimulatedUF:branchCaps.reduce((a,b)=>a+b,0)*capFactor*1e6,
    peakSwitchCurrentA:peak(current),peakSwitchPowerW:peak(power),switchEnergyThrough30msJ:energyJ,
    deliveredChargeThrough30msC:chargeC,timeTo10PercentMs:crossing(.1),timeTo90PercentMs:crossing(.9),
    finalOutputV:v.voltage_levels.at(-1),peakOutputV:peak(v),finalGateMagnitudeV:vgs.voltage_levels.at(-1),
    peakPowerOperatingPoint:{timeMs:t[peakIndex],vdsV:vds.voltage_levels[peakIndex],currentA:current.voltage_levels[peakIndex]},
    settledAbove90PercentAt30ms:v.voltage_levels.at(-1)>=supplyV*.9};
  results.push(result);
  waves.push({caseIndex:results.length-1,timeMs:t,outV:v.voltage_levels,currentA:current.voltage_levels,powerW:power.voltage_levels,vdsV:vds.voltage_levels});
  if(results.length===1||results.length%24===0)console.log(`${results.length}/96 startup cases completed`);
  await writeFile(`${out}/${bank}-${supplyV}-${cardUF}-${load}-${timing}-${capFactor}C.cir`,deck);
}
const selected=results.filter(x=>x.bank==='new-2x330uF');
const worstKey=key=>results.indexOf(selected.reduce((a,b)=>b[key]>a[key]?b:a));
const selectedWaves=[...new Set([worstKey('peakSwitchCurrentA'),worstKey('peakSwitchPowerW')])].flatMap(i=>{
  const r=results[i],oldIndex=results.findIndex(x=>x.bank==='old-560uF'&&['supplyV','cardCapacitanceUF','load','timing','bulkCapacitanceFactor'].every(k=>x[k]===r[k]));
  return [waves[i],waves[oldIndex]];
});
const report={sourceFile:input,sourceSha256:createHash('sha256').update(raw).digest('hex'),
  model:{file:modelFile,sourceUrl:'https://www.diodes.com/spice/download/2274/DMP2008UFG.spice.txt',sha256:createHash('sha256').update(originalModel).digest('hex'),adaptation:'Normalized CRLF, removed .SIMULATOR DEFAULT and unsupported Level-3 MOS N=10 at runtime. Explicit body diode and channel/gate parameters retained. Rta is changed from 1e-20 to 1e-6 ohm for numerical convergence. Original vendor file remains intact.',processCornersGuaranteed:false},
  scope:'Changed SLOT_3V3 capacitor bank only, compared with the former 560 uF capacitor. Manufacturer DMP2008UFG channel and nonlinear gate capacitances are included.',
  assumptions:{controlV:2.4,sourceResistanceOhm:.025,sourceInductanceNH:200,supplyRiseUS:100,enableTimeMS:2,
    branchRoutingResistanceOhm:.003,bulkCapacitanceFactors:[1.2,1.44],bulkCapacitanceFactorNote:'1.2 is initial tolerance; 1.44 adds a further 20% drift sensitivity.',cardESROhm:.02,cardCapacitanceUF:[0,1000],
    loads:'Idle, 3 A at 3.3 V resistor, and an assumed 2.3-2.8 V UVLO-ramped 3 A current load. No real endpoint model.',
    gateDriver:'Existing NX3008NBK 2.8 ohm/10 mA on-state envelope; no guaranteed hot-corner driver model.'},
  checks:{cases:results.length,allSettledAbove90PercentAt30ms:selected.every(x=>x.settledAbove90PercentAt30ms),
    maximumNewPeakCurrentA:Math.max(...selected.map(x=>x.peakSwitchCurrentA)),maximumNewPeakPowerW:Math.max(...selected.map(x=>x.peakSwitchPowerW)),
    maximumNewTimeTo90PercentMs:Math.max(...selected.map(x=>x.timeTo90PercentMs??Infinity))},
  results,limitations:['Typical vendor model, not a guaranteed production or electrothermal model; 85 C is sensitivity only.',
    'Output ramp time is simulated rather than equated to the gate RC constant. A specific GPU/card, PSU and cable remain unmodeled.',
    'The 1000 uF added card capacitance is an explicit assumption. Larger capacitance and other load timing require another run.',
    'Single-pulse SOA, startup repetition, hot restart, slow shutdown and fault survival still require temperature-aware review and hardware measurements.',
    'No local current limiting exists. Passing the settling screen does not qualify MOSFET SOA or arbitrary card compatibility.'],hardwareQualified:false};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
await writeFile(`${out}/selected-waveforms.json`,JSON.stringify(selectedWaves));
console.log(JSON.stringify(report.checks,null,2));
if(!report.checks.allSettledAbove90PercentAt30ms)process.exitCode=1;
