import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["PG"],
  pin2: ["SW"],
  pin3: ["VOS"],
  pin4: ["GND"],
  pin5: ["EN"],
  pin6: ["VIN"],
  pin7: ["MODE","S_CONF"],
  pin8: ["SS","TR"],
  pin9: ["FB","VSET"]
} as const

const pinAttributes = {
  pin4: {requiresGround: true},
  pin6: {requiresPower: true}
} as const

export const TPS62903RPJR = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C2866502"
  ]
}}
      manufacturerPartNumber="TPS62903RPJR"
      datasheetUrl="https://www.ti.com/lit/ds/symlink/tps62903.pdf"
      footprint={<footprint>
        <smtpad portHints={["pin1"]} pcbX="-0.625094mm" pcbY="0.07493mm" width="0.6500114mm" height="0.1999996mm" shape="rect" />
<smtpad portHints={["pin2"]} pcbX="-0.625094mm" pcbY="-0.424942mm" width="0.6500114mm" height="0.1999996mm" shape="rect" />
<smtpad portHints={["pin3"]} pcbX="-0.625094mm" pcbY="-0.925068mm" width="0.6500114mm" height="0.1999996mm" shape="rect" />
<smtpad portHints={["pin4"]} pcbX="0.450088mm" pcbY="-0.925068mm" width="0.999998mm" height="0.1999996mm" shape="rect" />
<smtpad portHints={["pin5"]} pcbX="0.625094mm" pcbY="-0.424942mm" width="0.6500114mm" height="0.1999996mm" shape="rect" />
<smtpad portHints={["pin6"]} pcbX="0.450088mm" pcbY="0.07493mm" width="0.999998mm" height="0.1999996mm" shape="rect" />
<smtpad portHints={["pin9"]} pcbX="-0.499872mm" pcbY="0.750062mm" width="0.2500122mm" height="0.5500116mm" shape="rect" />
<smtpad portHints={["pin8"]} pcbX="0mm" pcbY="0.750062mm" width="0.2500122mm" height="0.5500116mm" shape="rect" />
<smtpad portHints={["pin7"]} pcbX="0.500126mm" pcbY="0.750062mm" width="0.2500122mm" height="0.5500116mm" shape="rect" />
<silkscreenpath route={[{"x":-0.7791196000000582,"y":0.8992616000000453},{"x":-0.781126200000017,"y":0.9043415999999525},{"x":-0.7845044000000598,"y":0.8417051999999785}]} />
<silkscreenpath route={[{"x":0.786917399999993,"y":0.32915860000002795},{"x":0.786917399999993,"y":0.8992616000000453},{"x":0.7791195999998308,"y":0.8992616000000453}]} />
<silkscreenpath route={[{"x":-0.7845044000000598,"y":-1.1791442000001098},{"x":-0.7845044000000598,"y":-1.2546583999999257},{"x":0.786917399999993,"y":-1.2546583999999257},{"x":0.786917399999993,"y":-1.179169600000023}]} />
<silkscreenpath route={[{"x":-0.7791196000000582,"y":0.8417051999999785},{"x":-0.7845044000000598,"y":0.8417051999999785},{"x":-0.7845044000000598,"y":0.32915860000002795}]} />
<silkscreencircle pcbX="-0.987806mm" pcbY="0.35179mm" radius="0.041148mm" />
<silkscreentext text="{NAME}" pcbX="-0.0508mm" pcbY="2.018794mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-1.2000997000001234,"y":1.275067799999988},{"x":1.2000997000000098,"y":1.275067799999988},{"x":1.2000997000000098,"y":-1.4255119999999124},{"x":-1.2000997000001234,"y":-1.4255119999999124},{"x":-1.2000997000001234,"y":1.275067799999988}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2866502.obj?uuid=61370b63026d46fdac5ccb059972eccd",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2866502.step?uuid=61370b63026d46fdac5ccb059972eccd",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0.000012700000070253736, y: 0.176014000000021, z: 0 },
      }}
      {...props}
    />
  )
}
