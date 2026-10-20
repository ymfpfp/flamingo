import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {auditVcchRouting} from "../lib/vcch-routing-audit.mjs";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {runAllNetlistChecks,runAllPlacementChecks,checkSchematicPlacement,checkTracesAreContiguous} from "@tscircuit/checks";
const file=process.argv[2]??"dist/preview/circuit.json",raw=JSON.parse(readFileSync(file)),json=raw.circuitJson??raw;
const audit=auditVcchRouting(json);mkdirSync("dist/vcch-routing",{recursive:true});
writeFileSync("dist/vcch-routing/audit.json",JSON.stringify(audit,null,2));
const drc=await runJlcpcbDrc(json);writeFileSync("dist/vcch-routing/drc.json",JSON.stringify(drc,null,2));
const checks=[await runAllNetlistChecks(json),await runAllPlacementChecks(json),checkSchematicPlacement(json),checkTracesAreContiguous(json)];
let ok=audit.passed&&drc.passed&&checks.every(c=>!c.length);
for(const f of audit.failures)console.error(f);
for(const f of drc.findings)if(f.severity==="error")console.error(f.message);
for(const c of checks)if(c.length)console.error(c);
for(const script of ["check_vcch.py","check_layout.py"]){
  const p=spawnSync(process.env.PCIE_SI_PYTHON??"python3",[`simulations/power-distribution/${script}`,file,"--self-test"],{stdio:"inherit"});
  if(p.error)throw p.error;ok=ok&&p.status===0;
}
console.log(audit.scope);process.exitCode=ok?0:1;
