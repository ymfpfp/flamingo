import type { CapacitorProps } from "@tscircuit/props"

export const PCR1E471MCL1GS = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="470uF"
      maxVoltageRating="25V"
      polarized
      supplierPartNumbers={{
  "jlcpcb": [
    "C2161727"
  ]
}}
      manufacturerPartNumber="PCR1E471MCL1GS"
      footprint={<footprint>
        <smtpad portHints={["pin2"]} pcbX="4.200017mm" pcbY="0mm" width="4.499991mm" height="1.6500094mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-4.200017mm" pcbY="0mm" width="4.499991mm" height="1.6500094mm" shape="rect" />
<silkscreenpath route={[{"x":5.22620239999992,"y":0.8525510000000622},{"x":5.22620239999992,"y":5.226354799999967},{"x":-3.0900116000000253,"y":5.226354799999967},{"x":-5.226253199999974,"y":3.090113199999905},{"x":-5.226253199999974,"y":0.8525510000000622}]} />
<silkscreenpath route={[{"x":5.22620239999992,"y":-0.8522970000000214},{"x":5.22620239999992,"y":-5.22610080000004},{"x":-3.0900116000000253,"y":-5.22610080000004},{"x":-5.226253199999974,"y":-3.0898592000000917},{"x":-5.226253199999974,"y":-0.8522970000000214}]} />
<silkscreentext text="{NAME}" pcbX="0.001143mm" pcbY="6.222748mm" anchorAlignment="center" fontSize="1mm" />
<fabricationnotepath route={[{"x":-4.377537600000096,"y":1.030122399999982},{"x":-4.377537600000096,"y":-1.0298683999999412},{"x":-4.068521199999964,"y":-1.0298683999999412},{"x":-4.068521199999964,"y":1.030122399999982},{"x":-4.377537600000096,"y":1.030122399999982}]} strokeWidth="0mm" isFilled hasStroke={false} />
<fabricationnotepath route={[{"x":-4.841036800000097,"y":0.15463520000002973},{"x":-4.841036800000097,"y":-0.1543811999999889},{"x":-3.6050219999999626,"y":-0.1543811999999889},{"x":-3.6050219999999626,"y":0.15463520000002973},{"x":-4.841036800000097,"y":0.15463520000002973}]} strokeWidth="0mm" isFilled hasStroke={false} />
<fabricationnotepath route={[{"x":4.84098599999993,"y":0.15463520000002973},{"x":4.84098599999993,"y":-0.1543811999999889},{"x":3.6049712000001364,"y":-0.1543811999999889},{"x":3.6049712000001364,"y":0.15463520000002973},{"x":4.84098599999993,"y":0.15463520000002973}]} strokeWidth="0mm" isFilled hasStroke={false} />
<courtyardoutline outline={[{"x":-6.700012499999843,"y":5.4000023999999485},{"x":6.700012499999957,"y":5.4000023999999485},{"x":6.700012499999957,"y":-5.399977000000035},{"x":-6.700012499999843,"y":-5.399977000000035},{"x":-6.700012499999843,"y":5.4000023999999485}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2161727.obj?uuid=e96499321b43407fad45f497456734e7",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2161727.step?uuid=e96499321b43407fad45f497456734e7",
        pcbRotationOffset: 180,
        modelOriginPosition: { x: 0, y: 0.000012699999956566899, z: -0.05 },
      }}
      {...restProps}
    />
  )
}
