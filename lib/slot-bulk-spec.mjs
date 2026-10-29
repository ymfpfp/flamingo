// Maximum ESR is not a guaranteed minimum. Screen startup at low ESR too.
// Card current is not equal to capacitor ripple current.
const specs={
  '25SVPK470M':{capacitanceF:470e-6,voltageV:25,esrMaxOhm:.014,rippleAt100kHzA:5,maxTemperatureC:125},
  'RYHV25V470UF10*10':{capacitanceF:470e-6,voltageV:25,esrMaxOhm:.028,rippleAt100kHzA:3.15,maxTemperatureC:105},
};
export function slot12BulkSpec(component) {
  const spec=specs[component.manufacturer_part_number];
  if(!spec || Math.abs(component.capacitance-spec.capacitanceF)>1e-12 || component.max_voltage_rating!==spec.voltageV)
    throw Error('Unqualified 12 V slot bulk capacitor');
  return {...spec,capacitanceToleranceFraction:.2};
}
