import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {auditBuckRouting} from "../lib/buck-routing-audit";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {runAllNetlistChecks,runAllPlacementChecks,checkSchematicPlacement,checkTracesAreContiguous} from "@tscircuit/checks";

const file=process.argv[2]??"dist/preview/circuit.json";
const raw=JSON.parse(readFileSync(file,"utf8")),json=raw.circuitJson??raw;
const audit=auditBuckRouting(json);
mkdirSync("dist/buck-routing",{recursive:true});
writeFileSync("dist/buck-routing/audit.json",JSON.stringify(audit,null,2));
console.table(audit.records.filter(e=>/_(SW|VIN|OUTPUT_A|OUTPUT_B|VOS|FB_INPUT)$/.test(e.name))
  .map(e=>({name:e.name,lengthMm:e.lengthMm,widthMm:e.minimumWidthMm,
    dropMV3A80C:/_(SW|VIN|OUTPUT_A|OUTPUT_B)$/.test(e.name)?e.lineSegmentDropAt3A80CMV:"sense path"})));
for(const f of audit.failures)console.error(f);
const drc=await runJlcpcbDrc(json);
writeFileSync("dist/buck-routing/drc.json",JSON.stringify(drc,null,2));
for(const finding of drc.findings)if(finding.severity==="error")console.error(finding.message);
const checks=[await runAllNetlistChecks(json),await runAllPlacementChecks(json),checkSchematicPlacement(json),checkTracesAreContiguous(json)];
for(const findings of checks)if(findings.length)console.error(findings);
const python=spawnSync(process.env.PCIE_SI_PYTHON??"python3",["simulations/buck/check_layout.py",file,"--self-test"],{stdio:"inherit"});
if(python.error)throw python.error;
console.log(audit.scope);console.log(audit.limitations);
process.exitCode=audit.passed&&drc.passed&&checks.every(c=>!c.length)&&python.status===0?0:1;
