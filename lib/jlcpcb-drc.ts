import {
  checkDifferentNetViaSpacing,
  checkEachPcbTraceNonOverlapping,
  checkHoleTraceClearance,
  checkPadTraceClearance,
  checkSameNetViaSpacing,
  checkViaPadClearance,
  checkViaTraceClearance,
  checkViasInPads,
  runAllPlacementChecks,
  runAllRoutingChecks,
} from "@tscircuit/checks";
import type {AnyCircuitElement} from "tscircuit";
import {jlcpcbRules as rules} from "./jlcpcb-rules";
import {checkPcieMechanicalZones} from "./pcie-mechanical";
import {isUsb4NeckSegment, isPcieRxNeckSegment, isClockNeckSegment, usb4Rules} from "./high-speed-rules";

export interface DrcFinding {
  rule: string;
  severity: "error" | "warning";
  message: string;
  elementIds: string[];
}

export function checkJlcpcbDimensions(json: AnyCircuitElement[]): DrcFinding[] {
  const findings: DrcFinding[] = [];
  const add = (rule: string, message: string, elementIds: string[]) =>
    findings.push({rule, severity: "error", message, elementIds});
  const sources = new Map(json.filter(e => e.type === "source_component")
    .map(e => [e.source_component_id, e]));
  const bgaComponents = json.filter(e => e.type === "pcb_component")
    .filter(e => rules.bgaComponentNames.includes(sources.get(e.source_component_id)?.name ?? ""));
  const bgaIds = new Set(bgaComponents.map(e => e.pcb_component_id));
  const bgaPads = json.filter(e => e.type === "pcb_smtpad")
    .filter(e => bgaIds.has(e.pcb_component_id ?? ""));
  const sourceTraces = new Map(json.filter(e => e.type === "source_trace").map(e => [e.source_trace_id, e]));
  const sourcePorts = new Map(json.filter(e => e.type === "source_port").map(e => [e.source_port_id, e]));
  const tooSmall = bgaPads.filter(e =>
    e.shape === "circle" && e.radius * 2 + 1e-9 < rules.minimumMm.circularBgaPadDiameter);
  if (tooSmall.length) add("bga_pad_diameter",
    `${tooSmall.length} circular BGA pads are smaller than ${rules.minimumMm.circularBgaPadDiameter} mm.`,
    tooSmall.map(e => e.pcb_smtpad_id));
  const oblongs = bgaPads.filter(e => e.shape === "pill" || e.shape === "rotated_pill");
  if (oblongs.length) findings.push({rule: "bga_oblong_process_review", severity: "warning",
    message: `${oblongs.length} oblong BGA pads and the candidate circular lands, filled/capped USB4 vias, mask and stencil need JLCPCB DFM/DFA acceptance. See manufacturing/bridge-bga/.`,
    elementIds: oblongs.map(e => e.pcb_smtpad_id)});

  for (const element of json) {
    if (element.type === "pcb_component"
      && !element.source_component_id.startsWith("source_manually_placed_via_")
      && element.layer !== rules.process.componentLayer) {
      add("component_layer", `${sources.get(element.source_component_id)?.name ?? element.pcb_component_id}: all assembled components must be on the ${rules.process.componentLayer} layer.`,
        [element.pcb_component_id]);
    }
    if (element.type === "pcb_board" && element.num_layers !== rules.copper.layers) {
      add("process_layers", `The rules assume ${rules.copper.layers} copper layers.`, [element.pcb_board_id]);
    }
    if (element.type === "pcb_trace") {
      element.route.forEach((point, i) => {
        if (point.route_type !== "wire") return;
        // Tapered segments can specify an end width separately.
        for (const width of [point.width, point.end_width].filter(w => w !== undefined)) {
          const next = element.route[i+1];
          const sourceTrace = sourceTraces.get(element.source_trace_id ?? "");
          const local = next?.route_type === "wire" && (isUsb4NeckSegment(
            sourceTrace?.name ?? "", point, next) || isPcieRxNeckSegment(
              sourceTrace?.connected_source_port_ids.map(id => sourcePorts.get(id)?.name ?? "") ?? [], point, next)
              || isClockNeckSegment(sourceTrace?.name??"",point,next));
          const minimum = local ? usb4Rules.neckWidth : rules.minimumMm.traceWidth;
          if (!Number.isFinite(width) || width! + 1e-9 < minimum) {
            add("trace_width", `${element.pcb_trace_id} point ${i}: ${width} mm width, minimum ${minimum} mm.`,
              [element.pcb_trace_id]);
          }
        }
      });
    }
    if (element.type === "pcb_via") {
      if (element.hole_diameter + 1e-9 < rules.minimumMm.viaHoleDiameter) {
        add("via_hole_diameter", `${element.pcb_via_id}: hole smaller than ${rules.minimumMm.viaHoleDiameter} mm.`, [element.pcb_via_id]);
      }
      if (element.outer_diameter + 1e-9 < rules.minimumMm.viaPadDiameter) {
        add("via_pad_diameter", `${element.pcb_via_id}: copper diameter smaller than ${rules.minimumMm.viaPadDiameter} mm.`, [element.pcb_via_id]);
      }
      if (element.outer_diameter - element.hole_diameter + 1e-9 < 0.1) {
        add("via_annular_ring", `${element.pcb_via_id}: copper diameter must exceed drill diameter by at least 0.10 mm.`, [element.pcb_via_id]);
      }
    }
  }
  return findings;
}

export async function runJlcpcbDrc(input: AnyCircuitElement[], {requireRouted = false} = {}) {
  // Some native checks normalize endpoint metadata. Keep the caller's input intact.
  const json: AnyCircuitElement[] = JSON.parse(JSON.stringify(input));
  const findings = checkJlcpcbDimensions(json);
  // Native manually placed vias have proxy pcb_components but no assembled body.
  findings.push(...checkPcieMechanicalZones(json.filter(e => !(e.type === "pcb_component"
    && e.source_component_id.startsWith("source_manually_placed_via_")))));
  const addNative = (diagnostics: AnyCircuitElement[]) => {
    for (const d of diagnostics) {
      const record = d as unknown as Record<string, unknown>;
      findings.push({rule: d.type, severity: d.type.includes("warning") ? "warning" : "error",
        message: String(record.message ?? d.type),
        elementIds: Object.entries(record).filter(([key]) => key.endsWith("_id") || key.endsWith("_ids"))
          .flatMap(([, value]) => typeof value === "string" ? [value] : Array.isArray(value) ? value.filter(v => typeof v === "string") : []),
      });
    }
  };
  addNative(json.filter(e => e.type === "source_runtime_error"));
  if (!json.some(e => e.type === "pcb_board")) {
    findings.push({rule: "missing_board", severity: "error", message: "No PCB board exists in the input.", elementIds: []});
  }
  // Use the configured project rules even for externally supplied Circuit JSON.
  for (const e of json) if (e.type === "pcb_board") Object.assign(e, {
    min_trace_width: rules.minimumMm.traceWidth,
    min_trace_to_pad_edge_clearance: rules.minimumMm.padToTrace,
    min_pad_edge_to_pad_edge_clearance: rules.minimumMm.padToPad,
    min_via_hole_edge_to_via_hole_edge_clearance: rules.minimumMm.viaDrillToViaDrill,
    min_trace_to_hole_edge_clearance: rules.minimumMm.npthToCopper,
    min_board_edge_clearance: rules.minimumMm.copperToBoardEdge,
  });

  addNative(await runAllPlacementChecks(json, {consolidateOverlaps: false}));
  addNative(checkViasInPads(json));
  addNative(checkSameNetViaSpacing(json, {minClearance: rules.minimumMm.viaDrillToViaDrill}));
  addNative(checkDifferentNetViaSpacing(json, {minClearance: rules.minimumMm.viaDrillToViaDrill}));

  const traceCount = json.filter(e => e.type === "pcb_trace").length;
  if (requireRouted) addNative(await runAllRoutingChecks(json));
  if (traceCount) {
    addNative(checkEachPcbTraceNonOverlapping(json, {minClearance: rules.minimumMm.traceToTrace}));
    addNative(checkPadTraceClearance(json, {minClearance: rules.minimumMm.padToTrace}));
    addNative(checkViaTraceClearance(json, {minClearance: rules.minimumMm.viaToTrace}));
    addNative(checkViaPadClearance(json, {minClearance: rules.minimumMm.viaToPad}));
    addNative(checkHoleTraceClearance(json, {minClearance: rules.minimumMm.npthToCopper}));
  }
  if (!requireRouted || !traceCount) findings.push({rule: "routing_incomplete", severity: requireRouted ? "error" : "warning",
    message: requireRouted ? "No routed PCB traces exist." : "This is a geometry check. Full routing connectivity requires check:drc:routed.", elementIds: []});
  const unique = [...new Map(findings.map(f => [`${f.rule}:${f.message}`, f])).values()];
  return {rules, traceCount, findings: unique, passed: !unique.some(f => f.severity === "error"),
    fabricationReady: requireRouted && traceCount > 0 && unique.length === 0};
}
