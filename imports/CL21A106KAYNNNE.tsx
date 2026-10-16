import type { CapacitorProps } from "@tscircuit/props"

// Samsung 0805 (2012 metric): 10uF +/-10%, 25V, X5R (-55 to +85 C).
// Copper lands: 1.41 x 1.35mm, 2.00mm center spacing (EasyEDA C15850).
const pinAttributes = {
  pin2: {isPassive: true},
  pin1: {isPassive: true}
} satisfies NonNullable<CapacitorProps["pinAttributes"]>

export const CL21A106KAYNNNE = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="10uF"
      maxVoltageRating="25V"
      polarized={false}
      datasheetUrl="https://media.digikey.com/pdf/Data%20Sheets/Samsung%20PDFs/CL21A106KAYNNNE_Char.pdf"
      supplierPartNumbers={{
  "jlcpcb": [
    "C15850"
  ]
}}
      manufacturerPartNumber="CL21A106KAYNNNE"
      pinAttributes={pinAttributes}
      footprint="smdpads2_p2mm_pw1.41mm_ph1.35mm_cyw3.91mm_cyh1.85mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C15850.obj?uuid=b87ab0c5465a48b3a1c9a6dac8d30bc5",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C15850.step?uuid=b87ab0c5465a48b3a1c9a6dac8d30bc5",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: -0.65 },
      }}
      {...restProps}
    />
  )
}
