import assert from 'node:assert/strict';
import {test} from 'node:test';
import {boardFixture} from './board-fixture.mjs';
import {circuitGraph} from '../lib/circuit-graph.mjs';
import {slotGateNetwork,buckFeedbackNetwork} from '../lib/cost-passive-networks.mjs';
import {electricalMargins} from './audits/schematic-audit.mjs';

const board=boardFixture();
test('the shared passive networks retain the gate ramp and the required VCCL range',()=>{
  const gate=slotGateNetwork(circuitGraph(board),'3V3');
  const oldOnTau=510*22000/(510+22000)*10e-6;
  const newOnTau=gate.turnOnResistanceOhm*gate.turnOffResistanceOhm
    /(gate.turnOnResistanceOhm+gate.turnOffResistanceOhm)*gate.gateCapacitanceF;
  assert.ok(Math.abs(newOnTau/oldOnTau-1)<.001);
  assert.ok(gate.turnOffResistanceOhm*gate.gateCapacitanceF < 22000*10e-6);
  const rail=electricalMargins(board).converter.find(c=>c.rail==='VCCL');
  assert.ok(rail.minimumV>=1.85 && rail.maximumV<=1.95);
});
test('the gate calculation rejects an open parallel branch',()=>{
  const changed=structuredClone(board);
  const trace=changed.find(e=>e.type==='source_trace' && e.name==='SP_3V3_PARALLEL_DRIVE');
  assert.ok(trace);trace.connected_source_port_ids=[];
  assert.throws(()=>slotGateNetwork(circuitGraph(changed),'3V3'));
});
test('both physical feedback resistors contribute to the voltage calculation',()=>{
  const changed=structuredClone(board);
  changed.find(e=>e.type==='source_component' && e.name==='R_VCCL_FBT_B').resistance=20000;
  assert.equal(buckFeedbackNetwork(circuitGraph(changed),'VCCL').topOhm,36200);
  assert.equal(electricalMargins(changed).converter.find(c=>c.rail==='VCCL').staticVoltageRangePass,false);
});
