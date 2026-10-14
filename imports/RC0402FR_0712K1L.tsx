import type { ResistorProps } from "@tscircuit/props"

export const RC0402FR_0712K1L = (props: Omit<ResistorProps, "resistance">) => {
  const { name = "R1", ...restProps } = props

  return (
    <resistor
      name={name}
      resistance="12.1kohm"
      tolerance="1%"
      supplierPartNumbers={{
  "jlcpcb": [
    "C132157"
  ]
}}
      manufacturerPartNumber="RC0402FR-0712K1L"
      footprint="smdpads2_p0.8656mm_pw0.5657mm_ph0.54mm_cyw1.9313mm_cyh1.04mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C132157.obj?uuid=026a4a15ab5c4a92ac0e421d6d013717",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C132157.step?uuid=026a4a15ab5c4a92ac0e421d6d013717",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: 0 },
      }}
      {...restProps}
    />
  )
}
