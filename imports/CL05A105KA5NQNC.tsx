import type { CapacitorProps } from "@tscircuit/props"

const pinAttributes = {
  pin2: {isPassive: true},
  pin1: {isPassive: true}
} satisfies NonNullable<CapacitorProps["pinAttributes"]>

export const CL05A105KA5NQNC = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="1uF"
      supplierPartNumbers={{
  "jlcpcb": [
    "C52923"
  ]
}}
      manufacturerPartNumber="CL05A105KA5NQNC"
      pinAttributes={pinAttributes}
      footprint="smdpads2_p0.8402mm_pw0.5mm_ph0.54mm_cyw1.8402mm_cyh1.04mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C52923.obj?uuid=32fe2cf9314f444ca2785a33c2db7189",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C52923.step?uuid=32fe2cf9314f444ca2785a33c2db7189",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: -0.25 },
      }}
      {...restProps}
    />
  )
}