import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["S3"],
  pin2: ["S2"],
  pin3: ["S1"],
  pin4: ["G"],
  pin5: ["D"]
} as const

export const DMP2008UFG_7 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      symbol={
        <symbol>
          <schematicpath points={[{"x":0.2,"y":-0.3},{"x":0.6,"y":-0.3}]} strokeColor="#880000" />
          <port name="pin3" pinNumber={3} aliases={["S1"]} direction="down" schX={0.6} schY={-0.5} schStemLength={0.2} />
          <port name="pin2" pinNumber={2} aliases={["S2"]} direction="down" schX={0.4} schY={-0.5} schStemLength={0.2} />
          <schematicpath points={[{"x":0.4666,"y":0.0352},{"x":0.3386,"y":0.0352}]} strokeColor="#880000" />
          <port name="pin1" pinNumber={1} aliases={["S3"]} direction="down" schX={0.2} schY={-0.5} schStemLength={0.2} />
          <port name="pin4" pinNumber={4} aliases={["G"]} direction="left" schX={-0.4} schY={0.1} schStemLength={0.16} />
          <port name="pin5" pinNumber={5} aliases={["D"]} direction="up" schX={0.2} schY={0.5} schStemLength={0.2} />
          <schematicpath points={[{"x":0,"y":-0.08},{"x":0,"y":0}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":0.06},{"x":0,"y":0.14}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":0.28},{"x":0,"y":0.2}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.04,"y":0.28},{"x":-0.04,"y":-0.08}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.2,"y":-0.04},{"x":0,"y":-0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":0.1},{"x":0.2,"y":0.1},{"x":0.2,"y":-0.1},{"x":0.4,"y":-0.1},{"x":0.4,"y":0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":0.24},{"x":0.2,"y":0.24},{"x":0.2,"y":0.3},{"x":0.4,"y":0.3},{"x":0.4,"y":0.14}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.4,"y":0.04},{"x":0.46,"y":0.14},{"x":0.34,"y":0.14},{"x":0.4,"y":0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.2,"y":0.1},{"x":0.08,"y":0.14},{"x":0.08,"y":0.06},{"x":0.2,"y":0.1}]} strokeColor="#880000" isFilled fillColor="#FEFEFE" />
          <schematicpath points={[{"x":0.2,"y":-0.3},{"x":0.2,"y":-0.1}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.24,"y":0.1},{"x":-0.04,"y":0.1}]} strokeColor="#880000" />
          <schematictext schX={0.099} schY={0.722} text="{NAME}" fontSize={0.2} anchor="bottom_center" />
        </symbol>
      }
      supplierPartNumbers={{
  "jlcpcb": [
    "C461052"
  ]
}}
      manufacturerPartNumber="DMP2008UFG-7"
      footprint={<footprint>
        <smtpad portHints={["pin4"]} pcbX="0.974852mm" pcbY="-1.541526mm" width="0.419989mm" height="0.6999986mm" shape="rect" />
<smtpad portHints={["pin3"]} pcbX="0.324866mm" pcbY="-1.541526mm" width="0.419989mm" height="0.6999986mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="-0.32512mm" pcbY="-1.541526mm" width="0.419989mm" height="0.6999986mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-0.975106mm" pcbY="-1.541526mm" width="0.419989mm" height="0.6999986mm" shape="rect" />
<smtpad portHints={["pin5"]} points={[{x: "-1.2001246mm", y: "-0.4315206mm"}, {x: "-1.2001246mm", y: "1.8184622mm"}, {x: "-0.7501128mm", y: "1.8184622mm"}, {x: "-0.7501128mm", y: "1.228471mm"}, {x: "-0.5501132mm", y: "1.228471mm"}, {x: "-0.5501132mm", y: "1.8184622mm"}, {x: "-0.1001268mm", y: "1.8184622mm"}, {x: "-0.1001268mm", y: "1.228471mm"}, {x: "0.0998728mm", y: "1.228471mm"}, {x: "0.0998728mm", y: "1.8184622mm"}, {x: "0.5498846mm", y: "1.8184622mm"}, {x: "0.5498846mm", y: "1.228471mm"}, {x: "0.7498842mm", y: "1.228471mm"}, {x: "0.7498842mm", y: "1.8184622mm"}, {x: "1.1998706mm", y: "1.8184622mm"}, {x: "1.1998706mm", y: "-0.4315206mm"}, {x: "-1.2001246mm", y: "-0.4315206mm"}]} shape="polygon" />
<silkscreencircle pcbX="-1.010158mm" pcbY="-2.521458mm" radius="0.124968mm" />
<silkscreenrect pcbX="0mm" pcbY="0mm" width="3.556mm" height="4.191mm" strokeWidth="0.254mm" />
<silkscreentext text="{NAME}" pcbX="0mm" pcbY="3.085594mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-1.9101439999999457,"y":2.0684622000001127},{"x":1.9098646000001054,"y":2.0684622000001127},{"x":1.9098646000001054,"y":-2.1415252999998984},{"x":-1.9101439999999457,"y":-2.1415252999998984},{"x":-1.9101439999999457,"y":2.0684622000001127}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C461052.obj?uuid=7326ba298fbd406bbed597220d6d7da9",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C461052.step?uuid=7326ba298fbd406bbed597220d6d7da9",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0.00013969999997698324, y: 0.03150869999990391, z: -0.01 },
      }}
      {...props}
    />
  )
}