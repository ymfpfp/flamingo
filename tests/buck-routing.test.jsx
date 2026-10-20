import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import Board from "../index.circuit";
import {auditBuckRouting} from "../lib/buck-routing-audit";

let json;
if(process.env.BUCK_AUDIT_FIXTURE){const j=await Bun.file(process.env.BUCK_AUDIT_FIXTURE).json();json=j.circuitJson??j;}
else{const circuit=new RootCircuit({platform:{partsEngineDisabled:true}});circuit.add(Board());await circuit.renderUntilSettled();json=circuit.getCircuitJson();}
const names=new Map(json.filter(e=>e.type==="source_trace").map(e=>[e.source_trace_id,e.name]));
const trace=(j,name)=>j.find(e=>e.type==="pcb_trace"&&names.get(e.source_trace_id)===name);
test("both buck circuits have complete local routes and retain the bridge voltage and LC selections",()=>{
  const a=auditBuckRouting(json);assert.ok(a.passed,a.failures.join("\n"));
  assert.equal(a.records.length,41);
  assert.ok(a.converters.every(c=>c.staticVoltageRangePass&&c.datasheetLcSelectionPass));
  assert.ok(a.records.filter(c=>/_(OUTPUT_A|OUTPUT_B)$/.test(c.name)).every(c=>c.minimumWidthMm===2&&c.lineSegmentDropAt3A80CMV<5));
});
test("the buck audit rejects missing switching copper and generic narrow output routing",()=>{
  const sw=trace(json,"BUCK_VCCL_SW");assert.ok(sw);
  assert.ok(!auditBuckRouting(json.filter(e=>e!==sw)).passed);
  const changed=structuredClone(json),out=trace(changed,"BUCK_VDD_OUTPUT_B");
  for(const p of out.route)if(p.route_type==="wire")p.width=.25;
  const a=auditBuckRouting(changed);
  assert.ok(a.failures.some(f=>f.includes("incorrect trace width")));
  assert.ok(a.failures.some(f=>f.includes("5 mV local budget")));
  const sense=trace(json,"BUCK_MONITOR_SENSE");assert.ok(sense);
  assert.ok(auditBuckRouting(json.filter(e=>e!==sense)).failures.some(f=>f.includes("BUCK_MONITOR_SENSE: expected one routed connection")));
});
test("the buck audit rejects an altered feedback ratio and bottom-side assembly",()=>{
  const changed=structuredClone(json);
  changed.find(e=>e.type==="source_component"&&e.name==="R_VDD_FBT").resistance=20000;
  assert.ok(auditBuckRouting(changed).failures.some(f=>f.includes("ASMedia static-voltage")));
  const other=structuredClone(json),part=other.find(e=>e.type==="source_component"&&e.name==="VCCL_BUCK");
  other.find(e=>e.type==="pcb_component"&&e.source_component_id===part.source_component_id).layer="bottom";
  assert.ok(auditBuckRouting(other).failures.some(f=>f.includes("assembly must remain on top")));
});
