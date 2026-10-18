import type { InductorProps } from "@tscircuit/props"

export const XGL4020_102MEC = (props: Omit<InductorProps, "inductance">) => {
  return (
    <inductor
      inductance="1uH"
      maxCurrentRating="12A"
      datasheetUrl="https://www.coilcraft.com/getmedia/76c9c081-4945-4c85-9129-9356e1ad6734/xgl4020.pdf"
      supplierPartNumbers={{
  "jlcpcb": [
    "C5357696"
  ]
}}
      manufacturerPartNumber="XGL4020-102MEC"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-1.18491mm" pcbY="0mm" width="0.999998mm" height="3.499993mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="1.18491mm" pcbY="0mm" width="0.999998mm" height="3.499993mm" shape="rect" />
<silkscreenpath route={[{"x":1.99999600000001,"y":1.9999959999998964},{"x":1.99999600000001,"y":-1.9999959999998964}]} />
<silkscreenpath route={[{"x":-2.000021400000037,"y":1.9999959999998964},{"x":-2.000021400000037,"y":-1.9999959999998964}]} />
<silkscreenpath route={[{"x":-2.000021400000037,"y":-1.9999959999998964},{"x":1.99999600000001,"y":-1.9999959999998964}]} />
<silkscreenpath route={[{"x":-2.000021400000037,"y":1.9999959999998964},{"x":1.99999600000001,"y":1.9999959999998964}]} />
<silkscreentext text="{NAME}" pcbX="0mm" pcbY="3.0066mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-2.2499959999998964,"y":2.2499959999998964},{"x":2.24999600000001,"y":2.2499959999998964},{"x":2.24999600000001,"y":-2.2499959999998964},{"x":-2.2499959999998964,"y":-2.2499959999998964},{"x":-2.2499959999998964,"y":2.2499959999998964}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C5357696.obj?uuid=1ed55da782b2499680e541053787395e",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C5357696.step?uuid=1ed55da782b2499680e541053787395e",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0, z: -0.2 },
      }}
      {...props}
    />
  )
}