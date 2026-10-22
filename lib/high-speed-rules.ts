import type {ComponentProps} from "react";
import stackup from "../manufacturing/stackup/JLC06161H-3313.json";
import {traceWidthsMm} from "./trace-width-rules";

const profile = stackup.impedanceProfiles.find(p => p.signalLayer === "bottom")!;

// Geometry uses the masked, non-coplanar calculator model on the nominally
// symmetric L1/L2 and L6/L5 outer stackup. BGA launches need separate SI review.
// This does not ask the router to solve impedance or establish channel loss.
export const usb4Rules = {
  width: traceWidthsMm.surfaceDifferential85,
  gap: profile.calculatedPairGapMm,
  maxSkew: 0.1,
  // ASMedia also requires <1 mil within every segment, separately from the
  // <5 mil total channel limit. Do not let opposite errors cancel across caps.
  maxSegmentSkew: 0.025,
  maxChannelCopperLength: 20,
  // ASMedia PCB Guideline R1.0, USB4 20Gbps table: "VIA hole Max. <=2".
  // The user also requires this maximum for every complete signal conductor.
  recommendedMaxSignalVias: 2,
  maxSignalVias: 2,
  neckWidth: traceWidthsMm.usb4BgaNeck,
  viaHole: 0.2,
  viaDiameter: 0.4,
  bgaViaHole: 0.15,
  bgaViaDiameter: 0.25,
} as const;

// Only the direct top-side RX1/TX2 launches use short, matched 3 mil necks.
// All pad clearances retain the global 0.10 mm minimum.
const topEscapeNames = new Set(["USB4_RX1_P_PHY_A", "USB4_RX1_N_PHY_A", "USB4_TX2_P_PHY_A", "USB4_TX2_N_PHY_A"]);
export function isUsb4NeckSegment(name: string, a: {x: number; y: number; layer: string}, b: {x: number; y: number; layer: string}) {
  const inside = (p: typeof a) => p.layer === "top" && p.x >= 33.5 && p.x <= 34.7 && p.y >= 98.1 && p.y <= 101;
  return topEscapeNames.has(name) && inside(a) && inside(b);
}

export function isPcieRxNeckSegment(portNames: string[], a: {x: number; y: number; layer: string}, b: {x: number; y: number; layer: string}) {
  const inside = (p: typeof a) => p.layer === "top" && p.x >= 28.3 && p.x <= 28.85 && p.y >= 101.5 && p.y <= 102.607;
  return portNames.some(n => n === "PRXP3" || n === "PRXN3") && inside(a) && inside(b);
}

export function isClockNeckSegment(name:string,a:{x:number;y:number;layer:string},b:typeof a){
  const x=name==="CLOCK_XO_BRIDGE"?32.49:name==="CLOCK_REFCLK_N_PHY"?30.65:NaN;
  const inside=(p:typeof a)=>p.layer==="top"&&p.x>=x-1e-5&&p.x<=x+.23001&&p.y>=101.5&&p.y<=102.35001;
  return inside(a)&&inside(b);
}

export const usb4TraceRules = {
  width: usb4Rules.width,
  maxViaCount: usb4Rules.maxSignalVias,
} satisfies Partial<ComponentProps<"trace">>;

export const usb4PairRules = {
  pcbTraceGap: usb4Rules.gap,
  maxLengthSkew: usb4Rules.maxSkew,
} satisfies Partial<ComponentProps<"differentialpair">>;

export const layerRoles = {
  top: "high-speed and local connections",
  inner1: "GND",
  inner2: "power",
  inner3: "power",
  inner4: "GND",
  bottom: "USB4 escapes, PCIe data sections, REFCLK, and controls",
} as const;
