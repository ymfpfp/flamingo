import type {AnyCircuitElement} from "tscircuit";
import {pcieConnectorRules} from "./pcie-connector-routing";
import {pcieTxContacts, pcieTxViaRules} from "./pcie-tx-routing";

// Measure emitted copper. Capacitor/package delay and via depth are excluded.
// Equal full-stack via counts preserve vertical symmetry within each pair.
export function auditPcieTxRouting(json: AnyCircuitElement[]) {
  const failures: string[] = [];
  const components = json.filter(e => e.type === "source_component");
  const sourcePorts = json.filter(e => e.type === "source_port");
  const pcbPorts = json.filter(e => e.type === "pcb_port");
  const traces = json.filter(e => e.type === "pcb_trace");
  const ground = json.filter(e => e.type === "source_net").find(e => e.name === "GND");
  const vias = json.filter(e => e.type === "pcb_via");
  const returns = vias.filter(e => e.source_net_id === ground?.source_net_id
    && e.layers.includes("inner1") && e.layers.includes("inner4"));
  for (const layer of ["inner1", "inner4"]) {
    if (!json.some(e => e.type === "pcb_copper_pour" && e.layer === layer && e.source_net_id === ground?.source_net_id)) {
      failures.push(`Missing GND reference on ${layer}`);
    }
  }
  const port = (component: string, pin: string) => {
    const source = components.find(c => c.name === component);
    const sourcePort = sourcePorts.find(p => p.source_component_id === source?.source_component_id && p.port_hints?.includes(pin));
    const p = pcbPorts.find(p => p.source_port_id === sourcePort?.source_port_id);
    if (!p) throw new Error(`Missing PCIe audit port ${component}.${pin}`);
    return p;
  };
  type Segment = {ax: number; ay: number; bx: number; by: number; length: number};
  const bottomSegments = new Map<string, Segment[]>();
  const contacts = [["B14", "B15"], ["B19", "B20"], ["B23", "B24"], ["B27", "B28"]];
  const conductors = pcieTxContacts.flatMap(({lane, positive, negative}) => ["P", "N"].map((polarity, i) => {
    const name = `TX${lane}_${polarity}`;
    const bridge = port("ASM2464PDX", i === 0 ? positive : negative);
    const capIn = port(`C_TX${lane}_${polarity}`, "pin1");
    const capOut = port(`C_TX${lane}_${polarity}`, "pin2");
    const slot = port("PCIe", contacts[lane][i]);
    let viaCount = 0, bottomLengthMm = 0;
    const bottom: Segment[] = [];
    const segments = [["bridge", bridge, capIn], ["connector", capOut, slot]] as const;
    const segmentLengths = segments.map(([segment, start, end]) => {
      const copper = traces.filter(t => [start, end].every(p => [t.route[0], t.route[t.route.length - 1]]
        .some(q => q && q.route_type !== "through_pad" && Math.hypot(q.x - p.x, q.y - p.y) < 1e-4)));
      if (copper.length !== 1) failures.push(`${name} ${segment}: expected one route, found ${copper.length}`);
      let lengthMm = 0, segmentVias = 0;
      for (const trace of copper) for (const [index, point] of trace.route.entries()) {
        if (point.route_type === "via") {
          segmentVias++;
          const renderedVia = vias.find(v => Math.hypot(v.x - point.x, v.y - point.y) < 1e-4);
          const diameter = segmentVias === 1 ? pcieTxViaRules.bgaDiameter : pcieTxViaRules.diameter;
          const hole = segmentVias === 1 ? pcieTxViaRules.bgaHole : pcieTxViaRules.hole;
          if (renderedVia?.outer_diameter !== diameter || renderedVia?.hole_diameter !== hole
            || ![point.from_layer, point.to_layer].every(l => l === "top" || l === "bottom")) {
            failures.push(`${name}: invalid signal via`);
          }
          if (!returns.some(r => Math.hypot(r.x - point.x, r.y - point.y) <= 1)) {
            failures.push(`${name}: signal via lacks a GND return within 1 mm`);
          }
          continue;
        }
        if (point.route_type !== "wire") { failures.push(`${name}: unexpected route point`); continue; }
        if (Math.abs(point.width - pcieConnectorRules.width) > 1e-6) failures.push(`${name}: invalid trace width`);
        if (!["top", "bottom"].includes(point.layer) || segment === "connector" && point.layer !== "top") {
          failures.push(`${name} ${segment}: invalid layer ${point.layer}`);
        }
        const next = trace.route[index + 1];
        if (next?.route_type === "wire" && next.layer === point.layer) {
          const distance = Math.hypot(next.x - point.x, next.y - point.y);
          lengthMm += distance;
          if (point.layer === "bottom") {
            bottomLengthMm += distance;
            if (distance > 1e-8) bottom.push({ax: point.x, ay: point.y, bx: next.x, by: next.y, length: distance});
          }
        }
      }
      viaCount += segmentVias;
      if (segmentVias !== (segment === "bridge" ? pcieTxViaRules.maxCount : 0)) failures.push(`${name} ${segment}: invalid via count`);
      return {segment, lengthMm};
    });
    const copperLengthMm = segmentLengths.reduce((sum, s) => sum + s.lengthMm, 0);
    if (copperLengthMm >= 127) failures.push(`${name}: exceeds the ASMedia 5 inch connector limit`);
    if (bottomLengthMm < 20) failures.push(`${name}: missing bottom-layer corridor`);
    bottomSegments.set(name, bottom);
    return {name, copperLengthMm, bridgeLengthMm: segmentLengths[0].lengthMm,
      connectorLengthMm: segmentLengths[1].lengthMm, bottomLengthMm, viaCount};
  }));
  const pairs = pcieTxContacts.map(({lane}) => {
    const p = conductors.find(c => c.name === `TX${lane}_P`)!, n = conductors.find(c => c.name === `TX${lane}_N`)!;
    const skewMm = Math.abs(p.copperLengthMm - n.copperLengthMm);
    const bridgeSkewMm = Math.abs(p.bridgeLengthMm - n.bridgeLengthMm);
    if (skewMm > pcieConnectorRules.maxSkew || bridgeSkewMm > pcieConnectorRules.maxSkew) failures.push(`TX${lane}: excessive P/N skew`);
    return {lane, positiveLengthMm: p.copperLengthMm, negativeLengthMm: n.copperLengthMm,
      bridgeSkewMm, skewMm, viaCountPerConductor: p.viaCount};
  });
  // Inspect emitted copper independently of the authored centerline. Only the
  // first 3 mm after each BGA via and final 0.4 mm at the cap via are launches.
  // At 45-degree miter corners, the nearest centerline distance can rise to
  // pitch/cos(22.5deg). Long straight sections must retain the nominal gap.
  const pitch = pcieConnectorRules.width + pcieConnectorRules.gap;
  const cornerGap = pitch / Math.cos(Math.PI / 8) - pcieConnectorRules.width;
  const coupling = conductors.map(c => {
    const segments = bottomSegments.get(c.name)!;
    const mate = bottomSegments.get(c.name.slice(0, -1) + (c.name.endsWith("P") ? "N" : "P"))!;
    let travelled = 0, minGapMm = Infinity, maxGapMm = 0, checkedLengthMm = 0, badLengthMm = 0;
    for (const s of segments) {
      const count = Math.ceil(s.length / 0.01), ds = s.length / count;
      for (let i = 0; i < count; i++) {
        const f = (i + 0.5) / count, at = travelled + f * s.length;
        if (at < 3 || at > c.bottomLengthMm - 0.4) continue;
        const x = s.ax + f * (s.bx - s.ax), y = s.ay + f * (s.by - s.ay);
        let distance = Infinity;
        for (const m of mate) {
          const dx = m.bx - m.ax, dy = m.by - m.ay;
          const t = Math.max(0, Math.min(1, ((x - m.ax) * dx + (y - m.ay) * dy) / (m.length * m.length)));
          distance = Math.min(distance, Math.hypot(x - m.ax - t * dx, y - m.ay - t * dy));
        }
        const gap = distance - pcieConnectorRules.width;
        minGapMm = Math.min(minGapMm, gap); maxGapMm = Math.max(maxGapMm, gap); checkedLengthMm += ds;
        if (gap < pcieConnectorRules.gap - 0.0002 || gap > cornerGap + 0.0002) badLengthMm += ds;
      }
      travelled += s.length;
    }
    if (checkedLengthMm < 15) failures.push(`${c.name}: insufficient coupled trunk copper`);
    if (badLengthMm > 0.011) failures.push(`${c.name}: pair geometry departs from nominal in the trunk (${badLengthMm.toFixed(3)} mm)`);
    return {name: c.name, minGapMm, maxGapMm, checkedLengthMm, badLengthMm};
  });
  return {passed: failures.length === 0, failures, pairs, conductors, coupling,
    note: "Planar copper lengths exclude capacitor pad span, via depth and package delay. This is a geometry audit, not impedance or PCIe compliance qualification."};
}
