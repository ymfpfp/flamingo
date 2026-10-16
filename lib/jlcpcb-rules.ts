import type {ComponentProps} from "react";
import rules from "../jlcpcb-clearance-rules.json";

// These are project targets, not an automatic choice of impedance or current capacity.
export const jlcpcbBoardRules = {
  minTraceWidth: rules.minimumMm.traceWidth,
  minTraceToPadEdgeClearance: rules.minimumMm.padToTrace,
  minPadEdgeToPadEdgeClearance: rules.minimumMm.padToPad,
  minViaHoleEdgeToViaHoleEdgeClearance: rules.minimumMm.viaDrillToViaDrill,
  minPlatedHoleDrillEdgeToDrillEdgeClearance: rules.minimumMm.pthDrillToDrill,
  minTraceToHoleEdgeClearance: rules.minimumMm.npthToCopper,
  minViaEdgeToPadEdgeClearance: rules.minimumMm.viaToPad,
  minBoardEdgeClearance: rules.minimumMm.copperToBoardEdge,
  // Retain the existing, conservative router defaults.
  minViaHoleDiameter: 0.2,
  minViaPadDiameter: 0.3,
  autorouter: {traceClearance: rules.minimumMm.traceToTrace},
} satisfies Partial<ComponentProps<"board">>;

export {rules as jlcpcbRules};
