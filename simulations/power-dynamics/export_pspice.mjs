import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {circuitGraph} from '../../lib/circuit-graph.mjs';

// Handoff for TI-compatible PSpice. Generating a deck does not validate it.
const [boardFile,powerDir,out]=process.argv.slice(2);
if(!boardFile||!powerDir||!out)throw Error('Usage: BOARD POWER_RESULTS_DIR OUTPUT_DIR');
const raw=await readFile(boardFile),g=circuitGraph(JSON.parse(raw));
const sha=x=>createHash('sha256').update(x).digest('hex');
const results=JSON.parse(await readFile(`${powerDir}/results.json`));
if(results.sourceSha256!==sha(raw))throw Error('Power results do not match board');
if(g.component('VDD_BUCK').manufacturer_part_number!=='TPS62903RPJR')throw Error('Unexpected converter');
const library='simulations/power-dynamics/vendor/tps62903/TPS62903_PSPICE_TRANS/TPS62903_TRANS.LIB';
const lib=await readFile(library,'utf8');
if(!/\.SUBCKT TPS62903_TRANS EN FB_VSET GND MODE_SCONF PG SS_TR SW VIN VOS\s/i.test(lib))throw Error('Vendor pin order changed');
const passiveRaw=await readFile(`${powerDir}/passive-crosscheck.cir`,'utf8');
const passive=passiveRaw.split(/\r?\n/).filter(s=>/^[RLC]\w*\s/.test(s))
  .map(s=>s.replace(/\s+IC=\S+/g,''));
if(!passive.some(s=>s.startsWith('Rlink '))||!passive.some(s=>s.startsWith('CB1 ')))throw Error('Incomplete physical bank');
await mkdir(out,{recursive:true});
await copyFile(library,`${out}/TPS62903_TRANS.LIB`);
// PSpice for TI uses TI's sidecar signature to identify its signed library.
const signature=library.replace(/\.LIB$/,'.LIBsig');
await copyFile(signature,`${out}/TPS62903_TRANS.LIBsig`);
const cases=[];
const resistorLow=(1-.001)*(1-10e-6*125),resistorHigh=(1+.001)*(1+10e-6*125);
const corners=[
 {name:'nominal',topScale:1,bottomScale:1,fbShiftV:0,leakA:0,linkNH:5},
 {name:'low',topScale:resistorLow,bottomScale:resistorHigh,fbShiftV:.6*.009,leakA:-70e-9,linkNH:20},
 {name:'high',topScale:resistorHigh,bottomScale:resistorLow,fbShiftV:-.6*.009,leakA:70e-9,linkNH:20},
];
for(const stepA of [1.5,3])for(const vin of [4.676844736111264,5.25])for(const corner of corners){
  const idle=3-stepA,name=`step-${stepA}A-vin-${vin.toFixed(3)}-${corner.name}.cir`;
  const physicalBank=passive.map(s=>s.startsWith('Llink ')?s.replace(/\s+\S+$/,` ${corner.linkNH}n`):s);
  const deck=`Flamingo VDD vendor-loop handoff: ${stepA} A step
* NOT RUN: encrypted vendor library requires compatible PSpice.
* Board SHA256 ${sha(raw)}
* Effective passive bank copied from the source-bound first-response model.
* No controller response delay or ideal source-current catch-up is prescribed.
* Regulator temperature dependence is NOT implemented by TI's model.
* ${corner.name} static corner. Ref ±0.9%, divider ±0.1% and 10 ppm/K across 125 K,
* and signed ±70 nA leakage sensitivity. External FB offset emulates ref error.
* This retains the reduced-capacitance model, not an extracted package model.
.LIB "TPS62903_TRANS.LIB"
.PARAM VIN_TEST=${vin}
VINPUT vin 0 PWL(0 0 .1m {VIN_TEST} 28m {VIN_TEST})
VEN en 0 PWL(0 0 2m 0 2.001m 3.3 28m 3.3)
* Conservative input-capacitance sensitivity; ideal fixed input source.
RCIN vin cin .005
CCIN cin 0 3.825u
CHF vin 0 76.5n
XBUCK en chipfb 0 mode pg ss sw vin source TPS62903_TRANS
VREF_CORNER chipfb fb ${corner.fbShiftV}
ILEAK_CORNER fb 0 ${corner.leakA}
RMODE mode 0 ${g.component('R_VDD_MODE').resistance}
RFBT source fb ${g.component('R_VDD_FBT').resistance*corner.topScale}
RFBB fb 0 ${g.component('R_VDD_FBB').resistance*corner.bottomScale}
CSS ss 0 ${g.component('C_VDD_SS').capacitance}
RPG_GMIN pg 0 1G
LPOWER sw ldc 1.2u
* 13 milliohm winding-resistance sensitivity; not a thermal simulation.
RDCR ldc source .013
${physicalBank.join('\n')}
VREQUEST request 0 PWL(0 0 20m 0 20.02m ${idle} 25m ${idle} 25.0002m 3 26m 3 26.0002m ${idle} 28m ${idle})
GLOAD load 0 VALUE={V(request)}
.TEMP 65
.OPTIONS RELTOL=1e-4 ABSTOL=1n VNTOL=1u ITL4=500
.TRAN 1u 28m 0 20n
.PROBE V(source) V(load) V(sw) V(ss) I(LPOWER)
.MEAS TRAN VDD_PRE_MIN MIN V(load) FROM=24m TO=24.9m
.MEAS TRAN VDD_PRE_MAX MAX V(load) FROM=24m TO=24.9m
.MEAS TRAN VDD_STEP_MIN MIN V(load) FROM=24.99m TO=27.99m
.MEAS TRAN VDD_STEP_MAX MAX V(load) FROM=24.99m TO=27.99m
.MEAS TRAN VDD_POST_MIN MIN V(load) FROM=27m TO=27.99m
.MEAS TRAN VDD_POST_MAX MAX V(load) FROM=27m TO=27.99m
.END
`;
  await writeFile(`${out}/${name}`,deck);cases.push({file:name,stepA,vin,corner,sha256:sha(deck)});
}
await writeFile(`${out}/handoff.json`,JSON.stringify({status:'Exported, not simulated',sourceFile:boardFile,sourceSha256:sha(raw),
  vendorLibraryFile:library,vendorLibrarySha256:sha(lib),vendorSignatureFile:signature,
  vendorSignatureSha256:sha(await readFile(signature)),passiveModelSha256:sha(passiveRaw),cases,
  requiredMeasurements:['VDD_PRE_MIN','VDD_PRE_MAX','VDD_STEP_MIN','VDD_STEP_MAX','VDD_POST_MIN','VDD_POST_MAX'],
  voltageWindowV:[1.10,1.16],
  limitations:['These decks have not been executed or numerically validated in PSpice.',
    'The TI library explicitly excludes temperature-dependent characteristics. TEMP 65 applies to external elements only.',
    'The capacitor-bank reduction and parasitics are inherited sensitivity assumptions, not extracted package or ground models.',
    'Input is an ideal voltage source at a conservative voltage; complete PSU dynamics are absent.',
    'The FB voltage source emulates static reference error; it does not model internal reference dynamics or temperature.',
    'Minimum 1 uH tolerance, switching-frequency corners, full AC parasitic extraction and maximum-capacitance stability need separate checks.',
    'A completed simulation is not hardware qualification. A nominal-only pass is not sufficient.']},null,2)+'\n');
console.log(JSON.stringify({status:'not-run',cases:cases.length,out},null,2));
