export interface ControlProfile {
  widthMm: number;
  clearanceMm: number;
  maxLengthMm: number;
  impedanceOhms?: number;
  impedanceTolerancePercent?: number;
  reference: string;
  source: string;
  lengthSource?: string;
  vendorRuleVerified?: boolean;
}
export const controlProfiles: Record<'rext' | 'spi' | 'cc' | 'gpio' | 'sbu', ControlProfile>;
export const controlNets: {name: string; profile: keyof typeof controlProfiles; terminals: string[]}[];
export const controlRoutingPolicy: {
  bgaViaHoleDiameterMm: number;
  bgaViaDiameterMm: number;
  viaHoleDiameterMm: number;
  viaDiameterMm: number;
  [key: string]: unknown;
};
