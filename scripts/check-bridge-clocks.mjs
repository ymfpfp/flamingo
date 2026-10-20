import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {auditBridgeClockRouting} from "../lib/bridge-clock-routing-audit";

const file=process.argv[2]??"dist/preview/circuit.json";
const raw=JSON.parse(readFileSync(file,"utf8")),json=raw.circuitJson??raw;
const audit=auditBridgeClockRouting(json);
mkdirSync("dist/bridge-clocks",{recursive:true});
writeFileSync("dist/bridge-clocks/audit.json",JSON.stringify(audit,null,2));
console.table(audit.crystal);console.table(audit.refclk);
console.log(`REFCLK drawn P/N skew: ${audit.refclkSkewMm.toFixed(6)} mm (ASMedia <0.127 mm)`);
for(const failure of audit.failures)console.error(failure);
const python=spawnSync(process.env.PCIE_SI_PYTHON??"python3",["simulations/bridge-clocks/check_layout.py",file,"--self-test"],{stdio:"inherit"});
if(python.error)throw python.error;
console.log(audit.limitations);
process.exitCode=audit.passed&&python.status===0?0:1;
