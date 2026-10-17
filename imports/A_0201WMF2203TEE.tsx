import type { ResistorProps } from "@tscircuit/props"

export const A_0201WMF2203TEE = (props: Omit<ResistorProps, "resistance">) => {
  const { name = "R1", ...restProps } = props

  return (
    <resistor
      name={name}
      resistance="220kohm"
      tolerance="1%"
      supplierPartNumbers={{
  "jlcpcb": [
    "C473458"
  ]
}}
      manufacturerPartNumber="0201WMF2203TEE"
      datasheetUrl="https://jlc-prod-smt.oss-eu-central-1.aliyuncs.com/smtDataManualFile/8590907568187523072-C473458.pdf"
      // Retain the original lands and package model for this stock substitution.
      footprint={<footprint>
        <smtpad portHints={["pin2"]} pcbX="0.241554mm" pcbY="0mm" width="0.3031236mm" height="0.3240024mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-0.241554mm" pcbY="0mm" width="0.3031236mm" height="0.3240024mm" shape="rect" />
<silkscreenpath route={[{"x":0.16619220000006862,"y":-0.3906011999999919},{"x":0.6217158000000609,"y":-0.3906011999999919},{"x":0.6217158000000609,"y":0.3906011999999919},{"x":0.16619220000006862,"y":0.3906011999999919}]} />
<silkscreenpath route={[{"x":-0.16619220000006862,"y":-0.3906011999999919},{"x":-0.6217158000000609,"y":-0.3906011999999919},{"x":-0.6217158000000609,"y":0.3906011999999919},{"x":-0.16619220000006862,"y":0.3906011999999919}]} />
<silkscreentext text="{NAME}" pcbX="0.0127mm" pcbY="1.381mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-0.6431158000000323,"y":0.4120011999999633},{"x":0.6431158000000323,"y":0.4120011999999633},{"x":0.6431158000000323,"y":-0.4120011999999633},{"x":-0.6431158000000323,"y":-0.4120011999999633},{"x":-0.6431158000000323,"y":0.4120011999999633}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C142020.obj?uuid=d4bc942584f744c8ab5f747ba7e908cc",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C142020.step?uuid=d4bc942584f744c8ab5f747ba7e908cc",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0.000012699999956566899, z: 0 },
      }}
      {...restProps}
    />
  )
}