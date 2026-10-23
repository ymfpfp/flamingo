// Bind the conditional AC model to the latest checked DC copper model.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {electricalMargins} from '../../tests/audits/schematic-audit.mjs';
const boardFile=process.argv[2]??'dist/board.circuit.json';
const dcFile=process.argv[3]??'dist/power-distribution/dc-audit.json';
const out=process.argv[4]??'dist/power-dynamics-current';
const raw=readFileSync(boardFile),board=JSON.parse(raw),dc=JSON.parse(readFileSync(dcFile));
const sha=createHash('sha256').update(raw).digest('hex');
if(dc.sourceSha256!==sha)throw Error('DC audit does not match the supplied circuit');
const margins=electricalMargins(board);
const researchFile='datasheets/research/asm2464-rail-current-2026-10-21.json';
const research=JSON.parse(readFileSync(researchFile));
mkdirSync(out,{recursive:true});
writeFileSync(`${out}/board.circuit.json`,raw);
copyFileSync(dcFile,`${out}/dc-audit.json`);
const rails=dc.results.map(r=>{
 const m=margins.converter.find(c=>c.rail===r.rail);
 if(!m)throw Error('Missing static converter calculation');
 return {rail:r.rail,regulatorMinimumV:m.minimumV,regulatorNominalV:m.nominalV,
 regulatorMaximumV:m.maximumV,minimumRequiredV:r.rail==='VDD'?1.1:1.85,
 dcDropAt3AMV:r.fine.maximumDropMV,dcDropWithMeshAllowanceAt3AMV:r.screeningUpperDropMV,
 remainingStaticMarginMV:m.remainingLowerMarginMV};
});
const result={dateLocal:'2026-10-22',sourceFile:`${out}/board.circuit.json`,sourceSha256:sha,
 rails,margins,bridgeCurrentProxy:{research,researchFile},
 provenance:{boardFile,dcFile,dcSha256:createHash('sha256').update(readFileSync(dcFile)).digest('hex'),
 staticCalculationFile:'tests/audits/schematic-audit.mjs',staticCalculationSha256:createHash('sha256').update(readFileSync('tests/audits/schematic-audit.mjs')).digest('hex')},
 scope:'Current checked copper and static BOM values. All AC and current-response assumptions remain those of the conditional passive model.'};
writeFileSync(`${out}/review-input.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file:`${out}/review-input.json`,sourceSha256:sha,rails},null,2));
