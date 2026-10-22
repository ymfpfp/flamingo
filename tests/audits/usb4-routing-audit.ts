import type {AnyCircuitElement} from "tscircuit";
import {isUsb4NeckSegment, usb4Rules} from "../../lib/high-speed-rules";
import {getUsb4BgaJoinX, usb4TopEscapePairs, usb4RoutedContacts, usb4PendingPairs} from "../../lib/usb4-routing";

// Keep all component pads and holes as obstacles. Include every trace whose
// bounds reach the USB4 area, and all nearby vias, regardless of their net.
// This local geometry check does not replace the full-board DRC or shorts check.
export function usb4GeometryForDrc(json: AnyCircuitElement[]) {
  const near = (points: {x: number; y: number}[]) => points.length > 0
    && Math.min(...points.map(p => p.x)) <= 48 && Math.max(...points.map(p => p.x)) >= 33
    && Math.min(...points.map(p => p.y)) <= 107 && Math.max(...points.map(p => p.y)) >= 92;
  return json.filter(e => {
    if (e.type === "pcb_trace") return near(e.route.flatMap(p => p.route_type === "through_pad" ? [p.start, p.end] : [p]));
    if (e.type === "pcb_via") return near([e]);
    if (e.type === "pcb_component" && e.source_component_id.startsWith("source_manually_placed_via_")) return near([e.center]);
    return true;
  });
}

// Check rendered copper, rather than assuming that accepted JSX props were used.
export function auditUsb4Routing(json: AnyCircuitElement[]) {
  const sources = new Map(json.filter(e => e.type === "source_trace").map(e => [e.source_trace_id, e]));
  const traces = json.filter(e => e.type === "pcb_trace");
  const vias = json.filter(e => e.type === "pcb_via");
  const failures: string[] = [];
  const warnings: string[] = [];
  const conductors = usb4RoutedContacts.map(({name, ball, contact}) => {
    let lengthMm = 0, viaCount = 0, bottomLengthMm = 0, launchLengthMm = 0, launchComplete = false, neckLengthMm = 0;
    const segmentLengths: Record<string, number> = {};
    const segmentComplete: Record<string, boolean> = {};
    const viaProfile: {holeMm: number | undefined; copperMm: number | undefined}[] = [];
    for (const segment of ["PHY_A", "PHY_B", "CON_A", "CON_B"]) {
      const label = `USB4_${name}_${segment}`;
      segmentLengths[segment] = 0;
      const copper = traces.filter(t => sources.get(t.source_trace_id ?? "")?.name === label);
      segmentComplete[segment] = copper.length === 1;
      if (copper.length !== 1) failures.push(`${label}: expected one fixed route, found ${copper.length}`);
      for (const trace of copper) {
        for (const [i, p] of trace.route.entries()) {
          if (p.route_type === "via") {
            viaCount++;
            const via = vias.find(v => v.pcb_trace_id === trace.pcb_trace_id && Math.hypot(v.x-p.x,v.y-p.y)<1e-6);
            if (!via) failures.push(`${label}: missing rendered via`);
            viaProfile.push({holeMm: via?.hole_diameter, copperMm: via?.outer_diameter});
            continue;
          }
          if (p.route_type !== "wire") { failures.push(`${label}: unexpected through-pad route`); continue; }
          if (!["top", "bottom"].includes(p.layer)) failures.push(`${label}: signal on reserved plane ${p.layer}`);
          const next = trace.route[i + 1];
          const neck = next?.route_type === "wire" && isUsb4NeckSegment(label,p,next) && p.width < usb4Rules.width;
          const expectedWidth = neck ? usb4Rules.neckWidth : usb4Rules.width;
          if (Math.abs(p.width - expectedWidth) > 1e-6) failures.push(`${label}: invalid width ${p.width}`);
          if (next?.route_type === "wire" && next.layer === p.layer) {
            const length = Math.hypot(next.x - p.x, next.y - p.y);
            lengthMm += length;
            segmentLengths[segment] += length;
            if (neck) neckLengthMm += length;
            if (segment === "PHY_A" && !launchComplete) {
              launchLengthMm += length;
              if (next.layer === (usb4TopEscapePairs.has(name.slice(0,3)) ? "top" : "bottom") && Math.abs(next.x - getUsb4BgaJoinX(name.slice(0,3))) < 1e-6) launchComplete = true;
            }
            if (p.layer === "bottom") bottomLengthMm += length;
          }
        }
      }
    }
    if (lengthMm > usb4Rules.maxChannelCopperLength) failures.push(`${name}: ${lengthMm.toFixed(3)} mm exceeds the 20 mm copper target`);
    if (viaCount > usb4Rules.maxSignalVias) failures.push(`${name}: ${viaCount} signal vias exceed the maximum of ${usb4Rules.maxSignalVias}`);
    if (!launchComplete) failures.push(`${name}: missing matched BGA launch handoff`);
    return {name, ball, contact, lengthMm, viaCount, bottomLengthMm, segmentLengths, segmentComplete,
      launchLengthMm, launchComplete, neckLengthMm, viaProfile};
  });
  const pairs = [...new Set(usb4RoutedContacts.map(c => c.name.slice(0, 3)))].map(name => {
    const p = conductors.find(c => c.name === `${name}_P`)!;
    const n = conductors.find(c => c.name === `${name}_N`)!;
    const skewMm = Math.abs(p.lengthMm - n.lengthMm);
    if (skewMm > usb4Rules.maxSkew) failures.push(`${name}: ${skewMm.toFixed(3)} mm skew exceeds ${usb4Rules.maxSkew} mm`);
    const launchSkewMm = Math.abs(p.launchLengthMm - n.launchLengthMm);
    const launchPassed = p.launchComplete && n.launchComplete && launchSkewMm <= usb4Rules.maxSegmentSkew;
    if (!launchPassed) failures.push(`${name}: unmatched BGA launch (${launchSkewMm.toFixed(3)} mm skew)`);
    if (Math.abs(p.neckLengthMm-n.neckLengthMm)>1e-6) failures.push(`${name}: unequal P/N neck lengths`);
    if (p.viaCount !== n.viaCount) failures.push(`${name}: unequal P/N via counts`);
    if (JSON.stringify(p.viaProfile) !== JSON.stringify(n.viaProfile)) failures.push(`${name}: unequal P/N via dimensions`);
    return {name, positiveLengthMm: p.lengthMm, negativeLengthMm: n.lengthMm, skewMm,
      viaCountPerConductor: p.viaCount, viaRecommendationMet: p.viaCount <= usb4Rules.recommendedMaxSignalVias && n.viaCount <= usb4Rules.recommendedMaxSignalVias, launchSkewMm, launchPassed,
      channelSkewPassed: Object.values(p.segmentComplete).every(Boolean)
        && Object.values(n.segmentComplete).every(Boolean) && skewMm <= usb4Rules.maxSkew};
  });
  const channelRulesPassed = failures.length === 0;
  const segmentMatching = pairs.flatMap(pair => {
    const p = conductors.find(c => c.name === `${pair.name}_P`)!;
    const n = conductors.find(c => c.name === `${pair.name}_N`)!;
    return Object.keys(p.segmentLengths).map(segment => {
      const skewMm = Math.abs(p.segmentLengths[segment] - n.segmentLengths[segment]);
      const passed = p.segmentComplete[segment] && n.segmentComplete[segment] && skewMm <= usb4Rules.maxSegmentSkew;
      if (!passed) failures.push(!p.segmentComplete[segment] || !n.segmentComplete[segment]
        ? `${pair.name} ${segment}: incomplete copper`
        : `${pair.name} ${segment}: ${skewMm.toFixed(3)} mm segment skew exceeds ${usb4Rules.maxSegmentSkew} mm`);
      return {pair: pair.name, segment, skewMm, passed};
    });
  });
  return {passed: failures.length === 0, channelRulesPassed, segmentRulesPassed: segmentMatching.every(s => s.passed),
    complete: usb4PendingPairs.length === 0 && failures.length === 0, pendingPairs: usb4PendingPairs, failures, warnings,
    viaGuidancePassed: conductors.every(c => c.viaCount <= usb4Rules.maxSignalVias), conductors,
    pairs: pairs.map(p => ({...p, passed: p.channelSkewPassed && p.launchPassed && p.viaRecommendationMet
      && segmentMatching.filter(s => s.pair === p.name).every(s => s.passed)})), segmentMatching,
    note: "Lengths sum the four copper segments per conductor. Capacitor pad span, package delays and via depth are excluded. Launch skew is also checked before the coupled corridor. The user requires at most two signal vias per conductor, which is also the ASMedia guidance. The outer stackup is nominally symmetric, but this copper-length check does not model delay, impedance or USB4 compliance."};
}
