import type { PushButtonProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["pin1"],
  pin2: ["pin2"]
} as const

export const TS_1088_AR02016 = (props: PushButtonProps<typeof pinLabels>) => {
  const { name = "SW1", ...restProps } = props

  return (
    <pushbutton
      name={name}
      pinLabels={pinLabels}
      supplierPartNumbers={{
  "jlcpcb": [
    "C720477"
  ]
}}
      manufacturerPartNumber="TS-1088-AR02016"
      footprint="smdpads2_p4.3698mm_pw1.23mm_ph1.86mm_cyw6.0998mm_cyh3.4mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C720477.obj?uuid=2e35dca8e7854ed683469f8d54d1ef17",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C720477.step?uuid=2e35dca8e7854ed683469f8d54d1ef17",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: 0 },
      }}
      {...restProps}
    />
  )
}