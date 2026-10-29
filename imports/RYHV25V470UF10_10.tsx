import type { CapacitorProps } from "@tscircuit/props"

/** Honor RYHV 10 x 10.5 mm body. Retain the qualified F12 copper lands.
 * The manufacturer's terminal drawing has a 4.5 +/-0.2 mm inner gap,
 * <=1.1 mm lead width and <=10.5 mm base span. These fit within the
 * 4.3 mm land gap, 1.9 mm land width and 13.1 mm outer span.
 * Pin 1 remains positive. No Panasonic 3D model is reused.
 * Source: datasheets/Honor-RYHV-C48970606.pdf, pages 1 and 3.
 */
export const RYHV25V470UF10_10 = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="470uF"
      maxVoltageRating="25V"
      polarized
      supplierPartNumbers={{
  "jlcpcb": [
    "C48970606"
  ]
}}
      manufacturerPartNumber="RYHV25V470UF10*10"
      datasheetUrl="https://jlcpcb.com/partdetail/HonorElec-RYHV25V470UF1010/C48970606"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-4.35mm" pcbY="0mm" width="4.4mm" height="1.9mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="4.35mm" pcbY="0mm" width="4.4mm" height="1.9mm" shape="rect" />
<silkscreenpath route={[{"x":5.226176999999893,"y":-1.25},{"x":5.226176999999893,"y":-5.225795999999946}]} />
<silkscreenpath route={[{"x":5.226176999999893,"y":5.226227800000061},{"x":5.226176999999893,"y":1.25}]} />
<silkscreenpath route={[{"x":-5.226278600000114,"y":-1.25},{"x":-5.226278600000114,"y":-3.089655999999991}]} />
<silkscreenpath route={[{"x":-5.226278600000114,"y":3.089986200000112},{"x":-5.226278600000114,"y":1.25}]} />
<silkscreenpath route={[{"x":5.226176999999893,"y":-5.225795999999946},{"x":-3.0897830000000113,"y":-5.225795999999946},{"x":-5.22592300000008,"y":-3.089655999999991}]} />
<silkscreenpath route={[{"x":5.226176999999893,"y":5.226227800000061},{"x":-3.0900369999999384,"y":5.226227800000061},{"x":-5.226278600000114,"y":3.089986200000112}]} />
<silkscreentext text="{NAME}" pcbX="-0.006223mm" pcbY="6.221224mm" anchorAlignment="center" fontSize="1mm" />
<fabricationnotepath route={[{"x":4.840960600000017,"y":0.1545082000000093},{"x":4.840960600000017,"y":-0.1545082000000093},{"x":3.604945799999996,"y":-0.1545082000000093},{"x":3.604945799999996,"y":0.1545082000000093},{"x":4.840960600000017,"y":0.1545082000000093}]} strokeWidth="0mm" isFilled hasStroke={false} />
<fabricationnotepath route={[{"x":-4.84106220000001,"y":0.1545082000000093},{"x":-4.84106220000001,"y":-0.1545082000000093},{"x":-3.605047400000103,"y":-0.1545082000000093},{"x":-3.605047400000103,"y":0.1545082000000093},{"x":-4.84106220000001,"y":0.1545082000000093}]} strokeWidth="0mm" isFilled hasStroke={false} />
<fabricationnotepath route={[{"x":-4.377563000000009,"y":1.0299953999999616},{"x":-4.377563000000009,"y":-1.029995399999848},{"x":-4.068546599999991,"y":-1.029995399999848},{"x":-4.068546599999991,"y":1.0299953999999616},{"x":-4.377563000000009,"y":1.0299953999999616}]} strokeWidth="0mm" isFilled hasStroke={false} />
<courtyardoutline outline={[{"x":-6.700012499999957,"y":5.400002400000176},{"x":6.700012499999957,"y":5.400002400000176},{"x":6.700012499999957,"y":-5.399977000000035},{"x":-6.700012499999957,"y":-5.399977000000035},{"x":-6.700012499999957,"y":5.400002400000176}]} />
      </footprint>}
      {...restProps}
    />
  )
}
