import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["G"],
  pin2: ["D"],
  pin3: ["S"]
} as const

export const IXTA80N075L2 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      symbol={
        <symbol>
          <schematicpath points={[{"x":-0.2,"y":0},{"x":-0.08,"y":-0.04},{"x":-0.08,"y":0.04},{"x":-0.2,"y":0}]} strokeColor="#880000" isFilled fillColor="#FEFEFE" />
          <schematicpath points={[{"x":0.2,"y":0.04},{"x":0.14,"y":-0.06},{"x":0.26,"y":-0.06},{"x":0.2,"y":0.04}]} strokeColor="#880000" isFilled fillColor="#FEFEFE" />
          <schematicpath points={[{"x":-0.2,"y":0.14},{"x":0,"y":0.14},{"x":0,"y":0.2},{"x":0.2,"y":0.2},{"x":0.2,"y":0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":0},{"x":0,"y":0},{"x":0,"y":-0.2},{"x":0.2,"y":-0.2},{"x":0.2,"y":-0.06}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0,"y":-0.14},{"x":-0.2,"y":-0.14}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.24,"y":0.18},{"x":-0.24,"y":-0.18}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":0.18},{"x":-0.2,"y":0.1}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":-0.04},{"x":-0.2,"y":0.04}]} strokeColor="#880000" />
          <schematicpath points={[{"x":-0.2,"y":-0.18},{"x":-0.2,"y":-0.1}]} strokeColor="#880000" />
          <schematicpath points={[{"x":0.28,"y":0.04},{"x":0.24,"y":0.04},{"x":0.16,"y":0.04},{"x":0.12,"y":0.04}]} strokeColor="#880000" />
          <port name="pin2" pinNumber={2} aliases={["D"]} direction="up" schX={0} schY={0.4} schStemLength={0.2} />
          <port name="pin1" pinNumber={1} aliases={["G"]} direction="left" schX={-0.4} schY={0} schStemLength={0.2} />
          <port name="pin3" pinNumber={3} aliases={["S"]} direction="down" schX={0} schY={-0.4} schStemLength={0.2} />
          <schematictext schX={-0.07} schY={0.62} text="{NAME}" fontSize={0.2} anchor="bottom_center" />
        </symbol>
      }
      supplierPartNumbers={{
  "jlcpcb": [
    "C3281656"
  ]
}}
      manufacturerPartNumber="IXTA80N075L2"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="6.7100196mm" pcbY="-2.54mm" width="3.499993mm" height="1.499997mm" shape="rect" />
<smtpad portHints={["pin3"]} pcbX="6.7100196mm" pcbY="2.54mm" width="3.499993mm" height="1.499997mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="-3.9600124mm" pcbY="0mm" width="9.0000074mm" height="10.700004mm" shape="rect" />
<silkscreenpath route={[{"x":2.7719781999999213,"y":-3.048000000000002},{"x":2.7719781999999213,"y":-3.175000000000068},{"x":4.622393599999896,"y":-3.1747459999999137},{"x":4.622393599999896,"y":-1.9047459999999319},{"x":2.7719781999999213,"y":-1.9049999999999727},{"x":2.7719781999999213,"y":-2.158999999999992}]} />
<silkscreenpath route={[{"x":2.7719781999999213,"y":2.032000000000039},{"x":2.7719781999999213,"y":1.9050000000000864},{"x":4.622393599999896,"y":1.9052540000000135},{"x":4.622393599999896,"y":3.1752539999999954},{"x":2.7719781999999213,"y":3.1749999999999545},{"x":2.7707335999999714,"y":2.8103322000000617}]} />
<silkscreenpath route={[{"x":0.7717536000001246,"y":-5.079745999999886},{"x":2.7707335999999714,"y":-5.079745999999886},{"x":2.7707335999999714,"y":5.080253999999968},{"x":0.7717536000001246,"y":5.080253999999968}]} />
<silkscreenpath route={[{"x":3.621633599999882,"y":-3.7998399999999037},{"x":3.432458585783934,"y":-3.9387574491940995},{"x":3.505552371103363,"y":-4.161787810898318},{"x":3.7402548288966955,"y":-4.161787810898318},{"x":3.8133486142161246,"y":-3.9387574491940995},{"x":3.624173600000063,"y":-3.7998399999999037}]} />
<silkscreentext text="{NAME}" pcbX="-0.0004064mm" pcbY="6.359654mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-8.710016099999962,"y":5.600002000000018},{"x":8.710016099999962,"y":5.600002000000018},{"x":8.710016099999962,"y":-5.600002000000018},{"x":-8.710016099999962,"y":-5.600002000000018},{"x":-8.710016099999962,"y":5.600002000000018}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C3281656.obj?uuid=f8ba2e690d3742b5b218176238f311c2",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C3281656.step?uuid=f8ba2e690d3742b5b218176238f311c2",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 1.7330265999999712, y: 0.000015699999842855306, z: 0 },
      }}
      {...props}
    />
  )
}