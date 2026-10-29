// Manufacturer tolerance and TCR; unknown parts do not inherit these ratings.
const specs = {
  'ERA-2ARB1871X': {ohm:1870,tolerance:.001,tcrPpmK:10},
  'ERA-2ARB2101X': {ohm:2100,tolerance:.001,tcrPpmK:10},
  'RT0402BRD071K87L': {ohm:1870,tolerance:.001,tcrPpmK:25},
  'RT0402BRD072K1L': {ohm:2100,tolerance:.001,tcrPpmK:25},
  'PTFR0603B1K87N9': {ohm:1870,tolerance:.001,tcrPpmK:10},
  'PTFR0402B2K10N9': {ohm:2100,tolerance:.001,tcrPpmK:10},
  'RT0402BRD0712K1L': {ohm:12100,tolerance:.001,tcrPpmK:25},
  'RT0402BRD0726K1L': {ohm:26100,tolerance:.001,tcrPpmK:25},
};
export function feedbackResistorError(component, temperatureExcursionK=125) {
  const spec=specs[component.manufacturer_part_number];
  if(!spec || spec.ohm!==component.resistance) return Infinity;
  return spec.tolerance+spec.tcrPpmK*1e-6*temperatureExcursionK;
}
