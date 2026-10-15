import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["SENSE"],
  pin2: ["GND"],
  pin3: ["N_MR"],
  pin4: ["VDD"],
  pin5: ["CT"],
  pin6: ["N_RESET"]
} as const

const pinAttributes = {
  pin2: {requiresGround: true},
  pin4: {requiresPower: true}
} as const

export const TPS389001DSET = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C2066907"
  ]
}}
      manufacturerPartNumber="TPS389001DSET"
      datasheetUrl="https://www.ti.com/lit/ds/symlink/tps3890.pdf"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-0.581025mm" pcbY="0.499999mm" width="0.8400034mm" height="0.2800096mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="-0.636143mm" pcbY="0.000127mm" width="0.7500112mm" height="0.2800096mm" shape="rect" />
<smtpad portHints={["pin3"]} pcbX="-0.636143mm" pcbY="-0.499999mm" width="0.7500112mm" height="0.2800096mm" shape="rect" />
<smtpad portHints={["pin4"]} pcbX="0.636143mm" pcbY="-0.499999mm" width="0.7500112mm" height="0.2800096mm" shape="rect" />
<smtpad portHints={["pin5"]} pcbX="0.636143mm" pcbY="0.000127mm" width="0.7500112mm" height="0.2800096mm" shape="rect" />
<smtpad portHints={["pin6"]} pcbX="0.636143mm" pcbY="0.499999mm" width="0.7500112mm" height="0.2800096mm" shape="rect" />
<silkscreenpath route={[{"x":-1.0417809999999008,"y":-0.8888729999999896},{"x":1.0562589999999545,"y":-0.8888729999999896}]} />
<silkscreenpath route={[{"x":-1.0570209999999634,"y":0.914527000000021},{"x":1.0410190000000057,"y":0.914527000000021}]} />
<silkscreencircle pcbX="-1.346581mm" pcbY="0.508127mm" radius="0.0635mm" />
<silkscreentext text="{NAME}" pcbX="-0.181737mm" pcbY="1.906399mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-1.2611485999999559,"y":1.0000111999999035},{"x":1.2611485999999559,"y":1.0000111999999035},{"x":1.2611485999999559,"y":-0.9999858000001041},{"x":-1.2611485999999559,"y":-0.9999858000001041},{"x":-1.2611485999999559,"y":1.0000111999999035}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2066907.obj?uuid=089468ff55b44f4ab6e582b4badd6629",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2066907.step?uuid=089468ff55b44f4ab6e582b4badd6629",
        pcbRotationOffset: 270,
        modelOriginPosition: { x: 0.000012699999956566899, y: 0.0003809999999475622, z: 0 },
      }}
      {...props}
    />
  )
}
