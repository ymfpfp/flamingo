// Summarize measured geometry and explicitly conditional electrical screens.
// Run after the checks listed in the generated report. This does not edit copper.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {electricalMargins} from '../tests/audits/schematic-audit.mjs';
import {auditUsb4Routing} from '../tests/audits/usb4-routing-audit';
import {auditPcieTxRouting} from '../tests/audits/pcie-tx-routing-audit';
import {auditPcieRxRouting} from '../tests/audits/pcie-rx-routing-audit';
import {auditBridgeClockRouting} from '../tests/audits/bridge-clock-routing-audit';
import {circuitGraph} from '../lib/circuit-graph.mjs';
import {pcieTxContacts} from '../lib/pcie-tx-routing';
import {pcieRxContacts} from '../lib/pcie-rx-routing';

const sourceFile = process.argv[2] ?? 'dist/board.circuit.json';
const raw = readFileSync(sourceFile), board = JSON.parse(raw);
const sha = createHash('sha256').update(raw).digest('hex');
const out = 'dist/first-try-review';
mkdirSync(out, {recursive:true});
const recheckFile = `${out}/source-recheck.circuit.json`;
const sourceRecheckSha256 = createHash('sha256').update(readFileSync(recheckFile)).digest('hex');
if (sourceRecheckSha256 !== sha) throw Error('The latest source build differs from the reviewed board');
function checked(file, hashKey = 'sourceSha256') {
  const r = JSON.parse(readFileSync(file));
  if (r[hashKey] !== sha) throw Error(`Stale report: ${file}`);
  copyFileSync(file, `${out}/${file.split('/').at(-2)}-${file.split('/').at(-1)}`);
  return r;
}
const validation = checked('dist/validation/board.json');
const pdn = checked('dist/power-distribution/dc-audit.json');
const slot = checked('dist/slot-power-routing/dc-audit.json');
const atx5 = checked('dist/atx5v-routing/dc-audit.json');
const pcieZ = checked('dist/pcie-si/report.json', 'source_sha256');
const usbZ = checked('dist/usb4-si/report.json', 'source_sha256');
const drivers = checked('dist/slot-power/driver/report.json');
const controls = checked(`${out}/control-physical.json`);
const controlZ = checked(`${out}/control-impedance.json`);
const native = checked('dist/control-routing/controls17/final-native-connectivity.json');
const reset = JSON.parse(readFileSync('dist/power-reset/report.json'));
copyFileSync('dist/power-reset/report.json', `${out}/power-reset-report.json`);
const sourceArtifactComparison = JSON.parse(readFileSync(`${out}/source-artifact-comparison.json`));
if (sourceArtifactComparison.baselineSha256 !== sha) throw Error('Source/artifact comparison is stale');
const regressionLog = readFileSync(`${out}/regression-final.log`, 'utf8');
const regression = Object.fromEntries(['pass','skip','fail'].map(status => {
  const match = regressionLog.match(new RegExp(`^\\s*(\\d+) ${status}\\s*$`, 'm'));
  if (!match) throw Error('Missing regression summary: '+status);
  return [status, Number(match[1])];
}));
if (regression.fail) throw Error('Regression failures remain');
const margins = electricalMargins(board);
const usb = auditUsb4Routing(board), tx = auditPcieTxRouting(board), rx = auditPcieRxRouting(board), clocks = auditBridgeClockRouting(board);
for (const a of [usb, tx, rx, clocks]) if (!a.passed) throw Error(JSON.stringify(a.failures));

// Linear scaling is valid only for this fixed-temperature resistor network
// with the same equal-ball current distribution. It is not a thermal model.
const rails = pdn.results.map(r => {
  const m = margins.converter.find(c => c.rail === r.rail);
  const minimum = r.rail === 'VCCL' ? 1.85 : 1.10;
  const f = m.nominalSwitchingFrequencyHz * .9;
  const capacitiveRipplePPMV = m.peakToPeakInductorRippleA / (8*f*m.minimumEffectiveCapacitanceSensitivityUF*1e-6)*1000;
  return {rail:r.rail, regulatorMinimumV:m.minimumV, regulatorNominalV:m.nominalV,
    regulatorMaximumV:m.maximumV, minimumRequiredV:minimum,
    dcDropAt3AMV:r.fine.maximumDropMV, dcDropWithMeshAllowanceAt3AMV:r.screeningUpperDropMV,
    remainingStaticMarginMV:m.remainingLowerMarginMV,
    currentForZeroStaticMarginA:3*m.remainingLowerMarginMV/r.screeningUpperDropMV,
    currentFor8MVDistributionBudgetA:3*8/r.screeningUpperDropMV,
    capacitiveRipplePPMV, effectiveCapacitanceSensitivityUF:m.minimumEffectiveCapacitanceSensitivityUF,
    loads:[.5,1,1.5,2,2.5,3].map(currentA => {
      const dropMV = r.screeningUpperDropMV*currentA/3;
      const availableMV = m.remainingLowerMarginMV-dropMV;
      return {currentA, dropMV, pinMinimumBeforeRippleV:m.minimumV-dropMV/1000,
        remainingBeforeRippleMV:availableMV,
        idealCapOnlyTimeFor1AStepUS:Math.max(0,availableMV/1000)*m.minimumEffectiveCapacitanceSensitivityUF};
    }),
    scope:'Conditional sum of existing static tolerances and fixed-temperature PCB resistance. No ground/package drop, ESR/ESL, ripple, load regulation or dynamic regulator response. Cap-only time assumes every capacitor is immediately accessible and gives an optimistic charge-reserve comparison.'};
});
const currentResearchFile = 'datasheets/research/asm2464-rail-current-2026-10-21.json';
const currentResearch = JSON.parse(readFileSync(currentResearchFile));
const bridgeCurrentProxy = {research:currentResearch, researchFile:currentResearchFile,
  scope:'Linear rescaling of the existing 80 C fixed-temperature resistance model, retaining equal current per bridge rail ball and the same mesh allowance. No new converter or thermal simulation.',
  cases:rails.flatMap(r=>[...currentResearch.pdxProxy.sensitivityMultipliers.map(multiplier=>({
    label:`PD maximum x ${multiplier}`,multiplier,currentA:currentResearch.pdxProxy.baselineCurrentA[r.rail]*multiplier})),
    {label:'Rounded guardband case',currentA:currentResearch.pdxProxy.roundedGuardbandCaseA[r.rail]}].map(c=>{
      const dropMV=r.dcDropWithMeshAllowanceAt3AMV*c.currentA/3;
      const remainingBeforeRippleMV=r.remainingStaticMarginMV-dropMV;
      return {...c,rail:r.rail,dropMV,pinMinimumBeforeRippleV:r.regulatorMinimumV-dropMV/1000,
        remainingBeforeRippleMV,staticOnlyPass:remainingBeforeRippleMV>=0};
    }))};
writeFileSync(`${out}/bridge-current-proxy.json`,JSON.stringify({sourceSha256:sha,...bridgeCurrentProxy},null,2)+'\n');
const slotInputResearchFile='datasheets/research/slot-input-voltage-2026-10-22.json';
const slotInputResearch=JSON.parse(readFileSync(slotInputResearchFile));
const slotChannels = slot.channels.map(r => {
  const dropMV = r.conductorUpperDropMV+r.mosfetDrop25CMaxRdsMV;
  const nominal = r.rail === '12V' ? 12 : 3.3;
  const minimumSlotV = nominal * (r.rail === '12V' ? .92 : .91);
  const sourceCases=(r.rail==='12V'?[{label:'Retained -5% input screen',sourceV:11.4},{label:'ATX 3 table numeric minimum',sourceV:11.2}]
    :[{label:'Retained -5% input screen',sourceV:3.135},{label:'ATX 3 table numeric minimum',sourceV:3.14}])
    .map(c=>({...c,slotV:c.sourceV-dropMV/1000,remainingMarginMV:(c.sourceV-dropMV/1000-minimumSlotV)*1000,
      totalDcDropBudgetMV:(c.sourceV-minimumSlotV)*1000}));
  return {...r, totalScreenDropMV:dropMV,sourceCases,
    minimumSlotV, minimumSlotVoltageSource:r.rail === '12V'
      ? 'Intel ATX design guide, PCIe AIC power connectors: -8% at edge card connector'
      : 'PCI-SIG system-board design guide, x16 rail tolerance: +/-9%',
    minimumSourceVForScreenV:nominal*.95,
    remainingAtLowSourceMV:(nominal*.95-dropMV/1000-minimumSlotV)*1000,
    nominalSourceSlotVoltageV:nominal-dropMV/1000,
    minus5PercentSourceSlotVoltageV:nominal*.95-dropMV/1000,
    twiceRdsSensitivitySlotVoltageV:nominal*.95-(r.conductorUpperDropMV+2*r.mosfetDrop25CMaxRdsMV)/1000,
    equivalentConductorResistanceOhm:r.conductorUpperDropMV/1000/r.currentA,
    conservativeI2REquivalentW:r.currentA*r.conductorUpperDropMV/1000+r.mosfetDissipation25CMaxRdsW};
});

// Extend the earlier planning formula to ACTUAL routed conductors. Local
// narrow sections use their emitted width. No component allowance is treated
// as a known bound, and no channel pass/fail follows from this calculation.
const st = new Map(board.filter(e=>e.type==='source_trace').map(e=>[e.source_trace_id,e]));
const physicalTraces=board.filter(e=>e.type==='pcb_trace'),graph=circuitGraph(board),traceLabels=new Map();
const port=(part,pin)=>{const sp=graph.port(part,pin);return board.find(e=>e.type==='pcb_port'&&e.source_port_id===sp.source_port_id);};
const labelRoute=(a,b,bus,name)=>{
  const found=physicalTraces.filter(t=>[a,b].every(p=>[t.route[0],t.route.at(-1)].some(q=>Math.hypot(q.x-p.x,q.y-p.y)<1e-4)));
  if(found.length!==1)throw Error(`Missing or ambiguous ${bus} route: ${name}`);
  traceLabels.set(found[0].pcb_trace_id,{bus,name});
};
for(const t of physicalTraces){const name=st.get(t.source_trace_id)?.name;
  if(name?.startsWith('USB4_'))traceLabels.set(t.pcb_trace_id,{bus:'USB4',name:name.match(/^USB4_(?:TX|RX)[12]_[PN]/)[0]});}
const txSlots=[['B14','B15'],['B19','B20'],['B23','B24'],['B27','B28']];
for(const c of pcieTxContacts)for(const [i,pol] of [...'PN'].entries()){
  const cap=`C_TX${c.lane}_${pol}`,name=`TX${c.lane}_${pol}`;
  labelRoute(port('ASM2464PDX',i===0?c.positive:c.negative),port(cap,'pin1'),'PCIe TX',name);
  labelRoute(port(cap,'pin2'),port('PCIe',txSlots[c.lane][i]),'PCIe TX',name);
}
for(const c of pcieRxContacts)for(const [i,pol] of [...'PN'].entries())
  labelRoute(port('ASM2464PDX',i===0?c.positive:c.negative),port('PCIe',c.slot[i]),'PCIe RX',`RX${c.lane}_${pol}`);
const frequencies = [{bus:'USB4',prefix:'USB4_',frequencyHz:10e9}, {bus:'PCIe TX',prefix:'PCIE_TX',frequencyHz:8e9}, {bus:'PCIe RX',prefix:'PCIE_RX',frequencyHz:8e9}];
const traceLoss = (bus,frequencyHz,df,multiplier) => {
  const rho=1.724e-8, mu0=4*Math.PI*1e-7, rs=Math.sqrt(Math.PI*frequencyHz*mu0*rho);
  const groups = new Map();
  for(const trace of board.filter(e=>e.type==='pcb_trace')) {
    const label=traceLabels.get(trace.pcb_trace_id);
    if(label?.bus!==bus)continue;
    const key=label.name;const r=groups.get(key)??{name:key,lengthMm:0,dielectricDb:0,conductorDb:0};
    for(let i=1;i<trace.route.length;i++) {
      const a=trace.route[i-1], b=trace.route[i];
      if(a.route_type!=='wire'||b.route_type!=='wire'||a.layer!==b.layer)continue;
      const l=Math.hypot(a.x-b.x,a.y-b.y)/1000;
      r.lengthMm+=l*1000;
      r.dielectricDb+=20*Math.LOG10E*Math.PI*frequencyHz/299792458*Math.sqrt(4.1)*df*l;
      r.conductorDb+=20*Math.LOG10E*rs/(a.width/1000*42.5)*l*multiplier;
    }
    groups.set(key,r);
  }
  return [...groups.values()].map(r=>({...r,distributedScreenDb:r.dielectricDb+r.conductorDb}));
};
const loss=frequencies.flatMap(s=>[.015,.02,.03].flatMap(df=>[1,2].map(multiplier=>({...s,df,multiplier,conductors:traceLoss(s.bus,s.frequencyHz,df,multiplier)}))));
if(loss.some(r=>r.conductors.length!==8)) throw Error('Incomplete high-speed loss-screen inventory');
for(const s of loss)for(const c of s.conductors){
  const a=(s.bus==='USB4'?usb:s.bus==='PCIe TX'?tx:rx).conductors.find(r=>r.name===(s.bus==='USB4'?c.name.slice(5):c.name));
  if(!a||Math.abs(c.lengthMm-(a.lengthMm??a.copperLengthMm))>1e-5)throw Error('Loss length differs from route audit: '+c.name);
}

const resetSourceFiles=['components/BridgeReset.tsx','components/BuckEnable.tsx',...execFileSync('rg',['--files','simulations/power-reset'],{encoding:'utf8'}).trim().split('\n')];
const manifestFiles=[...execFileSync('rg',['--files','components','imports','lib','manufacturing','simulations','scripts','tests'],{encoding:'utf8'}).trim().split('\n'), currentResearchFile,slotInputResearchFile,'index.circuit.tsx','package.json','bun.lock','jlcpcb-clearance-rules.json'];
const powerDynamics=checked('dist/power-dynamics/results.json');
const passiveSpiceCheck=JSON.parse(readFileSync('dist/power-dynamics/spice-check.json'));
if(!passiveSpiceCheck.passed||powerDynamics.numericChecks.some(c=>!c.passed))throw Error('Power dynamics numeric checks failed');
const hashes = files => Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const results={dateLocal:'2026-10-21',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceFile,sourceSha256:sha,
  estimate:{percent:50,judgmentRangePercent:[30,70],calibrated:false,
    status:'Reassessed after PD current research and conditional ripple / first-response simulation. The coarse estimate remains about 50%.',
    event:'First assembled board establishes USB4 40 Gb/s and PCIe Gen4 x4 links and operates under the board-rated slot-load envelope without hardware changes or rework. Correct firmware is assumed. Link rates do not imply equivalent end-to-end application throughput.',
    setup:'The assessment uses cold-plug operation and a 75 W combined slot load. Separate rail stress cases use 5.5 A at 12 V and 3 A at 3.3 V. The retained -5% input screen is supplemented by the Intel ATX 3 table numeric minima (11.20 V and 3.14 V). Card auxiliary power bypasses this board. No particular GPU, PSU wattage or airflow is assumed. Thermal and startup qualification remain open.',
    rationale:'Coarse engineering judgment, not a probability output from simulations, a test pass fraction, a confidence interval or independent-risk multiplication. PD proxy currents improve the steady-load outlook. Conditional VDD transient failures prevent increasing the estimate. Slot voltage drop, full-channel SI, switch SOA, brownout reset, thermal behavior and BGA acceptance remain open. The range expresses judgment uncertainty only.'},
  sourceRecheck:{file:recheckFile,sourceSha256:sourceRecheckSha256,identical:true},
  sourceArtifactComparison,regression,bridgeCurrentProxy,powerDynamics,passiveSpiceCheck,rails,slotInputResearch,slotChannels,loss,slotVoltageReferences:[
    'https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/atx-version-3-0-multi-rail-desktop-platform-power-supply-design-guide/2.1/pcie-aic-auxiliary-power-connectors/',
    'https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/791/7851.PCIe_5F00_designGuides.pdf'],
  lossScope:'Homogeneous TEM dielectric plus equal-width signal/return skin-loss approximation, with Df and conductor multipliers assumed. Routed planar copper and width changes only. No via/connector/capacitor/ESD/package S-parameters, reflection, roughness specification, temperature variation, dispersion or mode conversion. The multiplier sensitivity is not a guaranteed bound.',
  releaseReady:false,pdnLoadQualified:pdn.passed,
  drcFabricationReady:validation.reports.drc.fabricationReady,
  drcFindingCounts:Object.fromEntries([...new Set(validation.reports.drc.findings.map(f=>f.rule))].map(rule=>[rule,validation.reports.drc.findings.filter(f=>f.rule===rule).length])),
  coverage:{fullChannelSi:false,converterTransient:false,conditionalPassivePdnDynamics:true,electrothermal:false,slotSwitchSoa:false,measuredHardware:false},
  validationPassed:validation.passed,validationScope:'Layout and routing checks only; the validator reports PDN load qualification separately. A true validationPassed does not establish release readiness.',
  validationChecks:Object.fromEntries(Object.entries(validation.reports).map(([k,v])=>[k,v.passed??v.qualified??null])),
  usb,tx,rx,clocks,margins,resetNormal:reset.normalStartupEnvelope,
  resetFaultCases:reset.results.filter(r=>r.failed.length).map(r=>({name:r.name,failed:r.failed})),
  driverOnStatePass:drivers.selectedOnStateRcChecksPass,
  pcieImpedanceOhms:pcieZ.nominal_cross_section.impedance_ohm,
  pcieNumericalChecks:pcieZ.numerical_checks,
  impedanceSensitivity:pcieZ.sensitivity.map(r=>({name:r.name,ohms:r.impedance_ohm})),
  usbUniformSections:usbZ.uniform_cross_sections.map(r=>({name:r.name,ohms:r.pair_comparison_ohm})),
  controlsPhysicalPassed:controls.passed,controlsImpedancePassed:controlZ.passed,
  nativeCounts:Object.fromEntries(['netlist','placement','schematic','ports','missing'].map(k=>[k,native[k].length])),
  thermalReference:{heatsink:'ASMedia datasheet section 6.2.1: UB15-15B 15 x 15 x 15 mm, reference test conditions',thetaJACPerW:17.38,maximumJunctionC:90,
    stillAirPowerAt35CAmbientW:(90-35)/17.38,stillAirPowerAt50CAmbientW:(90-50)/17.38,
    limitation:'Reference heat-sink calculation only. No exact bridge load or thermal model of this assembly, enclosure and airflow. Do not apply this thetaJA to the bare package.'},
  vendorAcceptanceReceived:JSON.parse(readFileSync('manufacturing/bridge-bga/process.json')).vendorAcceptance.received,
  resetSourceSha256:hashes(resetSourceFiles), inputFileSha256:hashes(manifestFiles)};
writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2)+'\n');
const n=(x,d=2)=>Number(x).toFixed(d),esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const table=(heads,rows)=>`<table><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const maxUsb=Math.max(...usb.conductors.map(r=>r.lengthMm));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flamingo hardware review — 21 October 2026</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#173044;background:#f6f8fa;margin:0}main{max-width:1080px;margin:auto;padding:36px 28px 80px}h1{font-size:34px;line-height:1.2}h2{margin-top:38px;font-size:23px}p{max-width:960px}.callout{padding:20px 24px;background:#fff0d9;border-left:5px solid #b76810;margin:22px 0}.danger{background:#ffebe7;border-color:#b54538}table{border-collapse:collapse;width:100%;background:white;font-size:14px;margin:18px 0}th,td{padding:10px;border-bottom:1px solid #dbe2e8;text-align:left;vertical-align:top}th{background:#e7eef3}code{overflow-wrap:anywhere;font-size:12px}a{color:#07599a}li{margin:9px 0}.muted{color:#51697a}img{max-width:100%}</style><main>
<p class="muted">Engineering review • 21 October 2026 • hardware only</p><h1>Flamingo: first-build risk review</h1>
<div class="callout danger"><strong>Recommendation: resolve the power-margin findings before ordering.</strong><p>The updated rough estimate remains <strong>about 50%</strong>, with a judgment range of <strong>30–70%</strong>. Lower bridge-current estimates help, but the conditional VDD transient failures prevent increasing the estimate. This is engineering judgment, not a measured probability or simulation output.</p></div>
<p>${esc(results.estimate.event)} ${esc(results.estimate.setup)}</p>
<div class="callout"><strong>Historical PD proxy analysis.</strong><p>The accepted budgets are 1 A VCCL, 3 A VDD and 100 mA combined VCCH/VCCA33. These results use earlier loads and do not validate those budgets. <a href="../../README.md#bridge-current-budgets">Current planning documentation</a>.</p><p>The PDX datasheet still lists maximum currents as TBD. The <a href="${esc(currentResearch.pd.url)}#page=18">PD datasheet, section 6.3.12</a> supplies the historical 455.7 mA VCCL and 1812.3 mA VDD comparisons. The separate 3 A conductor stress screen remains in force on both rails.</p></div>
<p>The percentage cannot be calibrated from one unbuilt design. These models expose failure mechanisms and margins. They cannot predict assembly yield or first-build success frequency.</p>
<p><strong>Source and generated board differ.</strong> The fresh source build has SHA-256 <code>${sha}</code>. The pre-review generated board has SHA-256 <code>${sourceArtifactComparison.sourceSha256}</code>. The generated board contains additional power copper and ${sourceArtifactComparison.addedVias.length} extra vias. Those changes do not survive the current source build. The report evaluates the reproducible source build. The preserved generated board is in <code>dist/hardware-review-archive/prior-board.circuit.json</code>.</p>
<p>A later source build includes the concurrent connection-cache change. Its complete Circuit JSON has the identical SHA-256. The electrical results therefore apply to that build too.</p>
<p>The routed DRC has no error findings, but it retains ${validation.reports.drc.findings.length} warnings. Its fabrication-ready flag remains false. The warnings cover requested trace widths and the BGA process review. Independent geometry and resistance screens do not close every current-capacity or assembly concern.</p>
<h2>Results that matter</h2>
${table(['Area','Result','Meaning'],[
['Connectivity and fabrication screens',validation.passed?'PASS':'FAIL — see board report','Fresh routed build, netlist, schematic placement, copper clearances, shorts and routing style.'],
['Assembly placement',`${native.placement.length} native findings`,'All assembled components remain on top. Factory acceptance of the BGA process remains open.'],
['Bridge supply margin','STATIC PASS AT PD PROXY; TRANSIENT MARGIN OPEN','VCCL / VDD retain about 11.2 / 2.0 mV after the switching-ripple screen. VDD violates its minimum in plausible conditional load-step cases. PDX currents and the actual regulator response remain unqualified.'],
['Slot power','OPEN',`12 V estimated board loss ${n(slotChannels[0].totalScreenDropMV)} mV at 5.5 A. Source, ground, hot-device and card limits remain additional terms.`],
['USB4 / PCIe geometry','PASS','Lengths, planar skew, via counts, coupled-route spacing and reference-plane projection pass their implemented checks. Launch regions retain separate limits.'],
['Nominal uniform differential impedance',`${n(results.pcieImpedanceOhms)} Ω`,'Within the 85 Ω target bands. Actual transitions and complete channels remain unsolved.'],
['Normal-startup reset sensitivity',`${reset.normalStartupEnvelope.cases}/${reset.normalStartupEnvelope.cases} pass`,`${n(reset.normalStartupEnvelope.minimumMarginMs)} ms minimum modeled margin, under prescribed rail waveforms.`],
['Selected gate-driver RC model',drivers.selectedOnStateRcChecksPass?'PASS':'FAIL','On-state envelope only. No power-MOSFET channel, Miller dynamics, output ramp, SOA or temperature simulation.'],
['Control copper / uniform impedance',`${controls.passed?'PASS':'FAIL'} / ${controlZ.passed?'PASS':'FAIL'}`,'Nominal control-line cross sections do not establish flash bus setup/hold, stub reflections or complete signal integrity.']])}
<h2>1. Bridge power: combine tolerances with PCB drop</h2>
<p>The PD current proxy gives a more relevant starting load than the regulator rating. The PDX core voltage remains about 1.13 V. The PD core voltage is 1.05 V, so its current limits do not directly qualify the PDX.</p>
${table(['Rail / load case','Assumed current','PCB loss + mesh allowance','Pin voltage before ripple','Remaining static margin'],bridgeCurrentProxy.cases.filter(c=>[1,1.2,1.25].includes(c.multiplier)||c.label==='Rounded guardband case').map(c=>[`${c.rail} / ${c.label}`,`${n(c.currentA,4)} A`,`${n(c.dropMV)} mV`,`${n(c.pinMinimumBeforeRippleV,5)} V`,`${n(c.remainingBeforeRippleMV)} mV`]))}
<p>Both rails pass the static-only screen at the PD documented maxima. VDD retains about 2.30 mV before ripple, ground and package losses, and transients. A 20% current increase exhausts that margin. The added percentages are sensitivity assumptions, not guaranteed PDX load bounds.</p>
<p>Results and source details: <a href="bridge-current-proxy.json">PD current proxy calculation</a>. This update rescales the existing resistance model. It does not simulate converter dynamics or establish typical chip current.</p>
<h3>Switching ripple and first-response sensitivity at PD proxy currents</h3>
<p>The harmonic model uses the actual capacitor inventory and Samsung typical impedance, DC-bias and AC-amplitude curves. It separates the regulator and bridge capacitor banks. It uses the existing 80 °C board resistance, with assumed link and mounting inductances. These assumptions do not establish a guaranteed noise bound.</p>
${table(['Rail / PD current proxy','Switching ripple at regulator','Switching ripple at chip','Static low-corner margin after ripple'],powerDynamics.summary.map(r=>[`${r.rail} / ${n(r.proxyCurrentA,4)} A`,`${n(r.sourceRippleRangePPMV[0])}–${n(r.sourceRippleRangePPMV[1])} mV pp`,`${n(r.rippleRangePPMV[0],3)}–${n(r.rippleRangePPMV[1],3)} mV pp`,`${n(r.minimumRemainingStaticAfterRippleMV)} mV`]))}
<p>The small chip ripple follows from the modeled filtering between the two banks. Common-ground noise, switching coupling, package impedance and controller behavior can add noise. Peak modeled inductor current stays below 2.1 A at the PD proxy loads, below the 4 A minimum current-limit threshold.</p>
<p>The example load step rises from 50% to 100% of the PD maximum in 200 ns. The source current starts catching up after an assumed 0.5 µs delay, then uses the ideal maximum buck slew. The model uses reduced capacitance, 5 nH interconnect inductance and 1 nH added mounting inductance per capacitor. These are sensitivity inputs, not measurements.</p>
${table(['Rail','Step','Nominal pin minimum','Low-tolerance pin minimum','Required minimum'],powerDynamics.summary.map(r=>{const c=r.halfLoadStepExample.find(c=>c.direction==='up');return [r.rail,`${n(c.initialCurrentA,4)} → ${n(c.finalCurrentA,4)} A`,`${n(c.nominalMinimumV,5)} V`,`${n(c.lowToleranceMinimumV,5)} V`,r.rail==='VCCL'?'1.850 V':'1.100 V'];}))}
<p>VDD reaches about 1.0924 V at the low tolerance corner in this example. With typical DC-biased capacitance, that example reaches about 1.0982 V. Its nominal-voltage case stays above 1.10 V. Thus this is a margin problem at a conditional corner, not proof that every board fails.</p>
<p>Load release also matters. The reduced-capacitance VDD example reaches about 1.1557 V at the high tolerance corner. The separate 50%-nominal capacitance sensitivity reaches about 1.1635 V, above the 1.16 V limit. Raising the setpoint alone needs a new upper-voltage check.</p>
<img src="../power-dynamics/first-response.png" alt="Conditional VCCL and VDD first-response curves at several assumed current-response delays.">
<img src="../power-dynamics/delay-sensitivity.png" alt="Remaining low-corner voltage margin versus assumed regulator response delay.">
<p>TI's PSpice and SIMPLIS models are encrypted. No vendor closed-loop transient simulation was run. This model predicts only a conditional first dip or peak. It cannot predict actual recovery, loop stability or startup.</p>
<p>All ${powerDynamics.numericChecks.length} numerical controls pass. The independent ngspice circuit agrees with the SciPy minimum within ${n(passiveSpiceCheck.minimumDifferenceMV,6)} mV. Differences at slope discontinuities are reported separately. Agreement checks the mathematics, not the physical assumptions.</p>
<p><a href="../power-dynamics/report.html">Detailed ripple and transient report</a> · <a href="../power-dynamics/results.json">All model cases, assumptions and source hashes</a> · <a href="../power-dynamics/spice-check.json">Independent passive-network check</a></p>
<h3>Retained 3 A regulator-rating stress case</h3>
<p>The regulator setpoints and LC selections pass separately. The table combines regulator tolerances with PCB loss at 3 A per rail and 80 °C copper. Negative margin is a conditional voltage failure. The model applies equal current per bridge supply ball.</p>
${table(['Rail','Regulator low corner','PCB drop at 3 A','Drop + mesh allowance','Pin voltage before ripple','Required minimum'],rails.map(r=>[r.rail,`${n(r.regulatorMinimumV,5)} V`,`${n(r.dcDropAt3AMV)} mV`,`${n(r.dcDropWithMeshAllowanceAt3AMV)} mV`,`${n(r.regulatorMinimumV-r.dcDropWithMeshAllowanceAt3AMV/1000,5)} V`,`${n(r.minimumRequiredV,3)} V`]))}
<p>These are conditional corner failures. They do not prove that the actual bridge draws 3 A or that a nominal prototype fails. Ground return, package drop, regulator load regulation, ripple and transients consume additional margin.</p>
<img src="power-margin.png" alt="Remaining static voltage margin versus assumed bridge rail load, before ripple and transients.">
${table(['Rail / current','PCB loss with allowance','Margin before ripple','Ideal cap-only reserve for a 1 A step'],rails.flatMap(r=>r.loads.map(l=>[`${r.rail} / ${n(l.currentA,1)} A`,`${n(l.dropMV)} mV`,`${n(l.remainingBeforeRippleMV)} mV`,`${n(l.idealCapOnlyTimeFor1AStepUS,3)} µs`])))}
<p>The charge-reserve comparison uses ΔV = ΔI × Δt / C with the existing capacitance sensitivity. It assumes immediate access to the entire bank. It excludes ESR, ESL and converter response, so it cannot predict the actual load-step waveform.</p>
<p>The retained ideal-capacitor ripple terms are ${rails.map(r=>`${r.rail}: ${n(r.capacitiveRipplePPMV)} mV peak-to-peak`).join(', ')}. The new harmonic screen above adds typical ESR/ESL and bank separation. Actual total rail noise remains unqualified.</p>
<p>Best next changes: reduce resistance in the shared rail paths, then review feedback setpoints or sensing. Preserve both high-voltage and low-voltage limits. Obtain bridge rail-current data before selecting a final load envelope.</p>
<p>The 5 V input screen ${atx5.passed?'passes':'fails'} at 2 A per converter. Its worst drop with allowance is ${n(Math.max(...atx5.results.map(r=>r.withMeshAllowanceMV)))} mV. This does not close the output-rail findings.</p>
<h2>2. Slot power at the board rating</h2>
${table(['Rail / stress load','Copper + allowance','MOSFET drop, 25 °C max Rds','Combined loss','At nominal source','At source −5%'],slotChannels.map(r=>[`${r.rail} / ${r.currentA} A`,`${n(r.conductorUpperDropMV)} mV`,`${n(r.mosfetDrop25CMaxRdsMV)} mV`,`${n(r.totalScreenDropMV)} mV`,`${n(r.nominalSourceSlotVoltageV,3)} V`,`${n(r.minus5PercentSourceSlotVoltageV,3)} V`]))}
<p>The individual rail stress loads are separate envelopes. Their nominal powers total 75.9 W, so they do not authorize simultaneous use beyond the 75 W slot budget.</p>
<p>The 12 V path loses about ${n(slotChannels[0].totalScreenDropMV/120,1)}% before connector contact loss, ground return and hot MOSFET resistance. Copper stays fixed at 80 °C in this model. No electrothermal solution or temperature prediction follows from the resistor screen.</p>
${table(['Rail','Slot voltage at -5% input','Connector minimum','Remaining margin'],slotChannels.map(r=>[r.rail,`${n(r.minus5PercentSourceSlotVoltageV,4)} V`,`${n(r.minimumSlotV,3)} V`,`${n(r.remainingAtLowSourceMV)} mV`]))}
<div class="callout danger"><strong>22 October correction: -5% is not a universal ATX 12 V floor.</strong><p>The <a href="${esc(slotInputResearch.atx3Source)}">Intel ATX 3 table 4-2</a> publishes an 11.20 V minimum. This leaves only 160 mV between the source and the 11.04 V card limit. The prior 11.40 V screen allowed 360 mV. The correction makes the existing slot-path concern more severe.</p></div>
${table(['Rail / input case','Source voltage','Available total DC-drop budget','Screened slot voltage','Remaining margin'],slotChannels.flatMap(r=>r.sourceCases.map(c=>[`${r.rail} / ${c.label}`,`${n(c.sourceV,3)} V`,`${n(c.totalDcDropBudgetMV)} mV`,`${n(c.slotV,4)} V`,`${n(c.remainingMarginMV)} mV`])))}
<p>A starting engineering target is 50–100 mV total hot DC drop on the 12 V path at 5.5 A, including contacts and ground return. This is not a standard requirement or an achieved result. It leaves 60–110 mV at the published 11.20 V input floor for dynamic dips and uncertainty. The full dynamic envelope still requires checking.</p>
<p>Negative values indicate a conditional failure within the stated input and load envelope. The mesh allowance is a numerical reserve, not a guaranteed physical bound. The <a href="https://edc.intel.com/content/www/us/en/design/ipla/software-development-platforms/client/platforms/alder-lake-desktop/atx-version-3-0-multi-rail-desktop-platform-power-supply-design-guide/2.1/pcie-aic-auxiliary-power-connectors/">Intel guide</a> states the 12 V connector limit. The <a href="https://e2e.ti.com/cfs-file/__key/communityserver-discussions-components-files/791/7851.PCIe_5F00_designGuides.pdf">PCI-SIG design guide</a> gives the 3.3 V tolerance.</p>
<p>The selected gate-driver envelope passes at 2.4 V control. Switch startup and slow shutdown still lack safe-operating-area qualification. Card capacitance, PSU impedance and actual current trajectories determine that result. The discrete switches provide no local current limit or fault latch.</p>
<p>The external gate network has a 1.0 s nominal turn-off time constant. Slow operation can keep a MOSFET in its linear region under load. Gate RC success alone cannot establish switch survival.</p>
<p>Reduce the switched 12 V path resistance. Compare slot voltage with the applicable card voltage limits across the rated load envelope. Check startup and shutdown VDS/current trajectories against temperature-derated MOSFET SOA.</p>
<h2>3. Signal integrity: useful screens, incomplete channel validation</h2>
<p>A <a href="../si-channel-review/report.html">component-aware channel follow-up</a> now includes finite route sections, capacitor data, ESD loading and pad/via sensitivity. Its full-channel verification remains open. The follow-up also maps USB4 return-stitch review locations and lists the missing wideband models.</p>
<p>The longest USB4 planar conductor is ${n(maxUsb)} mm. Every USB4 conductor uses two signal vias. PCIe TX lengths span ${n(Math.min(...tx.pairs.map(p=>p.positiveLengthMm)))}–${n(Math.max(...tx.pairs.map(p=>p.negativeLengthMm)))} mm. PCIe RX lengths span ${n(Math.min(...rx.pairs.map(p=>p.positiveLengthMm)))}–${n(Math.max(...rx.pairs.map(p=>p.positiveLengthMm)))} mm.</p>
<p>The independent 2D electrostatic model gives ${n(results.pcieImpedanceOhms)} Ω for the nominal uniform pair. Mesh convergence and analytic benchmark checks pass. The model excludes finite pads, vias, component bodies, adjacent-net coupling and loss.</p>
${table(['Uniform-section sensitivity','Differential comparison'],results.usbUniformSections.map(r=>[r.name,`${n(r.ohms)} Ω`]))}
<p>The 3 mil values describe infinite uniform proxies. Actual BGA necks are short, asymmetric transitions. These values establish neither a transition failure nor a transition pass. PCIe RX3 and REFCLK also contain unequal neck lengths, despite matched total planar lengths.</p>
<p>The loss calculation uses actual emitted planar lengths and local widths. It sweeps assumed Df and conductor loss. It excludes component and transition S-parameters. No eye diagram, BER, return-loss or crosstalk pass is claimed.</p>
${table(['Bus / Nyquist frequency','Distributed loss sensitivity','Unmodeled terms'],frequencies.map(s=>{const vals=loss.filter(r=>r.bus===s.bus).flatMap(r=>r.conductors.map(c=>c.distributedScreenDb));return [`${s.bus} / ${s.frequencyHz/1e9} GHz`,`${n(Math.min(...vals))}–${n(Math.max(...vals))} dB`,'Pads, vias, connector, ESD, capacitors, package, reflections and mode conversion'];}))}
<p>The USB4 guide permits short routes or less than 4 dB loss at 10 GHz. The distributed screen cannot establish the complete loss budget. A guessed component allowance cannot replace wideband models.</p>
<p>Best next action: obtain the factory cross section and wideband component/package models. Extract the worst BGA, via and connector transitions in a validated 3D solver. Cascade the channel and assess the applicable masks and equalization.</p>
<h2>4. Reset, thermals and assembly</h2>
<p>All 18 normal-startup sensitivity cases pass with at least ${n(reset.normalStartupEnvelope.minimumMarginMs)} ms of reset margin. They assume matched ATX 5 V/3.3 V rise times, buck settling within 5 ms, and at least 0.5 µF effective reset capacitance.</p>
<p>The fault cases show no active reset response to a VDD brownout or short power cycle. A delayed VDD can also outlast the RC delay. These cases expose the RC topology limits. They are separate from the normal-startup pass.</p>
<p>The control acceptance inventory uses the current source policy and emitted terminals. The physical check includes the emitted control routes, via barrels and copper clearances. The uniform impedance check has the separate limitations stated in its report.</p>
<p>The regression run returned ${regression.pass} passes, ${regression.skip} skips and ${regression.fail} failures. The skipped tests require a historical routing fixture. Separate current-board acceptance checks cover all 22 control nets. TypeScript checking passed.</p>
<p>An earlier regression found a stale crystal assertion. The corrected assertion permits either terminal order for the passive resonator and capacitor. It still requires distinct XI/XO nets and grounded cover pins. The oscillator circuit did not change.</p>
<p>TI supplies an encrypted PSpice TPS62903 model. The downloaded SLVMDN8 archive contains CDNENC blocks. The local ngspice engine cannot use those blocks. Converter startup, loop behavior and real load steps therefore remain unqualified.</p>
<p>The bridge datasheet gives a 90 °C junction limit. Its reference thermal data include a 15 × 15 × 15 mm heatsink. At 17.38 °C/W, the reference allows about 3.16 W at 35 °C ambient or 2.30 W at 50 °C. This is not a thermal prediction for this board.</p>
<p>Bridge rail currents, enclosure airflow and heatsink attachment remain unspecified. Thermal qualification requires the bridge power and an assembly-specific thermal model or measurements.</p>
<p>The custom BGA lands, filled/capped vias, mask and stepped stencil still lack written factory acceptance. Passing geometric DRC does not establish assembly yield. Obtain combined DFM/DFA approval and use assembly X-ray inspection.</p>
<h2>Order of work to reduce revision risk</h2><ol>
<li>Close the bridge rail budget with actual load data and lower PCB resistance. Recalculate both voltage corners after each change.</li>
<li>Reduce the 12 V slot-path loss. Close startup/shutdown SOA and temperature checks across the board-rated load and source envelope.</li>
<li>Complete transition and channel SI analysis. Preserve the passing coupled-route geometry during any power changes.</li>
<li>Close heatsink and airflow requirements. Obtain BGA process acceptance before the fabrication release.</li>
<li>On the first assembled unit, measure startup, rail ripple, load steps, switch VDS/current, slot voltage and temperatures. Then measure USB4/PCIe link stability in both cable orientations.</li></ol>
<p>Some bench measurements necessarily require assembled hardware. The analysis can reduce first-build risk, but it cannot eliminate that step.</p>
<h2>Reproduction and evidence</h2><p>Board SHA-256: <code>${sha}</code><br>Git baseline: <code>${results.revision}</code>. Board copper and component placements were not edited in this review.</p>
<p><a href="results.json">Complete results and source hashes</a> · <a href="validation-board.json">Board validation</a> · <a href="power-distribution-dc-audit.json">Bridge DC mesh</a> · <a href="slot-power-routing-dc-audit.json">Slot DC mesh</a> · <a href="power-reset-report.json">Reset SPICE</a> · <a href="driver-report.json">Driver SPICE</a></p>
<pre><code>bun run build:json
PCIE_SI_PYTHON=/path/to/si/python bun scripts/validate-board.mjs dist/board.circuit.json --require-routed
bun scripts/audit-control-integration.mjs dist/board.circuit.json
bun scripts/audit-schematic.mjs dist/board.circuit.json
bun scripts/check-slot-power.mjs dist/board.circuit.json
bun run sim:power-reset
bun scripts/simulate-slot-driver.jsx dist/board.circuit.json
python simulations/pcie-tx/run_review.py dist/board.circuit.json
python simulations/usb4/review_impedance.py dist/board.circuit.json
bun scripts/prepare-hardware-review.mjs dist/board.circuit.json
python simulations/control-routing/check_impedance.py dist/board.circuit.json dist/first-try-review/control-jobs.json dist/first-try-review/control-impedance.json
python simulations/control-routing/verify_integrated.py dist/board.circuit.json dist/first-try-review/control-jobs.json dist/first-try-review/control-physical.json
bun scripts/review-hardware.mjs dist/board.circuit.json
python simulations/first-try/plot_review.py</code></pre>
<p>Python dependencies: <code>simulations/pcie-tx/requirements.txt</code>. Cached ngspice runtime: <code>bun run sim:setup</code>. Control jobs must match the current policy. Cross-section and resistance models retain their individual limitations.</p>
<p>Primary references: ASMedia datasheet sections 6.2, 6.3.12 and 7; ASMedia PCB guideline pages 3, 5–8; local selected-component datasheets. <a href="https://www.ti.com/product/TPS62903">TI regulator and model</a> · <a href="https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator">JLCPCB calculator parameters</a> · <a href="https://www.aosmd.com/products/mosfets/p-channel-mosfets-8v-60v/ao4407a">AOS power MOSFET</a>.</p>
</main></html>`;
writeFileSync(`${out}/report.html`,html);
console.log(JSON.stringify({report:`${out}/report.html`,sourceSha256:sha,validationPassed:validation.passed,rails,slotChannels},null,2));
