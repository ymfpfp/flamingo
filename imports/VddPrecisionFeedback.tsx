import type { ResistorProps } from "@tscircuit/props"

// RESI PTFR: 0.1%, 10 ppm/K. Bottom retains the 0402 lands;
// top uses the manufacturer's 0603 land dimensions (datasheet page 3).
export const VddPrecisionFeedback = (props: Omit<ResistorProps, "resistance"> & {bottom?:boolean}) => {
  const { name = "R1", bottom=false, ...restProps } = props

  return (
    <resistor
      name={name}
      resistance={bottom?"2.1kohm":"1.87kohm"}
      tolerance="0.1%"
      pinAttributes={{pin1: {isPassive: true}, pin2: {isPassive: true}}}
      datasheetUrl="https://jlcpcb.com/partdetail/RESI-PTFR0603B1K87N9/C2692849"
      supplierPartNumbers={{
  "jlcpcb": [bottom?"C2693008":"C2692849"]
}}
      manufacturerPartNumber={bottom?"PTFR0402B2K10N9":"PTFR0603B1K87N9"}
      footprint={bottom ? <footprint>
        <smtpad portHints={["pin2"]} pcbX="0.432816mm" pcbY="0mm" width="0.565658mm" height="0.540004mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-0.432816mm" pcbY="0mm" width="0.565658mm" height="0.540004mm" shape="rect" />
<silkscreenpath route={[{"x":-0.22621240000012222,"y":-0.4986020000000053},{"x":-0.9442450000001372,"y":-0.4986020000000053},{"x":-0.9442450000001372,"y":0.498602000000119},{"x":-0.22621240000012222,"y":0.498602000000119}]} />
<silkscreenpath route={[{"x":0.22621240000000853,"y":-0.4986020000000053},{"x":0.9442449999999099,"y":-0.4986020000000053},{"x":0.9442449999999099,"y":0.498602000000119},{"x":0.22621240000000853,"y":0.498602000000119}]} />
<silkscreentext text="{NAME}" pcbX="0mm" pcbY="1.508mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-0.9656450000001087,"y":0.5200019999999768},{"x":0.965644999999995,"y":0.5200019999999768},{"x":0.965644999999995,"y":-0.5200019999999768},{"x":-0.9656450000001087,"y":-0.5200019999999768},{"x":-0.9656450000001087,"y":0.5200019999999768}]} />
      </footprint> : <footprint>
        <smtpad portHints={["pin1"]} pcbX={-1} pcbY={0} width={1} height={1.2} shape="rect"/>
        <smtpad portHints={["pin2"]} pcbX={1} pcbY={0} width={1} height={1.2} shape="rect"/>
        <courtyardrect pcbX={0} pcbY={0} width={3.5} height={1.7}/>
      </footprint>}
      {...restProps}
    />
  )
}
