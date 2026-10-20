import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {auditPowerDistribution} from "../lib/power-distribution-audit";
import {runJlcpcbDrc} from "../lib/jlcpcb-drc";
import {runAllNetlistChecks,runAllPlacementChecks,checkSchematicPlacement,checkTracesAreContiguous} from "@tscircuit/checks";
const file=process.argv[2]??"dist/preview/circuit.json",raw=JSON.parse(readFileSync(file)),json=raw.circuitJson??raw;
const audit=auditPowerDistribution(json);mkdirSync("dist/power-distribution",{recursive:true});
writeFileSync("dist/power-distribution/audit.json",JSON.stringify(audit,null,2));
for(const f of audit.failures)console.error(f);
const drc=await runJlcpcbDrc(json);writeFileSync("dist/power-distribution/drc.json",JSON.stringify(drc,null,2));
for(const f of drc.findings)if(f.severity==="error")console.error(f.message);
const checks=[await runAllNetlistChecks(json),await runAllPlacementChecks(json),checkSchematicPlacement(json),checkTracesAreContiguous(json)];
for(const c of checks)if(c.length)console.error(c);
let ok=audit.passed&&drc.passed&&checks.every(c=>!c.length);
for(const script of ["check_layout.py","check_dc.py"]){
 const p=spawnSync(process.env.PCIE_SI_PYTHON??"python3",[`simulations/power-distribution/${script}`,file,...(script==="check_layout.py"?["--self-test"]:[])],{stdio:"inherit"});
 if(p.error)throw p.error;ok=ok&&p.status===0;
}
console.log(audit.scope);console.log(audit.limitations);process.exitCode=ok?0:1;
