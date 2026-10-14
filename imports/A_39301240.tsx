/** ATX 24P */

import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["3V3_P"],
  pin2: ["3V3_P"],
  pin3: ["GND"],
  pin4: ["5V_P"],
  pin5: ["GND"],
  pin6: ["5V_P"],
  pin7: ["GND"],
  pin8: ["PWR_OK"],
  pin9: ["5VSB_P"],
  pin10: ["12V_P"],
  pin11: ["12V_P"],
  pin12: ["3V3_P"],
  pin13: ["3V3_P"],
  pin14: ["12V_N"],
  pin15: ["GND"],
  pin16: ["PS_ON"],
  pin17: ["GND"],
  pin18: ["GND"],
  pin19: ["GND"],
  pin20: ["NC"],
  pin21: ["5V_P"],
  pin22: ["5V_P"],
  pin23: ["5V_P"],
  pin24: ["GND"]
} as const

export const A_39301240 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      supplierPartNumbers={{
  "jlcpcb": [
    "C492347"
  ]
}}
      manufacturerPartNumber="39301240"
      footprint={<footprint>
        <hole pcbX="-23.10003mm" pcbY="-6.3000382mm" diameter="2.999994mm" />
<hole pcbX="23.10003mm" pcbY="-6.3000382mm" diameter="2.999994mm" />
<platedhole  portHints={["pin1"]} pcbX="23.10003mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin2"]} pcbX="18.90014mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin3"]} pcbX="14.699996mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin4"]} pcbX="10.500106mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin5"]} pcbX="6.299962mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin6"]} pcbX="2.100072mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin7"]} pcbX="-2.100072mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin8"]} pcbX="-6.299962mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin9"]} pcbX="-10.500106mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin10"]} pcbX="-14.699996mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin11"]} pcbX="-18.899886mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin12"]} pcbX="-23.10003mm" pcbY="0.9999218mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin13"]} pcbX="23.10003mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin14"]} pcbX="18.90014mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin15"]} pcbX="14.699996mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin16"]} pcbX="10.500106mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin17"]} pcbX="6.299962mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin18"]} pcbX="2.100072mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin19"]} pcbX="-2.100072mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin20"]} pcbX="-6.299962mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin21"]} pcbX="-10.500106mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin22"]} pcbX="-14.699996mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin23"]} pcbX="-18.899886mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<platedhole  portHints={["pin24"]} pcbX="-23.10003mm" pcbY="6.5000378mm" outerDiameter="2.5999948mm" holeDiameter="1.7999964mm" shape="circle" />
<silkscreenpath route={[{"x":-24.2038885999998,"y":-0.05996940000011364},{"x":-25.907999999999788,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":-20.003871599999798,"y":-0.05996940000011364},{"x":-21.996120599999813,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":-15.803879999999936,"y":-0.05996940000011364},{"x":-17.796103599999924,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":-11.60388839999996,"y":-0.05996940000011364},{"x":-13.596111999999948,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":-7.403871399999844,"y":-0.05996940000011364},{"x":-9.396120399999745,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":-3.203879799999868,"y":-0.05996940000011364},{"x":-5.196103399999856,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":0.9961118000001079,"y":-0.05996940000011364},{"x":-0.9961117999998805,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":5.196128800000224,"y":-0.05996940000011364},{"x":3.203879800000095,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":9.3961204000002,"y":-0.05996940000011364},{"x":7.403896799999984,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":13.596112000000176,"y":-0.05996940000011364},{"x":11.603888400000187,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":17.796129000000064,"y":-0.05996940000011364},{"x":15.803880000000163,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":21.99612060000004,"y":-0.05996940000011364},{"x":20.00389700000005,"y":-0.05996940000011364}]} />
<silkscreenpath route={[{"x":-25.907999999999788,"y":-0.05996940000011364},{"x":-25.907999999999788,"y":-12.886969400000226},{"x":25.781000000000176,"y":-12.886969400000226},{"x":25.781000000000176,"y":-0.05996940000011364},{"x":24.203888600000028,"y":-0.05996940000011364}]} />
<silkscreentext text="{NAME}" pcbX="0.06477mm" pcbY="8.9071978mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-26.024929399999905,"y":8.050035200000025},{"x":26.42495400000007,"y":8.050035200000025},{"x":26.42495400000007,"y":-13.069964200000072},{"x":-26.024929399999905,"y":-13.069964200000072},{"x":-26.024929399999905,"y":8.050035200000025}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C492347.obj?uuid=659d4b2046354ef2bab91b2dcd6792b9",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C492347.step?uuid=659d4b2046354ef2bab91b2dcd6792b9",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: -0.023906800000027317, y: -3.8325193999999083, z: -0.000006999999999646178 },
      }}
      {...props}
    />
  )
}
