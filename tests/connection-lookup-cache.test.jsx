import assert from "node:assert/strict";
import {test} from "node:test";
import {RootCircuit, orderedRenderPhases, Port} from "tscircuit";
import {cacheSourceConnectionLookups} from "../lib/connection-lookup-cache";

function fixture(cached, missingPort = false) {
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
  circuit.add(<board ref={cached ? cacheSourceConnectionLookups : undefined} routingDisabled>
    <chip name="U1" footprint="soic8" pinLabels={{pin1: "VCC", pin2: "GND"}}
      pinAttributes={{VCC: {requiresPower: true}, GND: {requiresGround: true}}}/>
    {Array.from({length: 12}, (_, i) => <capacitor key={i} name={`C${i + 1}`}
      capacitance="100nF" footprint="0402" connections={{pin1: "U1.VCC", pin2: "U1.GND"}}/>)}
    <trace name="EXPLICIT" from="C1.pin1" to={missingPort ? "U1.LATE" : "U1.VCC"}/>
    <subcircuit name="CHILD">
      <chip name="U1" footprint="soic8" pinLabels={{pin1: "VCC", pin2: "GND"}}/>
      <capacitor name="C1" capacitance="1uF" footprint="0402"
        connections={{pin1: "U1.VCC", pin2: "U1.GND"}}/>
    </subcircuit>
  </board>);
  const board = circuit._getBoard();
  board.parent = circuit;
  for (const phase of orderedRenderPhases) {
    if (phase === "SourceRender") break;
    board.runRenderPhaseForChildren(phase);
    board.runRenderPhase(phase);
  }
  return {circuit, board};
}

function renderSource(cached, missingPort = false) {
  const {circuit, board} = fixture(cached, missingPort);
  const traces = board.getDescendants().filter(c => c.lowercaseComponentName === "trace");
  let lookups = 0;
  const originals = traces.map(trace => {
    const original = trace._findConnectedPorts;
    trace._findConnectedPorts = function() {
      lookups++;
      return original.call(this);
    };
    return trace._findConnectedPorts;
  });
  board.runRenderPhaseForChildren("SourceRender");
  board.runRenderPhase("SourceRender");
  const sourceLookups = lookups;
  traces.forEach((trace, i) => assert.equal(trace._findConnectedPorts, originals[i]));
  for (const phase of ["CheckRefDesConvention", "SourceComponentPropertyValidation",
    "SourceParentAttachment", "PortMatching", "OptimizeSelectorCache", "SourceTraceRender"]) {
    board.runRenderPhaseForChildren(phase);
    board.runRenderPhase(phase);
  }
  // Runtime instance numbers in warning text differ between circuit instances.
  const json = JSON.parse(JSON.stringify(circuit.db.toArray(), (_key, value) =>
    typeof value === "string" ? value.replace(/(<[a-z]+#)\d+/gi, "$1") : value));
  return {circuit, board, traces, sourceLookups, json};
}

test("source caching preserves connections and decoupling limits across subcircuits", () => {
  const baseline = renderSource(false);
  const cached = renderSource(true);
  assert.deepEqual(cached.json, baseline.json);
  assert.ok(cached.sourceLookups <= cached.traces.length,
    `${cached.sourceLookups} resolutions for ${cached.traces.length} traces`);
  assert.ok(baseline.sourceLookups > cached.sourceLookups * 10,
    `${baseline.sourceLookups} uncached vs ${cached.sourceLookups} cached lookups`);
  assert.ok(cached.json.some(e => e.type === "source_component" && e.max_decoupling_trace_length === 1));
  for (const scope of [cached.board, ...cached.board.getDescendants()].filter(c => c.isSubcircuit)) {
    for (const matches of scope._cachedSelectAllQueries.values()) {
      assert.equal(matches.length, new Set(matches).size, "native selector cache has no duplicate ports");
    }
  }
});

test("missing-port diagnostics survive caching and a later added port resolves", () => {
  const baseline = renderSource(false, true);
  const cached = renderSource(true, true);
  assert.deepEqual(cached.json, baseline.json);
  assert.ok(cached.json.some(e => e.type === "source_trace_not_connected_error"));
  const trace = cached.traces.find(c => c.props.name === "EXPLICIT");
  const chip = cached.board.children.find(c => c.name === "U1");
  const latePort = new Port({name: "LATE"});
  chip.add(latePort);
  const result = trace._findConnectedPorts();
  assert.equal(result.allPortsFound, true);
  assert.ok(result.ports.includes(latePort));
  trace.setProps({...trace.props, to: "U1.GND"});
  assert.ok(trace._findConnectedPorts().ports.every(port => port !== latePort));
});

test("failed rendering restores methods and selector maps, and installation is idempotent", () => {
  const {board} = fixture(true);
  const renderChildren = board.runRenderPhaseForChildren;
  cacheSourceConnectionLookups(board);
  assert.equal(board.runRenderPhaseForChildren, renderChildren);
  const components = [board, ...board.getDescendants()];
  const scopes = components.filter(c => c.isSubcircuit);
  const maps = scopes.map(scope => [scope._cachedSelectAllQueries, scope._cachedSelectOneQueries]);
  const trace = components.find(c => c.lowercaseComponentName === "trace");
  const findPorts = trace._findConnectedPorts;
  const chip = board.children.find(c => c.name === "U1");
  chip.doInitialSourceRender = () => { throw new Error("source render failed"); };
  assert.throws(() => board.runRenderPhaseForChildren("SourceRender"), /source render failed/);
  assert.equal(trace._findConnectedPorts, findPorts);
  assert.equal(Object.prototype.hasOwnProperty.call(trace, "_findConnectedPorts"), false);
  scopes.forEach((scope, i) => {
    assert.equal(scope._cachedSelectAllQueries, maps[i][0]);
    assert.equal(scope._cachedSelectOneQueries, maps[i][1]);
  });
});
