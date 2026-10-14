// G-Switch USB4 40 Gbps receptacle, JLCPCB C3019713.
// Preserve the supplier footprint, including the recessed-body PCB cutout.
import type { ConnectorProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["EP4"],
  pin2: ["EP3"],
  pin3: ["EP1"],
  pin4: ["EP2"],
  pin5: ["GND1","B12"],
  pin6: ["RX1_POS","B11"],
  pin7: ["RX1_NEG","B10"],
  pin8: ["VBUS1","B9"],
  pin9: ["SBU2","B8"],
  pin10: ["D2_NEG","B7"],
  pin11: ["D2_POS","B6"],
  pin12: ["CC2","B5"],
  pin13: ["VBUS2","B4"],
  pin14: ["TX2_NEG","B3"],
  pin15: ["TX2_POS","B2"],
  pin16: ["GND2","B1"],
  pin17: ["GND3","A12"],
  pin18: ["RX2_POS","A11"],
  pin19: ["RX2_NEG","A10"],
  pin20: ["VBUS3","A9"],
  pin21: ["SBU1","A8"],
  pin22: ["D1_NEG","D_NEG","A7"],
  pin23: ["D1_POS","A6"],
  pin24: ["CC1","A5"],
  pin25: ["VBUS4","A4"],
  pin26: ["TX1_NEG","A3"],
  pin27: ["TX1_POS","A2"],
  pin28: ["GND4","A1"],
  // The supplier footprint has separate front and rear lands for these shell contacts.
  pin29: ["EP1_FRONT"],
  pin30: ["EP2_FRONT"]
} as const

export const GT_USB_7087B = (props: ConnectorProps) => {
  return (
    <connector
      standard="usb_c"
      pinLabels={pinLabels}
      schPinArrangement={{
        rightSide: {
          direction: "top-to-bottom",
          pins: [
            28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17,
            16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5,
          ],
        },
        bottomSide: { direction: "left-to-right", pins: [3, 29, 4, 30, 2, 1] },
      }}
      schWidth="2.389mm"
      schHeight="5.535mm"
      supplierPartNumbers={{
  "jlcpcb": [
    "C3019713"
  ]
}}
      manufacturerPartNumber="GT-USB-7087B"
      datasheetUrl="https://wmsc.lcsc.com/wmsc/upload/file/pdf/v2/lcsc/2401030907_G-Switch-GT-USB-7087B_C3019713.pdf"
      footprint={<footprint insertionDirection="from_bottom">
        <cutout shape="polygon" points={[{"x":-4.699126999999862,"y":-4.029519499999992},{"x":-4.700092199999858,"y":1.2194158999999445},{"x":4.699888999999985,"y":1.2194158999999445},{"x":4.698873000000049,"y":-4.029519499999992}]} />
<platedhole  portHints={["pin3"]} pcbX="5.819775mm" pcbY="0.2394585mm" holeWidth="0.5999988mm" holeHeight="1.8499836mm" outerWidth="0.999998mm" outerHeight="2.2500082mm" shape="pill" />
<platedhole  portHints={["pin4"]} pcbX="-5.820029mm" pcbY="0.2394585mm" holeWidth="0.5999988mm" holeHeight="1.8499836mm" outerWidth="0.999998mm" outerHeight="2.2500082mm" shape="pill" />
<platedhole  portHints={["pin2"]} pcbX="-4.320159mm" pcbY="2.8792805mm" holeWidth="0.5999988mm" holeHeight="1.8999962mm" outerWidth="1.1999976mm" outerHeight="2.2999954mm" shape="pill" />
<platedhole  portHints={["pin1"]} pcbX="4.319905mm" pcbY="2.8792805mm" holeWidth="0.5999988mm" holeHeight="1.8999962mm" outerWidth="1.1999976mm" outerHeight="2.2999954mm" shape="pill" />
<platedhole  portHints={["pin2"]} pcbX="-4.000119mm" pcbY="2.3794085mm" holeWidth="0.700024mm" holeHeight="1.2999974mm" outerWidth="1.1999976mm" outerHeight="1.499997mm" pcbRotation="90deg" shape="pill" />
<platedhole  portHints={["pin1"]} pcbX="3.999865mm" pcbY="2.3794085mm" holeWidth="0.700024mm" holeHeight="1.2999974mm" outerWidth="1.1999976mm" outerHeight="1.499997mm" pcbRotation="90deg" shape="pill" />
<platedhole  portHints={["pin29"]} pcbX="6.419977mm" pcbY="-2.6607135mm" holeWidth="0.5999988mm" holeHeight="1.8499836mm" outerWidth="0.999998mm" outerHeight="2.2500082mm" shape="pill" />
<platedhole  portHints={["pin30"]} pcbX="-6.419977mm" pcbY="-2.6607135mm" holeWidth="0.5999988mm" holeHeight="1.8499836mm" outerWidth="0.999998mm" outerHeight="2.2500082mm" shape="pill" />
<smtpad portHints={["pin5"]} pcbX="-2.875153mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin6"]} pcbX="-2.375281mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin7"]} pcbX="-1.875155mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin8"]} pcbX="-1.375283mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin9"]} pcbX="-0.875157mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin10"]} pcbX="-0.375285mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin11"]} pcbX="0.124841mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin12"]} pcbX="0.624713mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin13"]} pcbX="1.124839mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin14"]} pcbX="1.624711mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin15"]} pcbX="2.124837mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin16"]} pcbX="2.624709mm" pcbY="1.8792825mm" width="0.270002mm" height="0.7999984mm" shape="rect" />
<smtpad portHints={["pin17"]} pcbX="2.874899mm" pcbY="3.5292665mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin18"]} pcbX="2.374773mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin19"]} pcbX="1.874901mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin20"]} pcbX="1.374775mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin21"]} pcbX="0.874903mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin22"]} pcbX="0.374777mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin23"]} pcbX="-0.125095mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin24"]} pcbX="-0.625221mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin25"]} pcbX="-1.125093mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin26"]} pcbX="-1.625219mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin27"]} pcbX="-2.125091mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<smtpad portHints={["pin28"]} pcbX="-2.625217mm" pcbY="3.5295205mm" width="0.270002mm" height="0.999998mm" shape="rect" />
<silkscreenpath route={[{"x":-4.69709499999999,"y":-4.486592500000029},{"x":-4.69709499999999,"y":1.588960499999871}]} />
<silkscreenpath route={[{"x":-4.69709499999999,"y":-4.486592500000029},{"x":4.700905000000034,"y":-4.486592500000029},{"x":4.700905000000034,"y":1.5910432999999102}]} />
<silkscreentext text="{NAME}" pcbX="-0.012827mm" pcbY="5.0299005mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-7.169975999999906,"y":4.279519499999992},{"x":7.169975999999906,"y":4.279519499999992},{"x":7.169975999999906,"y":-4.685614700000087},{"x":-7.169975999999906,"y":-4.685614700000087},{"x":-7.169975999999906,"y":4.279519499999992}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C3019713.obj?uuid=aeb7474fd9524ef5aa0ff98e9c5c2638",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C3019713.step?uuid=aeb7474fd9524ef5aa0ff98e9c5c2638",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: -9.41474120000005, y: 22.580026300000046, z: 3.0521716000000003 },
      }}
      {...props}
    />
  )
}
