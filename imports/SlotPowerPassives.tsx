import type {ResistorProps} from "@tscircuit/props";

// Selected Yageo RC-series 0402 parts; common manufacturer family datasheet.
const selected = (manufacturerPartNumber: string, resistance: string) => (props: Omit<ResistorProps, "resistance">) => (
  <resistor manufacturerPartNumber={manufacturerPartNumber} resistance={resistance}
    tolerance="1%" footprint="0402" pinAttributes={{pin1:{isPassive:true},pin2:{isPassive:true}}} {...props}/>
);
export const SlotSetResistor = selected("RC0402FR-0751R1L", "51.1ohm");
export const SlotMonitorResistor = selected("RC0402FR-071K43L", "1.43kohm");
export const SlotGateResistor = selected("RC0402FR-0710RL", "10ohm");


// Vishay WSL2512 at 0.001–0.0049 ohm: 3.05 x 3.68 mm lands, 1.27 mm gap.
// The low-value terminals need longer lands than a generic chip resistor.
export const SlotSenseFootprint = () => <footprint>
  <smtpad portHints={["pin1"]} pcbX={-2.16} pcbY={0} width={3.05} height={3.68} shape="rect"/>
  <smtpad portHints={["pin2"]} pcbX={2.16} pcbY={0} width={3.05} height={3.68} shape="rect"/>
  <courtyardoutline outline={[{x:-3.94,y:-2.09},{x:3.94,y:-2.09},{x:3.94,y:2.09},{x:-3.94,y:2.09},{x:-3.94,y:-2.09}]}/>
  <silkscreentext text="{NAME}" pcbX={0} pcbY={2.5} fontSize={0.8}/>
</footprint>;
export const SlotSenseResistor = (props: Omit<ResistorProps,"resistance">) => (
  <resistor manufacturerPartNumber="WSL25123L000FEA" resistance="0.003ohm" tolerance="1%"
    supplierPartNumbers={{jlcpcb:["C844692"]}} footprint={<SlotSenseFootprint/>}
    pinAttributes={{pin1:{isPassive:true},pin2:{isPassive:true}}} {...props}/>
);
