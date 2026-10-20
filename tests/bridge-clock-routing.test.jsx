import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit} from "tscircuit";
import Board from "../index.circuit";
import {auditBridgeClockRouting} from "../lib/bridge-clock-routing-audit";

let json;
if(process.env.CLOCK_AUDIT_FIXTURE){
  const raw=await Bun.file(process.env.CLOCK_AUDIT_FIXTURE).json();json=raw.circuitJson??raw;
}else{
  const circuit=new RootCircuit({platform:{partsEngineDisabled:true}});
  circuit.add(Board());await circuit.renderUntilSettled();json=circuit.getCircuitJson();
}
const sourceNames=new Map(json.filter(e=>e.type==="source_trace").map(e=>[e.source_trace_id,e.name]));
const clockTrace=(j,name)=>j.find(e=>e.type==="pcb_trace"&&sourceNames.get(e.source_trace_id)===name);

test("bridge clocks retain polarity, crystal limits, matched REFCLK and top assembly",()=>{
  const audit=auditBridgeClockRouting(json);
  assert.ok(audit.passed,audit.failures.join("\n"));
  assert.equal(audit.records.length,8);
  assert.ok(audit.refclkSkewMm<.127);
  assert.ok(audit.crystal.every(c=>c.copperLengthMm<12.7));
  assert.ok(audit.records.filter(c=>c.name.startsWith("CLOCK_X")).every(c=>c.viaCount===0));
  const parts=new Set(json.filter(e=>e.type==="source_component").map(e=>e.source_component_id));
  assert.ok(json.filter(e=>e.type==="pcb_component"&&parts.has(e.source_component_id)).every(e=>e.layer==="top"));
});

test("clock audit rejects missing copper and excess REFCLK skew",()=>{
  const route=clockTrace(json,"CLOCK_REFCLK_P_CON");assert.ok(route);
  assert.ok(!auditBridgeClockRouting(json.filter(e=>e!==route)).passed);
  const changed=structuredClone(json),t=clockTrace(changed,"CLOCK_REFCLK_P_CON");
  const i=t.route.findIndex((a,i)=>a.route_type==="wire"&&t.route[i+1]?.route_type==="wire"
    &&Math.hypot(a.x-t.route[i+1].x,a.y-t.route[i+1].y)>.5);
  const a=t.route[i],b=t.route[i+1];t.route.splice(i+1,0,{...a,x:(a.x+b.x)/2,y:(a.y+b.y)/2+1});
  assert.ok(auditBridgeClockRouting(changed).failures.some(f=>f.includes("P/N skew")));
});

test("clock audit rejects swapped destinations and missing crystal cover grounds",()=>{
  const changed=structuredClone(json),p=clockTrace(changed,"CLOCK_REFCLK_P_CON"),n=clockTrace(changed,"CLOCK_REFCLK_N_CON");
  // Saved connector paths start at the slot. Exchange those endpoints only.
  [p.route[0],n.route[0]]=[n.route[0],p.route[0]];
  assert.ok(auditBridgeClockRouting(changed).failures.some(f=>f.includes("route misses")));
  const ground=json.find(e=>e.type==="source_net"&&e.name==="GND");
  assert.ok(auditBridgeClockRouting(json.filter(e=>!(e.type==="pcb_via"&&e.source_net_id===ground.source_net_id)))
    .failures.some(f=>f.includes("cover-land via")));
});
