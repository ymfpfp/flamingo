// Public manufacturer data only. Reject empty responses and wrong part numbers.
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const url='https://ds.murata.com/simserve/characteristics?ReqType=GetSparameter&partnumbers=GRM033R61E224KE01&modeltype=precise&form=series';
const response=await fetch(url);
if(!response.ok)throw Error(`Murata download: HTTP ${response.status}`);
const body=await response.text();
if(!body.startsWith('!Murata Part Number: GRM033R61E224KE01')||!body.includes('# Hz S RI R 50'))throw Error('Unexpected or unavailable Murata model');
const out='dist/si-channel-review/references';mkdirSync(out,{recursive:true});
writeFileSync(`${out}/GRM033R61E224KE01.s2p`,body);
writeFileSync(`${out}/murata-model-source.json`,JSON.stringify({url,part:'GRM033R61E224KE01',sha256:createHash('sha256').update(body).digest('hex'),
  limitation:'Typical data at 25 C and 0 V; bandwidth ends at 6 GHz. Not a USB4 compliance guarantee.'},null,2)+'\n');
console.log('Saved validated Murata TX capacitor model. Bandwidth: 100 Hz to 6 GHz.');
