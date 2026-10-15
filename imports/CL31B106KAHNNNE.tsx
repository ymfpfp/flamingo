import type { CapacitorProps } from "@tscircuit/props"

export const CL31B106KAHNNNE = (props: Omit<CapacitorProps, "capacitance">) => {
  const { name = "C1", ...restProps } = props

  return (
    <capacitor
      name={name}
      capacitance="10uF"
      maxVoltageRating="25V"
      pinAttributes={{pin1: {isPassive: true}, pin2: {isPassive: true}}}
      supplierPartNumbers={{
  "jlcpcb": [
    "C14860"
  ]
}}
      manufacturerPartNumber="CL31B106KAHNNNE"
      footprint="smdpads2_p3.1852mm_pw1.485mm_ph1.728mm_cyw5.1702mm_cyh2.228mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C14860.obj?uuid=c6790e9475e1483991d2c64340b24e96",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C14860.step?uuid=c6790e9475e1483991d2c64340b24e96",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0, z: -0.65 },
      }}
      {...restProps}
    />
  )
}
