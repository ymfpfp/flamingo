import type { CapacitorProps } from "@tscircuit/props"

export const GRM033R61E334KE15D = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="330nF"
      maxVoltageRating="25V"
      datasheetUrl="https://atta.szlcsc.com/upload/public/pdf/source/20201110/C723889_19681A2E100860EFE3D472AF09B35084.pdf"
      supplierPartNumbers={{
  "jlcpcb": [
    "C723889"
  ]
}}
      manufacturerPartNumber="GRM033R61E334KE15D"
      footprint={<footprint>
        <smtpad portHints={["pin2"]} pcbX="0.27432mm" pcbY="0mm" width="0.368427mm" height="0.3240024mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-0.27432mm" pcbY="0mm" width="0.368427mm" height="0.3240024mm" shape="rect" />
<silkscreenpath route={[{"x":0.5346445999999787,"y":0.3906011999999919},{"x":0.16619220000006862,"y":0.3906011999999919}]} />
<silkscreenpath route={[{"x":0.16619220000006862,"y":-0.3906011999999919},{"x":0.5346445999999787,"y":-0.3906011999999919}]} />
<silkscreenpath route={[{"x":0.6870446000000356,"y":-0.23820120000004863},{"x":0.6870446000000356,"y":0.23820120000004863}]} />
<silkscreenpath route={[{"x":-0.5346446000000924,"y":0.3906011999999919},{"x":-0.16619220000006862,"y":0.3906011999999919}]} />
<silkscreenpath route={[{"x":-0.16619220000006862,"y":-0.3906011999999919},{"x":-0.5346446000000924,"y":-0.3906011999999919}]} />
<silkscreenpath route={[{"x":-0.6870446000001493,"y":-0.23820120000004863},{"x":-0.6870446000001493,"y":0.23820120000004863}]} />
<silkscreenpath route={[{"x":0.5346445999999787,"y":-0.3906011999998782},{"x":0.6424076734527944,"y":-0.3459642734528643},{"x":0.6870446000000356,"y":-0.23820120000004863}]} />
<silkscreenpath route={[{"x":0.6870446000000356,"y":0.23820120000004863},{"x":0.6424076734527944,"y":0.3459642734528643},{"x":0.5346445999999787,"y":0.3906011999999919}]} />
<silkscreenpath route={[{"x":-0.5346446000000924,"y":-0.3906011999998782},{"x":-0.6424076734529081,"y":-0.3459642734528643},{"x":-0.6870446000001493,"y":-0.23820120000004863}]} />
<silkscreenpath route={[{"x":-0.6870446000001493,"y":0.23820120000004863},{"x":-0.6424076734529081,"y":0.3459642734528643},{"x":-0.5346446000000924,"y":0.3906011999999919}]} />
<silkscreentext text="{NAME}" pcbX="0mm" pcbY="1.381mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-0.7085335000001578,"y":0.4120011999999633},{"x":0.7085335000000441,"y":0.4120011999999633},{"x":0.7085335000000441,"y":-0.4120011999999633},{"x":-0.7085335000001578,"y":-0.4120011999999633},{"x":-0.7085335000001578,"y":0.4120011999999633}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C723889.obj?uuid=c3e75c3d90204c70b153866ab54c789f",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C723889.step?uuid=c3e75c3d90204c70b153866ab54c789f",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: -0.15 },
      }}
      {...restProps}
    />
  )
}