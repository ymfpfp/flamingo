import assert from "node:assert/strict";
import {test} from "node:test";
import {checkTracesAreContiguous, checkPcbTraceViaCounts, runAllNetlistChecks, runAllPlacementChecks} from "@tscircuit/checks";
import {boardFixture} from "./board-fixture.mjs";
import {pcieConnectorRules} from "../lib/pcie-connector-routing";
import {checkJlcpcbDimensions, runJlcpcbDrc} from "./audits/jlcpcb-drc";
import {auditPcieTxRouting} from "./audits/pcie-tx-routing-audit";
import {auditPcieRxRouting} from "./audits/pcie-rx-routing-audit";

const json = boardFixture();

test("assembly is top-only and the DRC rejects a bottom-side component", () => {
  const components = json.filter(e => e.type === "pcb_component"
    && !e.source_component_id.startsWith("source_manually_placed_via_"));
  assert.ok(components.length > 0);
  assert.ok(components.every(e => e.layer === "top"));
  const changed = structuredClone(json);
  changed.find(e => e.type === "pcb_component"
    && e.pcb_component_id === components[0].pcb_component_id).layer = "bottom";
  assert.equal(checkJlcpcbDimensions(changed).filter(f => f.rule === "component_layer").length, 1);
  assert.equal(checkJlcpcbDimensions(json).filter(f => f.rule === "component_layer").length, 0);
});

test("all eight PCIe TX capacitor outputs reach the correct slot pads on top without vias", async () => {
  const routedIds = new Set();
  const components = json.filter(e => e.type === "source_component");
  const sourcePort = (name, pin) => json.find(e => e.type === "source_port"
    && e.source_component_id === components.find(c => c.name === name)?.source_component_id
    && e.port_hints.includes(pin));
  const contacts = [["B14", "B15"], ["B19", "B20"], ["B23", "B24"], ["B27", "B28"]];
  for (const [lane, pair] of contacts.entries()) {
    const lengths = [];
    for (const [i, polarity] of ["P", "N"].entries()) {
      const name = `PCIE_TX${lane}_${polarity}_CON`;
      const expected = [sourcePort(`C_TX${lane}_${polarity}`, "pin2"), sourcePort("PCIe", pair[i])];
      const pads = expected.map(port => json.find(e => e.type === "pcb_port" && e.source_port_id === port.source_port_id));
      const traces = json.filter(e => e.type === "pcb_trace" && pads.every(pad =>
        [e.route[0], e.route.at(-1)].some(p => Math.hypot(p.x-pad.x, p.y-pad.y) < 1e-4)));
      assert.equal(traces.length, 1, name);
      routedIds.add(traces[0].pcb_trace_id);
      const route = traces[0].route;
      assert.ok(route.length >= 2, name);
      assert.ok(route.every(p => p.route_type === "wire" && p.layer === "top"
        && Math.abs(p.width - pcieConnectorRules.width) < 1e-6), name);
      for (const port of expected) {
        const pad = json.find(e => e.type === "pcb_port" && e.source_port_id === port.source_port_id);
        assert.ok([route[0], route.at(-1)].some(p => Math.hypot(p.x-pad.x, p.y-pad.y) < 1e-4), `${name} endpoint`);
      }
      lengths.push(route.slice(1).reduce((sum, p, n) => sum + Math.hypot(p.x-route[n].x, p.y-route[n].y), 0));
    }
    assert.ok(Math.abs(lengths[0]-lengths[1]) <= pcieConnectorRules.maxSkew + 1e-6,
      `TX${lane} skew ${Math.abs(lengths[0]-lengths[1])} mm`);
  }
  assert.equal(routedIds.size, 8);
  assert.deepEqual(json.filter(e => e.type === "pcb_autorouting_error" || e.type === "source_runtime_error"), []);
  assert.deepEqual(await runAllNetlistChecks(json), []);
  assert.deepEqual(await runAllPlacementChecks(json), []);
  assert.deepEqual(checkTracesAreContiguous(json), []);
  assert.deepEqual(checkPcbTraceViaCounts(json), []);
  const drc = await runJlcpcbDrc(json);
  assert.ok(drc.passed, JSON.stringify(drc.findings.filter(f => f.severity === "error")));
});

test("complete PCIe TX channels use two signal vias and match P/N within 0.025 mm", () => {
  const audit = auditPcieTxRouting(json);
  assert.ok(audit.passed, audit.failures.join("\n"));
  assert.equal(audit.pairs.length, 4);
  assert.equal(audit.conductors.length, 8);
  for (const pair of audit.pairs) {
    assert.equal(pair.viaCountPerConductor, 2);
    assert.ok(pair.skewMm <= 0.025);
    assert.ok(pair.bridgeSkewMm <= 0.025);
  }
});

test("TX audit rejects missing copper, added skew and absent ground return vias", () => {
  const baseline = auditPcieTxRouting(json);
  assert.ok(baseline.passed, baseline.failures.join("\n"));
  const phy = json.find(e => e.type === "pcb_trace" && e.route.some(p => p.route_type === "via")
    && e.route.some(p => p.route_type === "wire" && p.layer === "bottom" && p.x < 3));
  assert.ok(phy);
  assert.ok(!auditPcieTxRouting(json.filter(e => e !== phy)).passed);
  const shifted = structuredClone(json);
  const changed = shifted.find(e => e.type === "pcb_trace" && e.pcb_trace_id === phy.pcb_trace_id);
  const i = changed.route.findIndex((p, i, all) => p.route_type === "wire" && p.layer === "bottom"
    && all[i + 1]?.route_type === "wire" && all[i + 1].layer === "bottom" && Math.abs(p.x - all[i + 1].x) > 5);
  assert.ok(i >= 0);
  const p = changed.route[i], q = changed.route[i + 1];
  changed.route.splice(i + 1, 0, {...p, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 + 2});
  assert.ok(auditPcieTxRouting(shifted).failures.some(f => f.includes("excessive P/N skew")));
  const gnd = json.find(e => e.type === "source_net" && e.name === "GND");
  assert.ok(auditPcieTxRouting(json.filter(e => !(e.type === "pcb_via" && e.source_net_id === gnd.source_net_id)))
    .failures.some(f => f.includes("lacks a GND return")));
});

test("TX audit rejects separated tuning loops even when their added P/N lengths match", () => {
  const changed = structuredClone(json);
  for (const polarity of ["P", "N"]) {
    const c = json.find(e => e.type === "source_component" && e.name === `C_TX1_${polarity}`);
    const sp = json.find(e => e.type === "source_port" && e.source_component_id === c.source_component_id && e.port_hints.includes("pin1"));
    const port = json.find(e => e.type === "pcb_port" && e.source_port_id === sp.source_port_id);
    const trace = changed.find(e => e.type === "pcb_trace" && e.route.some(p => p.route_type === "via")
      && [e.route[0], e.route.at(-1)].some(p => Math.hypot(p.x - port.x, p.y - port.y) < 1e-4));
    const i = trace.route.findIndex((p, i, all) => p.route_type === "wire" && p.layer === "bottom"
      && all[i+1]?.route_type === "wire" && all[i+1].layer === "bottom"
      && Math.abs(p.y - all[i+1].y) < 1e-6 && p.x - all[i+1].x > 10);
    assert.ok(i >= 0);
    const a = trace.route[i], dy = polarity === "P" ? 1 : -1;
    trace.route.splice(i+1, 0, {...a, x: a.x - 5}, {...a, x: a.x - 6, y: a.y + dy},
      {...a, x: a.x - 8, y: a.y + dy}, {...a, x: a.x - 9});
  }
  const audit = auditPcieTxRouting(changed);
  assert.ok(audit.failures.some(f => f.includes("pair geometry departs")));
  assert.ok(!audit.failures.some(f => f.includes("excessive P/N skew")), audit.failures.join("\n"));
});

test("all four PCIe RX pairs reach the correct slot pads with nominal coupled trunks and matched lengths", () => {
  const audit = auditPcieRxRouting(json);
  assert.ok(audit.passed, audit.failures.join("\n"));
  assert.equal(audit.pairs.length, 4);
  assert.equal(audit.conductors.length, 8);
  for (const pair of audit.pairs) {
    assert.ok(pair.skewMm <= 0.025);
    assert.equal(pair.viaCountPerConductor, pair.lane === 3 ? 0 : 2);
  }
  for (const c of audit.coupling) assert.equal(c.badLengthMm, 0);
});

test("RX audit rejects missing copper, excess skew and missing return vias", () => {
  const phy = json.find(e => e.type === "pcb_trace" && e.route[0].x > 28.5 && e.route[0].x < 28.6
    && e.route[0].y > 101.9 && e.route[0].y < 102.1);
  assert.ok(phy);
  assert.ok(!auditPcieRxRouting(json.filter(e => e !== phy)).passed);
  const changed = structuredClone(json);
  const trace = changed.find(e => e.type === "pcb_trace" && e.pcb_trace_id === phy.pcb_trace_id);
  const i = trace.route.findIndex((p, i, all) => p.route_type === "wire" && all[i + 1]?.route_type === "wire"
    && Math.abs(p.y - all[i + 1].y) > 10);
  assert.ok(i >= 0);
  const a = trace.route[i], b = trace.route[i + 1];
  trace.route.splice(i + 1, 0, {...a, x: a.x + 1, y: (a.y + b.y) / 2});
  assert.ok(auditPcieRxRouting(changed).failures.some(f => f.includes("excessive P/N skew")));
  const gnd = json.find(e => e.type === "source_net" && e.name === "GND");
  assert.ok(auditPcieRxRouting(json.filter(e => !(e.type === "pcb_via" && e.source_net_id === gnd.source_net_id)))
    .failures.some(f => f.includes("lacks a GND return")));
});

test("RX audit rejects separated equal-length loops in a coupled trunk", () => {
  const changed = structuredClone(json);
  for (const [index, polarity] of ["P", "N"].entries()) {
    const original = json.find(e => e.type === "source_port" && e.name === `PRX${polarity}1`);
    const source = json.find(e => e.type === "source_trace" && e.connected_source_port_ids.includes(original.source_port_id));
    const trace = changed.find(e => e.type === "pcb_trace" && e.source_trace_id === source.source_trace_id);
    const i = trace.route.findIndex((p, i, all) => p.route_type === "wire" && p.layer === "top"
      && all[i+1]?.route_type === "wire" && all[i+1].layer === "top" && p.y - all[i+1].y > 5);
    assert.ok(i >= 0);
    const a = trace.route[i], dx = index === 0 ? -1 : 1;
    trace.route.splice(i+1, 0, {...a, y: a.y - 1}, {...a, x: a.x + dx, y: a.y - 2},
      {...a, x: a.x + dx, y: a.y - 3}, {...a, y: a.y - 4});
  }
  const audit = auditPcieRxRouting(changed);
  assert.ok(audit.failures.some(f => f.includes("pair geometry departs")));
  assert.ok(!audit.failures.some(f => f.includes("excessive P/N skew")), audit.failures.join("\n"));
});
