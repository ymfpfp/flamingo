import type { CapacitorProps } from "@tscircuit/props"

/** Panasonic F12 lands: 4.3 mm gap, 13.1 mm total span, 1.9 mm pad width.
 * Each pad is 4.4 x 1.9 mm at x = +/-4.35 mm. Pin 1 is positive.
 * Source: datasheets/Panasonic-OSCON-SMD-lands.pdf, page 1.
 * Supplier artwork and 3D model imported with tsci; lands follow the manufacturer.
 */
export const A_25SVPK470M = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="470uF"
      maxVoltageRating="25V"
      polarized
      supplierPartNumbers={{
  "jlcpcb": [
    "C454276"
  ]
}}
      manufacturerPartNumber="25SVPK470M"
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
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C454276.obj?uuid=e5a081a4e9a94940a5f97e2781241c48",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C454276.step?uuid=e5a081a4e9a94940a5f97e2781241c48",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: -0.00005080000005364127, y: -0.000012700000070253736, z: -1.4 },
      }}
      {...restProps}
    />
  )
}
