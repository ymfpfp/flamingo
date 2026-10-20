import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {auditSlotPowerRouting} from '../lib/slot-power-routing-audit.mjs';
import {runJlcpcbDrc} from '../lib/jlcpcb-drc';
import {runAllNetlistChecks,runAllPlacementChecks,checkSchematicPlacement,checkTracesAreContiguous} from '@tscircuit/checks';
const file=process.argv[2]??'dist/preview/circuit.json',raw=JSON.parse(readFileSync(file)),j=raw.circuitJson??raw,out='dist/slot-power-routing/';mkdirSync(out,{recursive:true});
const audit=auditSlotPowerRouting(j);writeFileSync(out+'audit.json',JSON.stringify(audit,null,2));const drc=await runJlcpcbDrc(j);writeFileSync(out+'drc.json',JSON.stringify(drc,null,2));
const checks=[await runAllNetlistChecks(j),await runAllPlacementChecks(j),checkSchematicPlacement(j),checkTracesAreContiguous(j)];let ok=audit.passed&&drc.passed&&checks.every(c=>!c.length);
const schematicFile=out+'schematic-check.circuit.json';writeFileSync(schematicFile,JSON.stringify(j));
const schematic=spawnSync('bunx',['tsci','check','schematic-placement',schematicFile],{encoding:'utf8'});
if(schematic.error)throw schematic.error;
writeFileSync(out+'schematic-placement.txt',schematic.stdout+schematic.stderr);
if(schematic.status!==0||schematic.stdout.includes('<SchematicPlacementIssues>')){ok=false;console.error(schematic.stdout,schematic.stderr);}
for(const f of audit.failures)console.error(f);for(const f of drc.findings)if(f.severity==='error')console.error(f.message);for(const c of checks)if(c.length)console.error(c);
const p=spawnSync(process.env.PCIE_SI_PYTHON??'python3',['simulations/power-distribution/check_slot.py',file,'--self-test'],{stdio:'inherit'});if(p.error)throw p.error;ok=ok&&p.status===0;console.log(audit.scope);process.exitCode=ok?0:1;
