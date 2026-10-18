import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["IN2"],
  pin2: ["IN3"],
  pin3: ["IN4"],
  pin4: ["GND1"],
  pin5: ["GND2"],
  pin6: ["EN","UVLO"],
  pin7: ["ITIMER"],
  pin8: ["ILIM"],
  pin9: ["IMON"],
  pin10: ["RETRY_DLY"],
  pin11: ["NRETRY"],
  pin12: ["LDSTRT"],
  pin13: ["PG"],
  pin14: ["GND3"],
  pin15: ["dVdt"],
  pin16: ["IN5"],
  pin17: ["OUT1"],
  pin18: ["OUT2"],
  pin19: ["OUT3"],
  pin20: ["OUT4"],
  pin21: ["OUT5"],
  pin22: ["OUT6"],
  pin23: ["OUT7"],
  pin24: ["OUT8"],
  pin25: ["IN1"],
  pin26: ["GND4"]
} as const

const pinAttributes = {
  pin4: {requiresGround: true},
  pin5: {requiresGround: true},
  pin14: {requiresGround: true},
  pin26: {requiresGround: true}
} as const

export const TPS259824LNRGER = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C2155879"
  ]
}}
      manufacturerPartNumber="TPS259824LNRGER"
      footprint={<footprint>
        <smtpad portHints={["pin25"]} pcbX="-0.625094mm" pcbY="-0.014986mm" width="1.4500098mm" height="2.6999946mm" shape="rect" />
<smtpad portHints={["pin1"]} pcbX="-1.250696mm" pcbY="-1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin2"]} pcbX="-0.750316mm" pcbY="-1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin3"]} pcbX="-0.249936mm" pcbY="-1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin4"]} pcbX="0.249936mm" pcbY="-1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin5"]} pcbX="0.750316mm" pcbY="-1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin6"]} pcbX="1.250696mm" pcbY="-1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin7"]} pcbX="1.999996mm" pcbY="-1.250442mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin8"]} pcbX="1.999996mm" pcbY="-0.750316mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin9"]} pcbX="1.999996mm" pcbY="-0.249936mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin10"]} pcbX="1.999996mm" pcbY="0.249936mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin11"]} pcbX="1.999996mm" pcbY="0.750062mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin12"]} pcbX="1.999996mm" pcbY="1.24968mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin13"]} pcbX="1.250696mm" pcbY="1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin14"]} pcbX="0.750316mm" pcbY="1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin15"]} pcbX="0.249936mm" pcbY="1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin16"]} pcbX="-0.249936mm" pcbY="1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin17"]} pcbX="-0.750316mm" pcbY="1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin18"]} pcbX="-1.250696mm" pcbY="1.999996mm" width="0.2500122mm" height="0.7999984mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin19"]} pcbX="-1.999996mm" pcbY="1.249934mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin20"]} pcbX="-1.999996mm" pcbY="0.750316mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin21"]} pcbX="-1.999996mm" pcbY="0.249936mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin22"]} pcbX="-1.999996mm" pcbY="-0.249936mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin23"]} pcbX="-1.999996mm" pcbY="-0.750316mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin24"]} pcbX="-1.999996mm" pcbY="-1.249934mm" width="0.7999984mm" height="0.2500122mm" radius="0.1250061mm" shape="pill" />
<smtpad portHints={["pin26"]} pcbX="0.924814mm" pcbY="-0.014986mm" width="0.850011mm" height="2.6999946mm" shape="rect" />
<silkscreenpath route={[{"x":2.199766999999838,"y":1.774926599999958},{"x":2.199766999999838,"y":2.1998432000001458},{"x":1.7747995999998238,"y":2.1998432000001458}]} />
<silkscreenpath route={[{"x":2.199766999999838,"y":-1.7750028000000384},{"x":2.199766999999838,"y":-2.199893999999972},{"x":1.7747995999998238,"y":-2.199893999999972}]} />
<silkscreenpath route={[{"x":-1.775053600000092,"y":2.1998432000001458},{"x":-2.1999702000000525,"y":2.1998432000001458},{"x":-2.1999702000000525,"y":1.774926599999958}]} />
<silkscreenpath route={[{"x":-1.775053600000092,"y":-2.199893999999972},{"x":-2.1999702000000525,"y":-2.199893999999972},{"x":-2.1999702000000525,"y":-1.7750028000000384}]} />
<silkscreenpath route={[{"x":-2.000123000000144,"y":-2.5600151999999525},{"x":-2.123844786962991,"y":-2.685637156087637},{"x":-1.9988530000000537,"y":-2.809995547892754},{"x":-1.873861213037344,"y":-2.6856371560874095},{"x":-1.997583000000077,"y":-2.5600151999999525}]} />
<silkscreentext text="{NAME}" pcbX="-0.003556mm" pcbY="3.276856mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-2.6499952000001485,"y":2.649995200000035},{"x":2.649995200000035,"y":2.649995200000035},{"x":2.649995200000035,"y":-2.649995200000035},{"x":-2.6499952000001485,"y":-2.649995200000035},{"x":-2.6499952000001485,"y":2.649995200000035}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2155879.obj?uuid=eeb65730f00b4f7583f6efe02f27c63d",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C2155879.step?uuid=eeb65730f00b4f7583f6efe02f27c63d",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0.00012700000024779, y: 0.000012699999956566899, z: -0.02 },
      }}
      {...props}
    />
  )
}