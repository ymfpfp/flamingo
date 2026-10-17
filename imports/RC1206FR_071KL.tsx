import type { ResistorProps } from "@tscircuit/props"

export const RC1206FR_071KL = (props: Omit<ResistorProps, "resistance">) => {
  const { name = "R1", ...restProps } = props

  return (
    <resistor
      name={name}
      resistance="1kohm"
      tolerance="1%"
      pinAttributes={{pin1: {isPassive: true}, pin2: {isPassive: true}}}
      supplierPartNumbers={{
  "jlcpcb": [
    "C131398"
  ]
}}
      manufacturerPartNumber="RC1206FR-071KL"
      datasheetUrl="https://jlc-prod-smt.oss-eu-central-1.aliyuncs.com/smtDataManualFile/8755572545817063424-C131398.pdf"
      // Retain the original lands and package model for this stock substitution.
      footprint="smdpads2_p2.9576mm_pw1.2075mm_ph1.701mm_cyw4.6651mm_cyh2.201mm"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C52199.obj?uuid=da5f078ee43c429f91838a456f48f0a8",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C52199.step?uuid=da5f078ee43c429f91838a456f48f0a8",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0, y: 0, z: 0 },
      }}
      {...restProps}
    />
  )
}
