import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["S3"],
  pin2: ["S2"],
  pin3: ["S1"],
  pin4: ["G"],
  pin5: ["D1"],
  pin6: ["D2"],
  pin7: ["D3"],
  pin8: ["D4"]
} as const

export const AO4407A = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      symbol={
        <symbol>
          <port name="pin1" pinNumber={1} aliases={["S3"]} direction="down" schX={0} schY={-0.6} schStemLength={0.2} />
          <port name="pin5" pinNumber={5} aliases={["D1"]} direction="up" schX={0} schY={0.6} schStemLength={0.2} />
          <port name="pin2" pinNumber={2} aliases={["S2"]} direction="down" schX={0.2} schY={-0.6} schStemLength={0.2} />
          <port name="pin6" pinNumber={6} aliases={["D2"]} direction="up" schX={0.2} schY={0.6} schStemLength={0.2} />
          <port name="pin8" pinNumber={8} aliases={["D4"]} direction="up" schX={0.4} schY={0.6} schStemLength={0.2} />
          <schematicpath points={[{"x":-0.4,"y":0},{"x":-0.24,"y":0}]} strokeColor="#880000" />
          <port name="pin7" pinNumber={7} aliases={["D3"]} direction="up" schX={-0.2} schY={0.6} schStemLength={0.2} />
          <port name="pin4" pinNumber={4} aliases={["G"]} direction="left" schX={-0.6} schY={0} schStemLength={0.2} />
          <port name="pin3" pinNumber={3} aliases={["S1"]} direction="down" schX={-0.2} schY={-0.6} schStemLength={0.2} />
          <schematicpath points={[{"x":0.2,"y":0.2},{"x":0.2,"y":0.4}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.4,"y":0.4},{"x":-0.2,"y":0.4}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.2,"y":-0.4},{"x":-0.2,"y":-0.4}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.2,"y":-0.4},{"x":0.2,"y":-0.2}]} strokeColor="#880000" />
          <schematicrect schX={0.1} schY={0} width={1} height={0.8} strokeWidth={0.02} color="#880000" />
          <schematicpath points={[{"x":0,"y":0},{"x":-0.12,"y":0.04},{"x":-0.12,"y":-0.04},{"x":0,"y":0}]} strokeColor="#880000" isFilled fillColor="#FEFEFE" />
          <schematicpath points={[{"x":0.2,"y":-0.04},{"x":0.26,"y":0.06},{"x":0.14,"y":0.06},{"x":0.2,"y":-0.04}]} strokeColor="#880000" isFilled fillColor="#FEFEFE" />
          <schematicpath points={[{"x":0,"y":-0.2},{"x":0.2,"y":-0.2},{"x":0.2,"y":-0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":0.14},{"x":0,"y":0.2},{"x":0.2,"y":0.2},{"x":0.2,"y":0.06}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":0.14},{"x":-0.2,"y":0.14}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":0},{"x":0,"y":0},{"x":0,"y":-0.2}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":-0.14},{"x":-0.2,"y":-0.14}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.24,"y":0.18},{"x":-0.24,"y":-0.18}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":0.1},{"x":-0.2,"y":0.18}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":-0.04},{"x":-0.2,"y":0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":-0.18},{"x":-0.2,"y":-0.1}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.26,"y":-0.04},{"x":0.24,"y":-0.04},{"x":0.16,"y":-0.04},{"x":0.14,"y":-0.04}]} strokeColor="#880000" />
          <schematictext schX={-0.01} schY={0.82} text="{NAME}" fontSize={0.2} anchor="bottom_center" />
        </symbol>
      }
      supplierPartNumbers={{
  "jlcpcb": [
    "C16072"
  ]
}}
      manufacturerPartNumber="AO4407A"
      footprint={<footprint>
        <smtpad portHints={["pin5"]} pcbX="1.905mm" pcbY="2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin6"]} pcbX="0.635mm" pcbY="2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin7"]} pcbX="-0.635mm" pcbY="2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin8"]} pcbX="-1.905mm" pcbY="2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin4"]} pcbX="1.905mm" pcbY="-2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin3"]} pcbX="0.635mm" pcbY="-2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin2"]} pcbX="-0.635mm" pcbY="-2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<smtpad portHints={["pin1"]} pcbX="-1.905mm" pcbY="-2.599944mm" width="0.58801mm" height="1.7999964mm" radius="0.294005mm" shape="pill" />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":-1.5214091999999937},{"x":2.526207799999952,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":1.5214092000001074},{"x":2.526207799999952,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":-0.43538139999998293},{"x":-2.5262078000000656,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":0.44889420000004066},{"x":-2.5262078000000656,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":-2.0675600000000713,"y":-1.5214091999999937},{"x":-2.5262078000000656,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":-0.7975599999999758,"y":-1.5214091999999937},{"x":-1.7424400000001015,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":0.47244000000000597,"y":-1.5214091999999937},{"x":-0.47244000000011965,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":1.7424399999999878,"y":-1.5214091999999937},{"x":0.7975599999999758,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":2.526207799999952,"y":-1.5214091999999937},{"x":2.0675599999999577,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":2.526207799999952,"y":1.5214092000001074},{"x":2.526207799999952,"y":-1.5214091999999937}]} />
<silkscreenpath route={[{"x":-2.0675600000000713,"y":1.5214092000001074},{"x":-2.5262078000000656,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":-0.7975599999999758,"y":1.5214092000001074},{"x":-1.7424400000001015,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":0.47244000000000597,"y":1.5214092000001074},{"x":-0.47244000000011965,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":1.7424399999999878,"y":1.5214092000001074},{"x":0.7975599999999758,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":2.526207799999952,"y":1.5214092000001074},{"x":2.0675599999999577,"y":1.5214092000001074}]} />
<silkscreenpath route={[{"x":-2.5262078000000656,"y":-0.43538139999998293},{"x":-2.5262078000000656,"y":0.44889420000004066}]} />
<silkscreencircle pcbX="-1.905mm" pcbY="-1.016mm" radius="0.150114mm" />
<silkscreentext text="{NAME}" pcbX="0.0127mm" pcbY="4.2004mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-2.699982400000067,"y":3.7499422000000777},{"x":2.7000077999998666,"y":3.7499422000000777},{"x":2.7000077999998666,"y":-3.749942199999964},{"x":-2.699982400000067,"y":-3.749942199999964},{"x":-2.699982400000067,"y":3.7499422000000777}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C16072.obj?uuid=ec3b9f9b31a74655be3e55848dbee9c1",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C16072.step?uuid=ec3b9f9b31a74655be3e55848dbee9c1",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: -0.000012700000070253736, y: 0, z: 0 },
      }}
      {...props}
    />
  )
}