import assert from "node:assert/strict";
import {test} from "node:test";
import {Circuit} from "tscircuit";
import Review from "../manufacturing/bridge-bga/footprint-review.circuit";
import process from "../manufacturing/bridge-bga/process.json";
import reference from "./fixtures/asm2464pdx-pin-map.json";
import {reviewBridgeBga} from "./audits/bridge-bga-review.mjs";
const circuit=new Circuit();circuit.schematicDisabled=true;circuit.add(Review());await circuit.renderUntilSettled();
const json=circuit.getCircuitJson();

test("bridge copper, mask and 1:1 paste geometry support the proposed process without asserting vendor acceptance",()=>{
 const r=reviewBridgeBga(json,reference.balls);
 assert.deepEqual(r.failures,[]);assert.equal(r.engineeringGeometryPass,true);
 assert.deepEqual(r.counts,{total:273,circular:196,oblong:77,paste:273,coarsePowerAndGround:121});
 assert.ok(Math.abs(r.measurementsMm.minimumCopper-0.1949)<1e-7);
 assert.ok(r.measurementsMm.minimumMaskWeb>=0.1);
 assert.ok(r.measurementsMm.outerEscapeMaskClearance>=0.09);
 assert.ok(r.measurementsMm.coarseDogbonePadToViaCopper>=0.125);
 assert.ok(Math.abs(r.minimumApertureAreaRatio-5/6)<1e-7);
 assert.equal(r.vendorAcceptanceReceived,false);assert.equal(r.productionRelease,false);
});

test("default paste shrink and a conventional thick stencil cannot silently pass the bridge process check",()=>{
 const bad=structuredClone(json),paste=bad.find(e=>e.type==="pcb_solder_paste"&&e.shape==="circle");paste.radius*=0.7;
 assert.ok(reviewBridgeBga(bad,reference.balls).failures.some(s=>s.includes("Paste aperture changed")));
 const thick=structuredClone(process);thick.assembly.bridgeStencilThicknessMm=0.1;
 const r=reviewBridgeBga(json,reference.balls,thick);
 assert.ok(r.failures.some(s=>s.includes("stencil is too thick")));assert.equal(r.minimumApertureAreaRatio,0.5);
});

test("mask expansion that blocks the outer escape and a signal in the coarse array are rejected",()=>{
 const bad=structuredClone(json),proposal=structuredClone(process);
 proposal.footprint.oblongSolderMaskMarginMm=0.025;
 for(const e of bad)if(e.type==="pcb_smtpad"&&e.shape==="pill")e.soldermask_margin=0.025;
 assert.ok(reviewBridgeBga(bad,reference.balls,proposal).failures.some(s=>s.includes("escape corridor")));
 const balls={...reference.balls,D4:"HIGH_SPEED_SIGNAL"};
 assert.ok(reviewBridgeBga(json,balls).failures.some(s=>s.includes("signal ball")));
});
