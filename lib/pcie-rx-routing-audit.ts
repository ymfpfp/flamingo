import type {AnyCircuitElement} from "tscircuit";
import {pcieRxContacts, pcieRxNeckWidth} from "./pcie-rx-routing";
import {pcieConnectorRules} from "./pcie-connector-routing";
import {isPcieRxNeckSegment} from "./high-speed-rules";
import {pcieTxViaRules} from "./pcie-tx-routing";

// Audit emitted copper rather than the route generator. This is a geometry
// screen; it excludes package delay, via depth and 3D launch impedance.
export function auditPcieRxRouting(json: AnyCircuitElement[]) {
  const failures: string[] = [];
  const components = json.filter(e => e.type === "source_component");
  const sourcePorts = json.filter(e => e.type === "source_port");
  const ports = json.filter(e => e.type === "pcb_port");
  const traces = json.filter(e => e.type === "pcb_trace");
  const gnd = json.filter(e => e.type === "source_net").find(e => e.name === "GND");
  const vias = json.filter(e => e.type === "pcb_via");
  const returns = vias.filter(e => e.source_net_id === gnd?.source_net_id
    && e.layers.includes("inner1") && e.layers.includes("inner4"));
  for (const layer of ["inner1", "inner4"]) if (!json.some(e => e.type === "pcb_copper_pour"
    && e.layer === layer && e.source_net_id === gnd?.source_net_id)) failures.push(`Missing GND reference on ${layer}`);
  const port = (component: string, pin: string) => {
    const c = components.find(e => e.name === component);
    const p = sourcePorts.find(e => e.source_component_id === c?.source_component_id && e.port_hints?.includes(pin));
    const pcb = ports.find(e => e.source_port_id === p?.source_port_id);
    if (!pcb) throw new Error(`Missing ${component}.${pin}`);
    return pcb;
  };
  type Segment = {x: number; y: number; dx: number; dy: number; length: number; layer: string};
  const geometry = new Map<string, Segment[]>();
  const conductors = pcieRxContacts.flatMap(({lane, positive, negative, slot}) => [positive, negative].map((ball, i) => {
    const name = `RX${lane}_${i === 0 ? "P" : "N"}`;
    const start = port("ASM2464PDX", ball), end = port("PCIe", slot[i]);
    const copper = traces.filter(t => [start, end].every(p => [t.route[0], t.route[t.route.length - 1]]
      .some(q => q && q.route_type !== "through_pad" && Math.hypot(q.x - p.x, q.y - p.y) < 1e-4)));
    if (copper.length !== 1) failures.push(`${name}: expected one bridge-to-slot route, found ${copper.length}`);
    const segments: Segment[] = [];
    let lengthMm = 0, viaCount = 0, neckLengthMm = 0;
    for (const trace of copper) for (const [index, p] of trace.route.entries()) {
      if (p.route_type === "via") {
        viaCount++;
        const physical = vias.find(v => Math.hypot(v.x - p.x, v.y - p.y) < 1e-4);
        if (physical?.outer_diameter !== (viaCount === 1 ? pcieTxViaRules.bgaDiameter : pcieTxViaRules.diameter)
          || physical?.hole_diameter !== (viaCount === 1 ? pcieTxViaRules.bgaHole : pcieTxViaRules.hole)
          || ![p.from_layer, p.to_layer].every(l => l === "top" || l === "bottom")) failures.push(`${name}: invalid signal via`);
        if (!returns.some(v => Math.hypot(v.x - p.x, v.y - p.y) <= 1)) failures.push(`${name}: signal via lacks a GND return within 1 mm`);
        continue;
      }
      if (p.route_type !== "wire") { failures.push(`${name}: unexpected route point`); continue; }
      if (!["top", "bottom"].includes(p.layer)) failures.push(`${name}: invalid layer`);
      const next = trace.route[index + 1];
      const neck = next?.route_type === "wire" && lane === 3
        && isPcieRxNeckSegment([i === 0 ? "PRXP3" : "PRXN3"], p, next);
      if (Math.abs(p.width - pcieConnectorRules.width) > 1e-6
        && !(neck && Math.abs(p.width - pcieRxNeckWidth) < 1e-6)) failures.push(`${name}: invalid width`);
      if (next?.route_type !== "wire" || next.layer !== p.layer) continue;
      const length = Math.hypot(next.x - p.x, next.y - p.y);
      lengthMm += length;
      if (p.width < 0.1) neckLengthMm += length;
      if (length > 1e-8) segments.push({x: p.x, y: p.y, dx: next.x - p.x, dy: next.y - p.y, length, layer: p.layer});
    }
    if (viaCount !== (lane === 3 ? 0 : 2)) failures.push(`${name}: invalid signal via count`);
    if (neckLengthMm > 1.3 || lengthMm >= 127) failures.push(`${name}: excessive launch/channel length`);
    geometry.set(name, segments);
    return {name, lengthMm, viaCount, neckLengthMm};
  }));
  const pairs = pcieRxContacts.map(({lane}) => {
    const p = conductors.find(c => c.name === `RX${lane}_P`)!, n = conductors.find(c => c.name === `RX${lane}_N`)!;
    const skewMm = Math.abs(p.lengthMm - n.lengthMm);
    if (skewMm > pcieConnectorRules.maxSkew) failures.push(`RX${lane}: excessive P/N skew`);
    return {lane, positiveLengthMm: p.lengthMm, negativeLengthMm: n.lengthMm, skewMm, viaCountPerConductor: p.viaCount};
  });
  const cornerGap = (pcieConnectorRules.width + pcieConnectorRules.gap) / Math.cos(Math.PI / 8) - pcieConnectorRules.width;
  const coupling = conductors.map(c => {
    const segments = geometry.get(c.name)!, mate = geometry.get(c.name.slice(0, -1) + (c.name.endsWith("P") ? "N" : "P"))!;
    const firstBottom = segments.findIndex(t => t.layer === "bottom");
    const firstTopLength = firstBottom < 0 ? 0 : segments.slice(0, firstBottom).reduce((sum, t) => sum + t.length, 0);
    let checkedLengthMm = 0, badLengthMm = 0, minGapMm = Infinity, maxGapMm = 0;
    for (const layer of ["top", "bottom"]) {
      const local = segments.filter(s => s.layer === layer);
      const total = local.reduce((sum, s) => sum + s.length, 0);
      let travelled = 0;
      for (const s of local) {
        const count = Math.ceil(s.length / 0.01), ds = s.length / count;
        for (let i = 0; i < count; i++) {
          const f = (i + 0.5) / count, at = travelled + f * s.length;
          // Bottom starts at the BGA escape. Top starts with a short pad
          // escape plus a via flare (RX0-2), or the direct RX3 neck.
          const skip = layer === "bottom" ? 3 : c.name.startsWith("RX3") ? 1.5 : firstTopLength + 0.4;
          if (at < skip || at > total - (layer === "top" ? 2 : 0.4)) continue;
          const x = s.x + f * s.dx, y = s.y + f * s.dy;
          let distance = Infinity;
          for (const m of mate.filter(m => m.layer === layer)) {
            const t = Math.max(0, Math.min(1, ((x - m.x) * m.dx + (y - m.y) * m.dy) / (m.length * m.length)));
            distance = Math.min(distance, Math.hypot(x - m.x - t * m.dx, y - m.y - t * m.dy));
          }
          const gap = distance - pcieConnectorRules.width;
          minGapMm = Math.min(minGapMm, gap); maxGapMm = Math.max(maxGapMm, gap); checkedLengthMm += ds;
          if (gap < pcieConnectorRules.gap - 0.0002 || gap > cornerGap + 0.0002) badLengthMm += ds;
        }
        travelled += s.length;
      }
    }
    if (checkedLengthMm < 4 || badLengthMm > 0.011) failures.push(`${c.name}: pair geometry departs from nominal in the trunk (${badLengthMm.toFixed(3)} mm)`);
    return {name: c.name, checkedLengthMm, badLengthMm, minGapMm, maxGapMm};
  });
  return {passed: failures.length === 0, failures, pairs, conductors, coupling};
}
