/** Buck converter for VCCL and VDD. */
 
import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["SW1"],
  pin2: ["SW2"],
  pin3: ["SW3"],
  pin4: ["PG"],
  pin5: ["FB"],
  pin6: ["AGND"],
  pin7: ["FSW"],
  pin8: ["DEF"],
  pin9: ["SS","TR"],
  pin10: ["AVIN"],
  pin11: ["PVIN1"],
  pin12: ["PVIN2"],
  pin13: ["EN"],
  pin14: ["VOS"],
  pin15: ["PGND1"],
  pin16: ["PGND2"],
  pin17: ["EP"]
} as const

const pinAttributes = {
  pin6: {requiresGround: true},
  pin15: {requiresGround: true},
  pin16: {requiresGround: true}
} as const

export const TPS62130RGTR = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C43590"
  ]
}}
      manufacturerPartNumber="TPS62130RGTR"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-1.499997mm" pcbY="0.750189mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin2"]} pcbX="-1.499997mm" pcbY="0.250063mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin3"]} pcbX="-1.499997mm" pcbY="-0.249809mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin4"]} pcbX="-1.499997mm" pcbY="-0.749935mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin5"]} pcbX="-0.749935mm" pcbY="-1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin6"]} pcbX="-0.249809mm" pcbY="-1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin7"]} pcbX="0.250063mm" pcbY="-1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin8"]} pcbX="0.750189mm" pcbY="-1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin9"]} pcbX="1.499997mm" pcbY="-0.749935mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin10"]} pcbX="1.499997mm" pcbY="-0.249809mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin11"]} pcbX="1.499997mm" pcbY="0.250063mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin12"]} pcbX="1.499997mm" pcbY="0.750189mm" width="0.850011mm" height="0.2800096mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin13"]} pcbX="0.750189mm" pcbY="1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin14"]} pcbX="0.250063mm" pcbY="1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin15"]} pcbX="-0.249809mm" pcbY="1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin16"]} pcbX="-0.749935mm" pcbY="1.499997mm" width="0.2800096mm" height="0.850011mm" radius="0.1400048mm" shape="pill" />
<smtpad portHints={["pin17"]} points={[{x: "0.8501126mm", y: "0.8501126mm"}, {x: "0.8501126mm", y: "-0.849884mm"}, {x: "-0.849884mm", y: "-0.849884mm"}, {x: "-0.849884mm", y: "0.4251198mm"}, {x: "-0.4248658mm", y: "0.850138mm"}]} shape="polygon" />
<silkscreenpath route={[{"x":1.2751307999999995,"y":-1.7247107999999969},{"x":1.724964799999995,"y":-1.7247107999999969},{"x":1.724964799999995,"y":-1.2748768000000013}]} />
<silkscreenpath route={[{"x":1.2751307999999995,"y":1.7251172000000068},{"x":1.724964799999995,"y":1.7251172000000068},{"x":1.724964799999995,"y":1.2752832000000112}]} />
<silkscreenpath route={[{"x":-1.7248632000000015,"y":1.2752832000000112},{"x":-1.7248632000000015,"y":1.7251172000000068},{"x":-1.2750292000000059,"y":1.7251172000000068}]} />
<silkscreenpath route={[{"x":-1.2750292000000059,"y":-1.7247107999999969},{"x":-1.7248632000000015,"y":-1.7247107999999969},{"x":-1.7248632000000015,"y":-1.2748768000000013}]} />
<silkscreenpath route={[{"x":-2.0751292000000063,"y":1.5242032000000023},{"x":-2.2257712297039234,"y":1.6729442559976633},{"x":-2.3751486240147415,"y":1.5229332000000042},{"x":-2.2257712297039234,"y":1.3729221440023451},{"x":-2.0751292000000063,"y":1.521663200000006}]} />
<silkscreentext text="{NAME}" pcbX="-0.231775mm" pcbY="2.920875mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-2.175002499999998,"y":2.175002499999998},{"x":2.175002499999991,"y":2.175002499999998},{"x":2.175002499999991,"y":-2.175002499999998},{"x":-2.175002499999998,"y":-2.175002499999998},{"x":-2.175002499999998,"y":2.175002499999998}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C43590.obj?uuid=6e50ae26fe4f4c2a8ee6b5b5bc616dea",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C43590.step?uuid=6e50ae26fe4f4c2a8ee6b5b5bc616dea",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0.000012699999999199463, z: 0 },
      }}
      {...props}
    />
  )
}
