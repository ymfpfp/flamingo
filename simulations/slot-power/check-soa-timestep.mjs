import {readFile,writeFile} from 'node:fs/promises';
import {createEngine} from '../power-reset/engine.mjs';

const out=process.argv[2]??'dist/slot-startup-soa-2026-10-22';
const report=JSON.parse(await readFile(`${out}/results.json`));
const waves=JSON.parse(await readFile(`${out}/selected-waveforms.json`));
const engine=await createEngine(),results=[];
for(const rail of ['3V3','12V'])for(const [kind,event] of [['cold','startup'],['control-restart','shutdown'],['source-restart','restart']]){
  const name=`${rail}-${kind}-${event}`,w=waves.find(x=>x.name===name),q=report.results[w.index],baseline=q.events[event];
  const deck=await readFile(`${out}/${name}.cir`,'utf8');
  const maxStep=kind==='control-restart'?'10u':'1u';
  const fine=deck.replace(/\.tran \S+ (\S+) 0 \S+/,`.tran ${maxStep} $1 0 ${maxStep}`);
  const sim=await engine.simulate(fine);
  const wave=n=>sim.simulationResultCircuitJson.find(e=>e.type==='simulation_transient_voltage_graph'&&e.name===n);
  const t=wave('out').timestamps_ms,volts=wave('vds').voltage_levels,current=wave('imon').voltage_levels,power=wave('pmon').voltage_levels;
  if(t.at(-1)<baseline.eventEndMs-.01)throw Error(`Incomplete refined waveform: ${name}`);
  const nominal=rail==='3V3'?3.3:12;
  const indices=t.flatMap((v,i)=>v>=baseline.eventStartMs&&v<=baseline.eventEndMs&&volts[i]>Math.max(.05,.03*nominal)&&current[i]>.05?[i]:[]);
  let energy=0,peak=0;
  for(let i=indices[0]+1;i<=indices.at(-1);i++)energy+=(t[i]-t[i-1])/2000*(power[i]+power[i-1]);
  for(const i of indices)peak=Math.max(peak,power[i]);
  const peakRelativeChange=Math.abs(peak-baseline.peakPowerW)/baseline.peakPowerW;
  const energyRelativeChange=Math.abs(energy-baseline.energyJ)/baseline.energyJ;
  const result={name,caseIndex:q.index,refinedMaxStep:maxStep,baselinePeakPowerW:baseline.peakPowerW,refinedPeakPowerW:peak,
    baselineEnergyJ:baseline.energyJ,refinedEnergyJ:energy,peakRelativeChange,energyRelativeChange,
    passed:peakRelativeChange<.03&&energyRelativeChange<.03};
  results.push(result);console.log(name,result.passed,peakRelativeChange,energyRelativeChange);
  await writeFile(`${out}/timestep-checks.json`,JSON.stringify({results,passed:results.every(x=>x.passed)},null,2)+'\n');
}
if(results.some(x=>!x.passed))process.exitCode=1;
