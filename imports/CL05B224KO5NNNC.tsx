import type { CapacitorProps } from "@tscircuit/props"

// Samsung 0402 (1005 metric): 220nF +/-10%, 16V, X7R (-55 to +125 C).
// Copper lands: 0.50 x 0.54mm, 0.8402mm center spacing (EasyEDA C16772).
export const CL05B224KO5NNNC = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="220nF"
      maxVoltageRating="16V"
      polarized={false}
      pinAttributes={{pin1: {isPassive: true}, pin2: {isPassive: true}}}
      datasheetUrl="https://product.samsungsem.com/mlcc/CL05B224KO5NNN.do"
      supplierPartNumbers={{
  "jlcpcb": [
    "C16772"
  ]
}}
      manufacturerPartNumber="CL05B224KO5NNNC"
      footprint="smdpads2_p0.8402mm_pw0.5mm_ph0.54mm_cyw1.8402mm_cyh1.04mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C16772.obj?uuid=32fe2cf9314f444ca2785a33c2db7189",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C16772.step?uuid=32fe2cf9314f444ca2785a33c2db7189",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: -0.25 },
      }}
      {...restProps}
    />
  )
}
