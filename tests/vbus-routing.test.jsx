import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RootCircuit} from 'tscircuit';
import {auditVbusRouting} from '../lib/vbus-routing-audit.mjs';

test('saved paths on a shared sense node retain explicit routing phases',async()=>{
 const c=new RootCircuit({platform:{partsEngineDisabled:true}});
 c.add(<board width={20} height={12} routingDisabled routeRemaining={false}>
  <resistor name="A" resistance="1k" footprint="0402" pcbX={-5} schX={-5}/>
  <resistor name="B" resistance="1k" footprint="0402" pcbX={0}/>
  <resistor name="C" resistance="1k" footprint="0402" pcbX={5} schX={5}/>
  <trace name="CONTACT" from="A.pin1" to="B.pin1" routingPhaseIndex={15}/>
  <trace name="DIVIDER" from="A.pin1" to="C.pin1" routingPhaseIndex={16}/>
  <autoroutingphase name="CONTACTS" phaseIndex={15} connections={[]} pcbTracePaths={[{connection:'A.pin1',route:[{route_type:'wire',x:-5.51,y:0,layer:'top',width:.15},{route_type:'wire',x:-.51,y:0,layer:'top',width:.15}]}]}/>
  <autoroutingphase name="DIVIDER_PHASE" phaseIndex={16} connections={[]} pcbTracePaths={[]}/>
 </board>);
 await c.renderUntilSettled();
 const plans=c._getBoard()._getRoutingPhasePlans();
 assert.deepEqual(plans.find(p=>p.routingPhaseIndex===15).traces.map(t=>t.name),['CONTACT']);
 assert.deepEqual(plans.find(p=>p.routingPhaseIndex===16).traces.map(t=>t.name),['DIVIDER']);
});

const fixture=process.env.VBUS_AUDIT_FIXTURE;
if(fixture){
 const raw=await Bun.file(fixture).json(),j=raw.circuitJson??raw;
 test('VBUS build preserves previous copper and every assembled top placement',()=>{
  const a=auditVbusRouting(j);assert.ok(a.passed,a.failures.join('\n'));assert.equal(a.preservedTraceCount,481);assert.equal(a.assembledComponentsOnTop,153);assert.equal(a.newVias,11);
 });
 test('VBUS audit rejects a missing sense route and a component moved to bottom',()=>{
  const s=j.find(e=>e.type==='source_trace'&&e.name==='VBUS_TO_BRIDGE');
  assert.ok(!auditVbusRouting(j.filter(e=>!(e.type==='pcb_trace'&&e.source_trace_id===s.source_trace_id))).passed);
  const bad=structuredClone(j),ids=new Set(bad.filter(e=>e.type==='source_component').map(e=>e.source_component_id));bad.find(e=>e.type==='pcb_component'&&ids.has(e.source_component_id)).layer='bottom';assert.ok(!auditVbusRouting(bad).passed);
 });
}
