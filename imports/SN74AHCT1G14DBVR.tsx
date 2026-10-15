import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["NC"],
  pin2: ["A"],
  pin3: ["GND"],
  pin4: ["Y"],
  pin5: ["VCC"]
} as const

const pinAttributes = {
  pin1: {doNotConnect: true},
  pin3: {requiresGround: true},
  pin5: {requiresPower: true}
} as const

export const SN74AHCT1G14DBVR = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C55250"
  ]
}}
      manufacturerPartNumber="SN74AHCT1G14DBVR"
      footprint="sot25_w2.6mm_pl1.1mm_pin1location(rightside,bottom)"
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C55250.obj?uuid=460193f9bf2d42e58cf3c2f675b07dc6",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C55250.step?uuid=460193f9bf2d42e58cf3c2f675b07dc6",
        pcbRotationOffset: 180,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: -0.049083 },
      }}
      {...props}
    />
  )
}