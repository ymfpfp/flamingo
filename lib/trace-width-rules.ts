import stackup from "../manufacturing/stackup/JLC06161H-3313.json";
import fabricationRules from "../jlcpcb-clearance-rules.json";

// Widths are in millimeters. Power distribution needs a separate rail calculation.
export const traceWidthsMm = {
  general: 0.25,
  surfaceDifferential85: stackup.impedanceProfiles[0].calculatedTraceWidthMm,
  usb4BgaNeck: fabricationRules.bgaFanoutReferenceMm.traceWidth,
} as const;
