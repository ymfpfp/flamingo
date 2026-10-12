import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["K"],
  pin2: ["A"]
} as const

export const A_150060VS55040 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      symbol={
        <symbol>
          <schematicpath svgPath="M -0.32 0.26 L -0.24 0.22 L -0.28 0.18 Z" strokeColor="#880000" />
          <schematicpath svgPath="M -0.24 0.34 L -0.16 0.3 L -0.2 0.26 Z" strokeColor="#880000" />
          <schematicpath points={[{"x":-0.18,"y":0.12},{"x":-0.26,"y":0.2}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.1,"y":0.2},{"x":-0.18,"y":0.28}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.1,"y":0},{"x":-0.2,"y":0}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.2,"y":0},{"x":0.1,"y":0}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.1,"y":0.14},{"x":-0.1,"y":-0.14}]} strokeColor="#880000" />
          <schematicpath svgPath="M 0.1 0.14 L -0.1 0 L 0.1 -0.14 Z" strokeColor="#880000" />
          <port name="pin1" pinNumber={1} aliases={["K"]} direction="left" schX={-0.4} schY={0} schStemLength={0.2} />
          <port name="pin2" pinNumber={2} aliases={["A"]} direction="right" schX={0.4} schY={0} schStemLength={0.2} />
          <schematictext schX={0} schY={0.54} text="{NAME}" fontSize={0.2} anchor="bottom_center" />
        </symbol>
      }
      supplierPartNumbers={{
  "jlcpcb": [
    "C6390388"
  ]
}}
      manufacturerPartNumber="150060VS55040"
      footprint={<footprint>
        <smtpad portHints={["pin2"]} pcbX="0.7489952mm" pcbY="0.000127mm" width="0.7999984mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-0.7489952mm" pcbY="-0.000127mm" width="0.7999984mm" height="0.7999984mm" shape="rect" />
<silkscreenpath route={[{"x":0.22042119999991883,"y":-0.3235197999999855},{"x":0.21046439999986433,"y":-0.3235197999999855},{"x":-0.11958320000007916,"y":0.006527799999958006}]} />
<silkscreenpath route={[{"x":0.22042119999991883,"y":0.3565143999999236},{"x":0.22042119999991883,"y":0.346532199999956},{"x":-0.11958320000007916,"y":0.006527799999958006}]} />
<silkscreenpath route={[{"x":0.22042119999991883,"y":0.3565143999999236},{"x":0.22042119999991883,"y":-0.3235197999999855}]} />
<silkscreenpath route={[{"x":0.24046179999993456,"y":0.7565898000000288},{"x":1.3904721999999765,"y":0.7565898000000288}]} />
<silkscreenpath route={[{"x":0.24046179999993456,"y":-0.7435342000001128},{"x":1.3904721999999765,"y":-0.7435342000001128}]} />
<silkscreenpath route={[{"x":1.3904721999999765,"y":0.7564882000000352},{"x":1.3904721999999765,"y":-0.7234428000000435}]} />
<silkscreenpath route={[{"x":-0.13954760000001443,"y":-0.7458455999999387},{"x":-1.1896598000000722,"y":-0.7458455999999387}]} />
<silkscreenpath route={[{"x":-1.4896084000000656,"y":-0.3457701999999472},{"x":-1.4896084000000656,"y":-0.44579539999995177},{"x":-1.1896598000000722,"y":-0.7458455999999387}]} />
<silkscreenpath route={[{"x":-1.4896084000000656,"y":0.3541776000000709},{"x":-1.4896084000000656,"y":-0.3457701999999472}]} />
<silkscreenpath route={[{"x":-1.4896084000000656,"y":0.3541776000000709},{"x":-1.4896084000000656,"y":0.45432980000009593},{"x":-1.1896598000000722,"y":0.7542784000000893}]} />
<silkscreenpath route={[{"x":-0.13954760000001443,"y":0.7542784000000893},{"x":-1.1896598000000722,"y":0.7542784000000893}]} />
<silkscreenpath route={[{"x":0.22042119999991883,"y":0.006527799999958006},{"x":-0.11958320000007916,"y":0.006527799999958006}]} />
<silkscreentext text="{NAME}" pcbX="-0.066675mm" pcbY="1.767715mm" anchorAlignment="center" fontSize="1mm" />
<fabricationnotepath route={[{"x":-1.07000040000014,"y":0.061518800000044394},{"x":-0.5299964000000728,"y":0.061518800000044394},{"x":-0.5299964000000728,"y":-0.06847839999988992},{"x":-1.07000040000014,"y":-0.06847839999988992},{"x":-1.07000040000014,"y":0.061518800000044394}]} strokeWidth="0mm" isFilled hasStroke={false} />
<fabricationnotepath route={[{"x":0.7345679999998538,"y":-0.26708099999996193},{"x":0.7345679999998538,"y":0.2729229999999916},{"x":0.864539799999875,"y":0.2729229999999916},{"x":0.864539799999875,"y":-0.26708099999996193},{"x":0.7345679999998538,"y":-0.26708099999996193}]} strokeWidth="0mm" isFilled hasStroke={false} />
<fabricationnotepath route={[{"x":0.5289295999999695,"y":0.06837679999989632},{"x":1.0689336000000367,"y":0.06837679999989632},{"x":1.0689336000000367,"y":-0.0616203999999243},{"x":0.5289295999999695,"y":-0.0616203999999243},{"x":0.5289295999999695,"y":0.06837679999989632}]} strokeWidth="0mm" isFilled hasStroke={false} />
<courtyardoutline outline={[{"x":-1.3989943999999923,"y":0.6599813999999924},{"x":1.3989943999998786,"y":0.6599813999999924},{"x":1.3989943999998786,"y":-0.6600067999999055},{"x":-1.3989943999999923,"y":-0.6600067999999055},{"x":-1.3989943999999923,"y":0.6599813999999924}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C6390388.obj?uuid=3c2caa1a3e7d4a5a87f46b87d898ef41",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C6390388.step?uuid=3c2caa1a3e7d4a5a87f46b87d898ef41",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: -0.000012700000070253736, y: 0.000012699999956566899, z: -0.01 },
      }}
      {...props}
    />
  )
}