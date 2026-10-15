import type { LedProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["cathode","neg"],
  pin2: ["anode","pos"]
} as const

export const XL_1608UWC_04 = (props: LedProps) => {
  const { name = "LED1", ...restProps } = props

  return (
    <led
      name={name}
      pinLabels={pinLabels}
      supplierPartNumbers={{
  "jlcpcb": [
    "C965808"
  ]
}}
      manufacturerPartNumber="XL-1608UWC-04"
      footprint="smdpads2_p1.5989mm_pw0.8mm_ph0.8mm_cyw2.8989mm_cyh1.3069mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C965808.obj?uuid=fcc6bbf4fada4f9f8bee08ab37648180",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C965808.step?uuid=fcc6bbf4fada4f9f8bee08ab37648180",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0, z: -0.02 },
      }}
      {...restProps}
    />
  )
}