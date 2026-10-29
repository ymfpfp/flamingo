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

export const SN74AHCT1G14DCKR = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C7486"
  ]
}}
      datasheetUrl="https://www.ti.com/lit/ds/symlink/sn74ahct1g14.pdf"
      manufacturerPartNumber="SN74AHCT1G14DCKR"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="1.0499344mm" pcbY="-0.649986mm" width="0.7999984mm" height="0.3999992mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="1.0499344mm" pcbY="0mm" width="0.7999984mm" height="0.3999992mm" shape="rect" />
<smtpad portHints={["pin3"]} pcbX="1.0499344mm" pcbY="0.649986mm" width="0.7999984mm" height="0.3999992mm" shape="rect" />
<smtpad portHints={["pin4"]} pcbX="-1.0499344mm" pcbY="0.649986mm" width="0.7999984mm" height="0.3999992mm" shape="rect" />
<smtpad portHints={["pin5"]} pcbX="-1.0499344mm" pcbY="-0.649986mm" width="0.7999984mm" height="0.3999992mm" shape="rect" />
<silkscreenpath route={[{"x":-0.6349999999999909,"y":-0.2705100000000584},{"x":-0.6349999999999909,"y":0.2705100000000584}]} />
<silkscreenpath route={[{"x":0.6349999999999909,"y":-1.0159999999999627},{"x":-0.6349999999999909,"y":-1.0159999999999627}]} />
<silkscreenpath route={[{"x":-0.6349999999999909,"y":1.0160000000000764},{"x":0.6349999999999909,"y":1.0160000000000764}]} />
<silkscreenpath route={[{"x":0.3809999999998581,"y":-0.6349999999999909},{"x":0.2559114714953239,"y":-0.511811619950663},{"x":0.13208647976045995,"y":-0.6362699999999677},{"x":0.2559114714953239,"y":-0.760728380049386},{"x":0.3809999999998581,"y":-0.6375400000000582}]} />
<silkscreentext text="{NAME}" pcbX="-0mm" pcbY="2.0414mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-1.6999335999998948,"y":1.249998000000005},{"x":1.6999335999998948,"y":1.249998000000005},{"x":1.6999335999998948,"y":-1.249998000000005},{"x":-1.6999335999998948,"y":-1.249998000000005},{"x":-1.6999335999998948,"y":1.249998000000005}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C7486.obj?uuid=cb969c45c1dd4fed98451329f3c3c26e",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C7486.step?uuid=cb969c45c1dd4fed98451329f3c3c26e",
        pcbRotationOffset: 180,
        modelOriginPosition: { x: 0, y: 0, z: -0.049083 },
      }}
      {...props}
    />
  )
}