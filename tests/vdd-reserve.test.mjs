import assert from 'node:assert/strict';
import {test} from 'node:test';
import {boardFixture} from './board-fixture.mjs';
import {vddReserveSpec} from '../lib/vdd-reserve-spec.mjs';
import {electricalMargins} from './audits/schematic-audit.mjs';
const board=boardFixture();
test('VDD reserve preserves the ceramic bank, adds real series damping and controls startup',()=>{
 const m=electricalMargins(board),vdd=m.converter.find(c=>c.rail==='VDD');
 assert.ok(Math.abs(vdd.nominalCapacitanceUF-75.08)<1e-8);
 assert.ok(vdd.datasheetLcSelectionPass);
 assert.equal(vdd.nominalV,.6*(1+1870/2100));
 assert.ok(Math.abs(vdd.feedbackResistorErrorFraction-.00225)<1e-12);
 assert.ok(vdd.staticVoltageRangePass);
 assert.equal(m.reserveBranches.length,2);
 assert.ok(m.startup.currentLimitScreenPass);
});
test('VDD reserve rejects a missing resistor or a resistor that bypasses the damping',()=>{
 const changed=structuredClone(board);
 changed.find(c=>c.type==='source_component'&&c.name==='R_VDD_DAMP_A').resistance=0;
 assert.throws(()=>vddReserveSpec(changed),/Invalid VDD reserve/);
 const missing=board.filter(c=>!(c.type==='source_component'&&c.name==='R_VDD_DAMP_A'));
 assert.throws(()=>vddReserveSpec(missing),/Expected one component/);
 const unknown=structuredClone(board);
 unknown.find(c=>c.type==='source_component'&&c.name==='R_VDD_DAMP_A').manufacturer_part_number='unqualified-22mOhm';
 assert.throws(()=>vddReserveSpec(unknown),/Invalid VDD reserve/);
});

test('stocked feedback parts preserve the original static rail margins and reject unknown specifications',()=>{
 const original=structuredClone(board);
 original.find(c=>c.type==='source_component'&&c.name==='R_VDD_FBT').manufacturer_part_number='ERA-2ARB1871X';
 original.find(c=>c.type==='source_component'&&c.name==='R_VDD_FBB').manufacturer_part_number='ERA-2ARB2101X';
 const before=electricalMargins(original).converter.find(c=>c.rail==='VDD');
 const after=electricalMargins(board).converter.find(c=>c.rail==='VDD');
 assert.equal(after.nominalV,before.nominalV);
 assert.equal(after.minimumV,before.minimumV);
 assert.equal(after.maximumV,before.maximumV);
 assert.ok(after.minimumV>=1.10 && after.maximumV<=1.16);
 const unknown=structuredClone(board);
 unknown.find(c=>c.type==='source_component'&&c.name==='R_VDD_FBT').manufacturer_part_number='unqualified-1.87k';
 assert.equal(electricalMargins(unknown).converter.find(c=>c.rail==='VDD').staticVoltageRangePass,false);
});
