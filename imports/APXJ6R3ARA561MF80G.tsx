import type {CapacitorProps} from "@tscircuit/props";
import capacitorBody from "../models/C135-CP_Elec_6.3x7.7.glb";

/** Chemi-Con F80 lands: a=1.9 mm gap, b=3.5 mm length, c=1.6 mm width.
 * Source: datasheets/Chemi-Con-NPCAP-SMD-lands.pdf, page 1.
 * Body: diameter 6.3 mm, nominal height 7.7 mm, base 6.6 x 6.6 mm.
 * Pin 1 is positive on the left; pin 2 is negative on the right.
 */
export function APXJ6R3ARA561MF80GFootprint() {
  return (
    <footprint>
      <smtpad portHints={["pin1", "pos", "positive"]} pcbX={-2.7} pcbY={0}
        width={3.5} height={1.6} shape="rect"/>
      <smtpad portHints={["pin2", "neg", "negative"]} pcbX={2.7} pcbY={0}
        width={3.5} height={1.6} shape="rect"/>
      <silkscreenpath route={[
        {x: -3.3, y: 1}, {x: -3.3, y: 2.2}, {x: -2.2, y: 3.3},
        {x: 3.3, y: 3.3}, {x: 3.3, y: 1},
      ]}/>
      <silkscreenpath route={[
        {x: -3.3, y: -1}, {x: -3.3, y: -2.2}, {x: -2.2, y: -3.3},
        {x: 3.3, y: -3.3}, {x: 3.3, y: -1},
      ]}/>
      <silkscreentext text="+" pcbX={-4.2} pcbY={1.6} fontSize="1mm"/>
      <silkscreentext text="{NAME}" pcbX={0} pcbY={4.2} fontSize="0.8mm"/>
      <fabricationnoterect pcbX={0} pcbY={0} width={6.6} height={6.6}/>
      <courtyardoutline outline={[
        {x: -4.7, y: -3.6}, {x: 4.7, y: -3.6}, {x: 4.7, y: 4.8},
        {x: -4.7, y: 4.8}, {x: -4.7, y: -3.6},
      ]}/>
    </footprint>
  );
}

/** Generic KiCad package body, with the negative stripe toward pin 2.
 * Attribution and measured bounds: models/C135-model.provenance.json.
 */
export function APXJ6R3ARA561MF80G(props: Omit<CapacitorProps, "capacitance">) {
  return (
    <capacitor
      capacitance="560uF"
      maxVoltageRating="6.3V"
      polarized
      manufacturerPartNumber="APXJ6R3ARA561MF80G"
      supplierPartNumbers={{jlcpcb: ["C2157846"]}}
      footprint={<APXJ6R3ARA561MF80GFootprint/>}
      cadModel={{
        glbUrl: capacitorBody,
        modelBoardNormalDirection: "y+",
        modelOriginPosition: {x: 0, y: 0, z: 0},
        modelBounds: {
          min: {x: -3.8989, y: 0, z: -3.29946},
          max: {x: 3.8989, y: 7.69874, z: 3.29946},
        },
      }}
      {...props}
    />
  );
}
