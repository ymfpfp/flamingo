import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["pin1"],
  pin2: ["pin2"]
} as const

export const ESD150B1W0201E6327XTSA1 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      // Vertical bidirectional TVS symbol. Both physical pins are interchangeable.
      symbol={<symbol>
        <schematicline x1={0} y1={0.4} x2={0} y2={0.2} strokeWidth={0.025}/>
        <schematicpath points={[{x: -0.14, y: 0.2}, {x: 0, y: 0.04}, {x: 0.14, y: 0.2}, {x: -0.14, y: 0.2}]} strokeWidth={0.025}/>
        <schematicpath points={[{x: -0.18, y: 0.09}, {x: -0.14, y: 0.04}, {x: 0.14, y: 0.04}, {x: 0.18, y: -0.01}]} strokeWidth={0.025}/>
        <schematicline x1={0} y1={0.04} x2={0} y2={-0.04} strokeWidth={0.025}/>
        <schematicpath points={[{x: -0.18, y: 0.01}, {x: -0.14, y: -0.04}, {x: 0.14, y: -0.04}, {x: 0.18, y: -0.09}]} strokeWidth={0.025}/>
        <schematicpath points={[{x: -0.14, y: -0.2}, {x: 0, y: -0.04}, {x: 0.14, y: -0.2}, {x: -0.14, y: -0.2}]} strokeWidth={0.025}/>
        <schematicline x1={0} y1={-0.2} x2={0} y2={-0.4} strokeWidth={0.025}/>
        <schematictext text="{NAME}" schX={0.25} schY={0} anchor="left" fontSize={0.16}/>
        <port name="pin1" pinNumber={1} direction="up" schX={0} schY={0.4}/>
        <port name="pin2" pinNumber={2} direction="down" schX={0} schY={-0.4}/>
      </symbol>}
      supplierPartNumbers={{
  "jlcpcb": [
    "C3709987"
  ]
}}
      manufacturerPartNumber="ESD150B1W0201E6327XTSA1"
      datasheetUrl="https://www.infineon.com/assets/row/public/documents/24/49/infineon-esd150-b1-w0201-datasheet-en.pdf"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-0.200025mm" pcbY="0mm" width="0.1999996mm" height="0.2999994mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="0.200025mm" pcbY="0mm" width="0.1999996mm" height="0.2999994mm" shape="rect" />
<silkscreenpath route={[{"x":-0.4999990000001162,"y":0.33002220000003035},{"x":-0.4999990000001162,"y":-0.3301999999999907}]} />
<silkscreenpath route={[{"x":-0.4999990000001162,"y":0.33002220000003035},{"x":0.4999990000000025,"y":0.33002220000003035}]} />
<silkscreenpath route={[{"x":-0.4999990000001162,"y":-0.3301999999999907},{"x":0.4999990000000025,"y":-0.3301999999999907}]} />
<silkscreenpath route={[{"x":0.4999990000000025,"y":0.33002220000003035},{"x":0.4999990000000025,"y":-0.3301999999999907}]} />
<silkscreentext text="{NAME}" pcbX="-0.015875mm" pcbY="1.3302mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-0.5500247999999601,"y":0.39999969999996665},{"x":0.5500247999999601,"y":0.39999969999996665},{"x":0.5500247999999601,"y":-0.39999969999996665},{"x":-0.5500247999999601,"y":-0.39999969999996665},{"x":-0.5500247999999601,"y":0.39999969999996665}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C3709987.obj?uuid=b46831e01486471d9370454a2ff72624",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C3709987.step?uuid=b46831e01486471d9370454a2ff72624",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: -0.00013970000009067007, y: 0.000012699999956566899, z: -0.01 },
      }}
      {...props}
    />
  )
}
