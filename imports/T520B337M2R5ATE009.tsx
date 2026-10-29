import type {CapacitorProps} from "@tscircuit/props";
// KEMET T52X datasheet Table 2, B case, density B: L=1.80, W=2.23,
// inner gap S=1.12; courtyard 5.22 x 3.50. Pin 1 is the marked positive end.
export function T520B337M2R5ATE009(props: Omit<CapacitorProps,"capacitance">) {
  return <capacitor capacitance="330uF" maxVoltageRating="2.5V" polarized
    manufacturerPartNumber="T520B337M2R5ATE009"
    supplierPartNumbers={{digikey:["399-11709-1-ND"]}}
    datasheetUrl="https://search.kemet.com/download/specsheet/T520B337M2R5ATE009"
    footprint={<footprint>
      <smtpad portHints={["pin1","pos"]} pcbX={-1.46} pcbY={0} width={1.8} height={2.23} shape="rect"/>
      <smtpad portHints={["pin2","neg"]} pcbX={1.46} pcbY={0} width={1.8} height={2.23} shape="rect"/>
      <fabricationnoterect pcbX={0} pcbY={0} width={3.8} height={3.1}/>
      <silkscreenpath route={[{x:-1.9,y:1.55},{x:1.9,y:1.55}]}/>
      <silkscreenpath route={[{x:-1.9,y:-1.55},{x:1.9,y:-1.55}]}/>
      <silkscreentext text="+" pcbX={-2.4} pcbY={1.55} fontSize={.55}/>
      <courtyardrect pcbX={0} pcbY={0} width={5.22} height={3.5}/>
    </footprint>} {...props}/>;
}
