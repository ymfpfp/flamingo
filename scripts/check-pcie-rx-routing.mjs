import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {RootCircuit} from "tscircuit";
import {auditPcieRxRouting} from "../lib/pcie-rx-routing-audit";
import Board from "../index.circuit";

let json;
if (process.argv[2]) json = JSON.parse(readFileSync(process.argv[2], "utf8"));
else {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
  circuit.add(Board());
  await circuit.renderUntilSettled();
  json = circuit.getCircuitJson();
}
const dir = "dist/pcie-rx-routing";
mkdirSync(dir, {recursive: true});
const audit = auditPcieRxRouting(json);
writeFileSync(`${dir}/audit.json`, JSON.stringify(audit, null, 2));
writeFileSync(`${dir}/board.circuit.json`, JSON.stringify(json, null, 2));
console.table(audit.pairs);
console.log("PCIe RX geometry:", audit.passed ? "passed" : audit.failures);
console.log("Launch, via and electrical-delay SI remains a separate final-layout check.");
process.exitCode = audit.passed ? 0 : 1;
