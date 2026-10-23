import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditVbusRouting} from './audits/vbus-routing-audit.mjs';

const fixture=process.env.VBUS_AUDIT_FIXTURE??process.env.BOARD_TEST_FIXTURE??'dist/board.circuit.json';
if(fixture){
 const raw=await Bun.file(fixture).json(),j=raw.circuitJson??raw;
 test('VBUS build preserves previous copper and every assembled top placement',()=>{
  const a=auditVbusRouting(j);assert.ok(a.passed,a.failures.join('\n'));assert.equal(a.assembledComponentsOnTop,154);assert.equal(a.newVias,11);
 });
 test('VBUS audit rejects a missing sense route and a component moved to bottom',()=>{
  const s=j.find(e=>e.type==='source_trace'&&e.name==='VBUS_TO_BRIDGE');
  assert.ok(!auditVbusRouting(j.filter(e=>!(e.type==='pcb_trace'&&e.source_trace_id===s.source_trace_id))).passed);
  const bad=structuredClone(j),ids=new Set(bad.filter(e=>e.type==='source_component').map(e=>e.source_component_id));bad.find(e=>e.type==='pcb_component'&&ids.has(e.source_component_id)).layer='bottom';assert.ok(!auditVbusRouting(bad).passed);
 });
 test('an authored off-centre pad contact cannot drift or leave its actual land',()=>{
  const bad=structuredClone(j),source=bad.find(e=>e.type==='source_trace'&&e.name==='VBUS_RAW_A4_CONTACT');
  bad.find(e=>e.type==='pcb_trace'&&e.source_trace_id===source.source_trace_id).route[0].y-=.3;
  assert.ok(!auditVbusRouting(bad).passed);
 });
}
