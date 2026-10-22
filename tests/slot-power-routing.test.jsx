import assert from 'node:assert/strict';
import {test} from 'node:test';
import {auditSlotPowerRouting} from './audits/slot-power-routing-audit.mjs';
const raw=await Bun.file(process.env.SLOT_AUDIT_FIXTURE??process.env.BOARD_TEST_FIXTURE??'dist/board.circuit.json').json(),j=raw.circuitJson??raw;
test('slot routing retains the fixed top assembly and all previous paths',()=>{
 const a=auditSlotPowerRouting(j);assert.ok(a.passed,a.failures.join('\n'));assert.equal(a.assembledComponentsOnTop,153);assert.equal(a.controlRoutes,15);
});
test('the slot audit rejects a missing gate connection, output barrel and moved assembly',()=>{
 const source=j.find(e=>e.type==='source_trace'&&e.name==='SP_12V_GATE_OFF');assert.ok(source);
 assert.ok(!auditSlotPowerRouting(j.filter(e=>!(e.type==='pcb_trace'&&e.source_trace_id===source.source_trace_id))).passed);
 const connectivity=j.find(e=>e.type==='source_trace'&&e.display_name==='SP_12V_DRAIN_pin5_6 connectivity');assert.ok(connectivity);
 assert.ok(!auditSlotPowerRouting(j.filter(e=>!(e.type==='pcb_via'&&e.source_trace_id===connectivity.source_trace_id))).passed);
 const bad=structuredClone(j),part=bad.find(e=>e.type==='source_component'&&e.name==='Q_SLOT_12V');bad.find(e=>e.type==='pcb_component'&&e.source_component_id===part.source_component_id).layer='bottom';assert.ok(!auditSlotPowerRouting(bad).passed);
});
