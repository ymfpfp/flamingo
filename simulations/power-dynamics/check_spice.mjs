// Independent passive-network solver check. No regulator model is present.
import {readFileSync,writeFileSync} from 'node:fs';
import {createEngine} from '../power-reset/engine.mjs';
const dir=process.argv[2]??'dist/power-dynamics';
const reference=JSON.parse(readFileSync(`${dir}/passive-crosscheck-reference.json`));
const engine=await createEngine();
const result=await engine.simulate(readFileSync(`${dir}/passive-crosscheck.cir`,'utf8'));
const graph=result.simulationResultCircuitJson.find(g=>g.type==='simulation_transient_voltage_graph'&&g.name==='load');
if(!graph)throw Error('Missing ngspice load waveform');
const times=graph.timestamps_ms.map(t=>t/1000), voltages=graph.voltage_levels;
writeFileSync(`${dir}/spice-waveform.json`,JSON.stringify({time:times,voltage:voltages})+'\n');
let j=0,maxError=0,fullMaxError=0,count=0,maximumAt=null;
const c=reference.case;
const edges=[.25e-6,.25e-6+c.loadRiseNS*1e-9,.25e-6+c.assumedDelayUS*1e-6,
  .25e-6+(c.assumedDelayUS+c.assumedCurrentRiseUS)*1e-6];
for(let i=0;i<times.length;i++){
  const t=times[i];
  if(t<reference.time[0]||t>reference.time.at(-1))continue;
  while(j+1<reference.time.length&&reference.time[j+1]<t)j++;
  if(j+1===reference.time.length)break;
  const f=(t-reference.time[j])/(reference.time[j+1]-reference.time[j]);
  const v=reference.voltage[j]*(1-f)+reference.voltage[j+1]*f;
  fullMaxError=Math.max(fullMaxError,Math.abs(voltages[i]-v));
  // PWL currents and the sampled current derivatives differ within two
  // Python timesteps at each slope discontinuity. Report that error separately.
  if(t<20e-9)continue;
  if(edges.some(edge=>Math.abs(edge-t)<4e-9))continue;
  if(Math.abs(voltages[i]-v)>maxError){maxError=Math.abs(voltages[i]-v);maximumAt={timeUS:t*1e6,spiceV:voltages[i],scipyV:v};}count++;
}
const spiceMinimumV=Math.min(...voltages.slice(20));
const scipyMinimumV=Math.min(...reference.voltage);
const check={name:'SciPy state-space versus ngspice passive RLC circuit',samples:count,
  maximumInteriorWaveformDifferenceMV:maxError*1000,maximumIncludingSlopeEdgesMV:fullMaxError*1000,
  excludedSlopeEdgeWindowNS:4,minimumDifferenceMV:Math.abs(spiceMinimumV-scipyMinimumV)*1000,
  maximumAt,spiceMinimumV,scipyMinimumV,passed:count>100&&maxError<.0002&&Math.abs(spiceMinimumV-scipyMinimumV)<.0001,
  scope:'Independent numerical implementation of the same assumed passive network and prescribed current sources. This does not validate the physical assumptions or the TPS62903 control loop.'};
writeFileSync(`${dir}/spice-check.json`,JSON.stringify(check,null,2)+'\n');
console.log(JSON.stringify(check,null,2));
if(!check.passed)process.exitCode=1;
