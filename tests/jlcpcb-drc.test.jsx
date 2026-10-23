import assert from "node:assert/strict";
import {test} from "node:test";
import {Circuit} from "tscircuit";
import {checkJlcpcbDimensions, runJlcpcbDrc} from "./audits/jlcpcb-drc";
import {jlcpcbBoardRules} from "../lib/jlcpcb-rules";
import {Footprint} from "../imports/ASM2464PDX";

const board = {type: "pcb_board", pcb_board_id: "board", num_layers: 6,
  center: {x: 0, y: 0}, width: 20, height: 20, thickness: 1.6};
const source = {type: "source_component", source_component_id: "bga-source", name: "ASM2464PDX", ftype: "simple_chip"};
const component = {type: "pcb_component", pcb_component_id: "bga", source_component_id: "bga-source",
  center: {x: 0, y: 0}, width: 10, height: 10, layer: "top", rotation: 0};
const pad = (id, x, diameter = 0.2) => ({type: "pcb_smtpad", pcb_smtpad_id: id,
  pcb_component_id: "bga", shape: "circle", radius: diameter / 2, x, y: 0, layer: "top"});
const trace = (width, x = 0, layer = "top") => ({type: "pcb_trace", pcb_trace_id: "trace",
  route: [{route_type: "wire", x, y: -1, width, layer}, {route_type: "wire", x, y: 1, width, layer}]});
const base = [board, source, component];

test("BGA diameter check distinguishes 0.18 mm from the 0.20 mm boundary", () => {
  const bad = checkJlcpcbDimensions([...base, pad("A", 0, 0.18)]);
  assert.deepEqual(bad.find(f => f.rule === "bga_pad_diameter").elementIds, ["A"]);
  assert.equal(checkJlcpcbDimensions([...base, pad("A", 0, 0.2)]).length, 0);
});

test("the candidate bridge removes the circular-size error and retains the process-review gate", async () => {
  const circuit = new Circuit();
  circuit.schematicDisabled = true;
  circuit.add(<board width="15mm" height="15mm" layers={6} routingDisabled>
    <chip name="ASM2464PDX" footprint={<Footprint/>}/>
  </board>);
  await circuit.renderUntilSettled();
  const findings = checkJlcpcbDimensions(circuit.getCircuitJson());
  assert.ok(!findings.some(f => f.rule === "bga_pad_diameter"));
  assert.equal(findings.find(f => f.rule === "bga_oblong_process_review").elementIds.length, 76);
});

test("ordinary routing cannot silently use a 3 mil BGA exception", () => {
  assert.equal(checkJlcpcbDimensions([...base, trace(0.1)]).length, 0);
  for (const width of [0.09, 0.0762, 0.07]) {
    assert.ok(checkJlcpcbDimensions([...base, trace(width)]).some(f => f.rule === "trace_width"));
  }
  const tapered = trace(0.1);
  tapered.route[0].end_width = 0.05;
  assert.ok(checkJlcpcbDimensions([...base, tapered]).some(f => f.rule === "trace_width"));
});

test("native clearance checks distinguish a close trace, a legal trace, and another layer", async () => {
  for (const [x, layer, expected] of [[0.22, "top", true], [0.25, "top", false], [0.22, "bottom", false]]) {
    const report = await runJlcpcbDrc([...base, pad("A", 0), trace(0.1, x, layer)]);
    assert.equal(report.findings.some(f => f.rule === "pcb_pad_trace_clearance_error"), expected);
  }
});

test("trace spacing checks catch different-net copper without reporting other layers", async () => {
  const first = trace(0.1);
  for (const layer of ["top", "bottom"]) {
    const second = {...trace(0.1, 0.17, layer), pcb_trace_id: "second"};
    const report = await runJlcpcbDrc([...base, first, second]);
    assert.equal(report.findings.some(f => f.rule === "pcb_trace_error"), layer === "top");
  }
});

test("the conservative pad-spacing rule also applies inside the BGA", async () => {
  for (const [x, expected] of [[0.33, true], [0.35, false]]) {
    const report = await runJlcpcbDrc([...base, pad("A", 0), pad("B", x)]);
    assert.equal(report.findings.some(f => f.rule === "pcb_pad_pad_clearance_error"), expected);
  }
});

test("via limits include both hole size and the annular copper", () => {
  const via = {type: "pcb_via", pcb_via_id: "via", x: 0, y: 0, hole_diameter: 0.15,
    outer_diameter: 0.25, layers: ["top", "bottom"]};
  assert.equal(checkJlcpcbDimensions([...base, via]).length, 0);
  assert.ok(checkJlcpcbDimensions([...base, {...via, hole_diameter: 0.1}]).some(f => f.rule === "via_hole_diameter"));
  assert.ok(checkJlcpcbDimensions([...base, {...via, hole_diameter: 0.2}]).some(f => f.rule === "via_annular_ring"));
});

test("via drill spacing applies before routing exists", async () => {
  const via = {type: "pcb_via", pcb_via_id: "via", x: 0, y: 0, hole_diameter: 0.15,
    outer_diameter: 0.25, layers: ["top", "bottom"]};
  const second = {...via, pcb_via_id: "second", x: 0.3};
  const report = await runJlcpcbDrc([...base, via, second]);
  assert.ok(report.findings.some(f => f.rule === "pcb_via_clearance_error"));
});

test("routed DRC uses the separate via/pad target without lowering pad/pad spacing", async () => {
  for(const [x,violates] of [[.37,false],[.34,true]]){
    const via={type:"pcb_via",pcb_via_id:"via",x,y:0,hole_diameter:.15,
      outer_diameter:.25,layers:["top","bottom"]};
    const report=await runJlcpcbDrc([...base,pad("A",0),via,trace(.1,3)],{requireRouted:true});
    assert.equal(report.findings.some(f=>f.rule==="pcb_pad_pad_clearance_error"),violates);
  }
});

test("an unrouted or failed build cannot establish fabrication readiness", async () => {
  const json = [...base, pad("A", 0)];
  const original = JSON.stringify(json);
  const preliminary = await runJlcpcbDrc(json);
  assert.equal(preliminary.fabricationReady, false);
  assert.ok(preliminary.findings.some(f => f.rule === "routing_incomplete"));
  const final = await runJlcpcbDrc(json, {requireRouted: true});
  assert.equal(final.passed, false);
  const failed = await runJlcpcbDrc([...json, {type: "source_runtime_error", source_runtime_error_id: "runtime",
    error_type: "source_runtime_error", message: "Footprint failed"}]);
  assert.equal(failed.passed, false);
  assert.equal(JSON.stringify(json), original);
  assert.equal((await runJlcpcbDrc([])).passed, false);
});

test("board routing properties serialize the configured clearances", async () => {
  const circuit = new Circuit();
  circuit.schematicDisabled = true;
  circuit.add(<board {...jlcpcbBoardRules} layers={6} width="10mm" height="10mm" routingDisabled/>);
  await circuit.renderUntilSettled();
  const pcb = circuit.getCircuitJson().find(e => e.type === "pcb_board");
  assert.equal(pcb.min_trace_width, 0.1);
  assert.equal(pcb.min_trace_to_pad_edge_clearance, 0.1);
  assert.equal(pcb.min_pad_edge_to_pad_edge_clearance, 0.15);
  assert.equal(pcb.min_via_hole_edge_to_via_hole_edge_clearance, 0.2);
});
