import type { ResistorProps } from "@tscircuit/props"

// 0402, +/-1%, +/-100 ppm/C, 1/16 W; MODE configuration resistor.
export const VO_0402_1pct_21K = (props: Omit<ResistorProps, "resistance">) => {
  const { name = "R1", ...restProps } = props

  return (
    <resistor
      name={name}
      resistance="21kohm"
      tolerance="1%"
      pinAttributes={{pin1: {isPassive: true}, pin2: {isPassive: true}}}
      supplierPartNumbers={{
  "jlcpcb": [
    "C2906409"
  ]
}}
      manufacturerPartNumber="0402 ±1% 21K"
      datasheetUrl="https://jlc-prod-smt.oss-eu-central-1.aliyuncs.com/smtDataManualFile/8590201846947622912-C2906409.pdf"
      // Retain the original lands and package model for this stock substitution.
      footprint={<footprint>
        <smtpad portHints={["pin2"]} pcbX="0.432816mm" pcbY="0mm" width="0.565658mm" height="0.540004mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-0.432816mm" pcbY="0mm" width="0.565658mm" height="0.540004mm" shape="rect" />
<silkscreenpath route={[{"x":-0.22621240000012222,"y":-0.4986020000000053},{"x":-0.9442450000001372,"y":-0.4986020000000053},{"x":-0.9442450000001372,"y":0.498602000000119},{"x":-0.22621240000012222,"y":0.498602000000119}]} />
<silkscreenpath route={[{"x":0.22621240000000853,"y":-0.4986020000000053},{"x":0.9442449999999099,"y":-0.4986020000000053},{"x":0.9442449999999099,"y":0.498602000000119},{"x":0.22621240000000853,"y":0.498602000000119}]} />
<silkscreentext text="{NAME}" pcbX="0mm" pcbY="1.508mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-0.9656450000001087,"y":0.5200019999999768},{"x":0.965644999999995,"y":0.5200019999999768},{"x":0.965644999999995,"y":-0.5200019999999768},{"x":-0.9656450000001087,"y":-0.5200019999999768},{"x":-0.9656450000001087,"y":0.5200019999999768}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C185441.obj?uuid=026a4a15ab5c4a92ac0e421d6d013717",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C185441.step?uuid=026a4a15ab5c4a92ac0e421d6d013717",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: 0 },
      }}
      {...restProps}
    />
  )
}