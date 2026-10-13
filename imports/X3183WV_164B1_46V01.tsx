/** PCIe x16 Gen 4 connector. */

import type { ChipProps } from "@tscircuit/props"

const pinLabels = {
  pin1: ["A1"],
  pin2: ["A2"],
  pin3: ["A3"],
  pin4: ["A4"],
  pin5: ["A5"],
  pin6: ["A6"],
  pin7: ["A7"],
  pin8: ["A8"],
  pin9: ["A9"],
  pin10: ["A10"],
  pin11: ["A11"],
  pin12: ["A13"],
  pin13: ["A12"],
  pin14: ["A14"],
  pin15: ["A15"],
  pin16: ["A16"],
  pin17: ["A17"],
  pin18: ["A18"],
  pin19: ["A19"],
  pin20: ["A20"],
  pin21: ["A21"],
  pin22: ["A22"],
  pin23: ["A23"],
  pin24: ["A24"],
  pin25: ["A25"],
  pin26: ["A26"],
  pin27: ["A27"],
  pin28: ["A28"],
  pin29: ["A29"],
  pin30: ["A30"],
  pin31: ["A31"],
  pin32: ["A32"],
  pin33: ["A33"],
  pin34: ["A34"],
  pin35: ["A35"],
  pin36: ["A36"],
  pin37: ["A37"],
  pin38: ["A38"],
  pin39: ["A39"],
  pin40: ["A40"],
  pin41: ["A41"],
  pin42: ["A42"],
  pin43: ["A43"],
  pin44: ["A44"],
  pin45: ["A45"],
  pin46: ["A46"],
  pin47: ["A47"],
  pin48: ["A48"],
  pin49: ["A49"],
  pin50: ["A50"],
  pin51: ["A51"],
  pin52: ["A52"],
  pin53: ["A53"],
  pin54: ["A54"],
  pin55: ["A55"],
  pin56: ["A56"],
  pin57: ["A57"],
  pin58: ["A58"],
  pin59: ["A59"],
  pin60: ["A60"],
  pin61: ["A61"],
  pin62: ["A62"],
  pin63: ["A63"],
  pin64: ["A64"],
  pin65: ["A65"],
  pin66: ["A66"],
  pin67: ["A67"],
  pin68: ["A68"],
  pin69: ["A69"],
  pin70: ["A70"],
  pin71: ["A71"],
  pin72: ["A72"],
  pin73: ["A73"],
  pin74: ["A74"],
  pin75: ["A75"],
  pin76: ["A76"],
  pin77: ["A77"],
  pin78: ["A78"],
  pin79: ["A79"],
  pin80: ["A80"],
  pin81: ["A81"],
  pin82: ["A82"],
  pin83: ["B81"],
  pin84: ["B79"],
  pin85: ["B77"],
  pin86: ["B75"],
  pin87: ["B73"],
  pin88: ["B71"],
  pin89: ["B69"],
  pin90: ["B67"],
  pin91: ["B65"],
  pin92: ["B63"],
  pin93: ["B61"],
  pin94: ["B59"],
  pin95: ["B57"],
  pin96: ["B55"],
  pin97: ["B53"],
  pin98: ["B51"],
  pin99: ["B49"],
  pin100: ["B47"],
  pin101: ["B45"],
  pin102: ["B43"],
  pin103: ["B41"],
  pin104: ["B39"],
  pin105: ["B37"],
  pin106: ["B35"],
  pin107: ["B33"],
  pin108: ["B31"],
  pin109: ["B29"],
  pin110: ["B27"],
  pin111: ["B25"],
  pin112: ["B23"],
  pin113: ["B21"],
  pin114: ["B19"],
  pin115: ["B17"],
  pin116: ["B15"],
  pin117: ["B13"],
  pin118: ["B11"],
  pin119: ["B9"],
  pin120: ["B7"],
  pin121: ["B5"],
  pin122: ["B3"],
  pin123: ["B1"],
  pin124: ["B82"],
  pin125: ["B80"],
  pin126: ["B78"],
  pin127: ["B76"],
  pin128: ["B74"],
  pin129: ["B72"],
  pin130: ["B70"],
  pin131: ["B68"],
  pin132: ["B66"],
  pin133: ["B64"],
  pin134: ["B62"],
  pin135: ["B60"],
  pin136: ["B58"],
  pin137: ["B56"],
  pin138: ["B54"],
  pin139: ["B52"],
  pin140: ["B50"],
  pin141: ["B48"],
  pin142: ["B46"],
  pin143: ["B44"],
  pin144: ["B42"],
  pin145: ["B40"],
  pin146: ["B38"],
  pin147: ["B36"],
  pin148: ["B34"],
  pin149: ["B32"],
  pin150: ["B30"],
  pin151: ["B28"],
  pin152: ["B26"],
  pin153: ["B24"],
  pin154: ["B22"],
  pin155: ["B20"],
  pin156: ["B18"],
  pin157: ["B16"],
  pin158: ["B14"],
  pin159: ["B12"],
  pin160: ["B10"],
  pin161: ["B8"],
  pin162: ["B6"],
  pin163: ["B4"],
  pin164: ["B2"]
} as const

export const X3183WV_164B1_46V01 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      supplierPartNumbers={{
  "jlcpcb": [
    "C5711214"
  ]
}}
      manufacturerPartNumber="X3183WV-164B1-46V01"
      footprint={<footprint>
        <hole pcbX="-30.9939944mm" pcbY="-0.0001524mm" diameter="2.5000204mm" />
<hole pcbX="42.1559736mm" pcbY="-0.0001524mm" diameter="2.5000204mm" />
<platedhole  portHints={["pin1"]} pcbX="-42.6439838mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin2"]} pcbX="-41.6439858mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin3"]} pcbX="-40.6439878mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin4"]} pcbX="-39.6439898mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin5"]} pcbX="-38.6439918mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin6"]} pcbX="-37.6439938mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin7"]} pcbX="-36.6439958mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin8"]} pcbX="-35.6439978mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin9"]} pcbX="-34.6439998mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin10"]} pcbX="-33.6440018mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin11"]} pcbX="-32.6440038mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin12"]} pcbX="-28.6440118mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin13"]} pcbX="-29.6440098mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin14"]} pcbX="-27.6440138mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin15"]} pcbX="-26.6440158mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin16"]} pcbX="-25.6440178mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin17"]} pcbX="-24.6440198mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin18"]} pcbX="-23.6440218mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin19"]} pcbX="-22.6440238mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin20"]} pcbX="-21.6440258mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin21"]} pcbX="-20.6440278mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin22"]} pcbX="-19.6440298mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin23"]} pcbX="-18.6440318mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin24"]} pcbX="-17.6440338mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin25"]} pcbX="-16.6440358mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin26"]} pcbX="-15.6440378mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin27"]} pcbX="-14.6440398mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin28"]} pcbX="-13.6440418mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin29"]} pcbX="-12.6440438mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin30"]} pcbX="-11.6440458mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin31"]} pcbX="-10.6440478mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin32"]} pcbX="-9.6440498mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin33"]} pcbX="-8.6440518mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin34"]} pcbX="-7.6440538mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin35"]} pcbX="-6.6440558mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin36"]} pcbX="-5.6440578mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin37"]} pcbX="-4.6440598mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin38"]} pcbX="-3.6440618mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin39"]} pcbX="-2.6440638mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin40"]} pcbX="-1.6440658mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin41"]} pcbX="-0.6440678mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin42"]} pcbX="0.3559302mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin43"]} pcbX="1.3559282mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin44"]} pcbX="2.3559262mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin45"]} pcbX="3.3559242mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin46"]} pcbX="4.3559222mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin47"]} pcbX="5.3559202mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin48"]} pcbX="6.3559182mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin49"]} pcbX="7.3559162mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin50"]} pcbX="8.3559142mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin51"]} pcbX="9.3559122mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin52"]} pcbX="10.3559102mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin53"]} pcbX="11.3559082mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin54"]} pcbX="12.3559062mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin55"]} pcbX="13.3559042mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin56"]} pcbX="14.3561562mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin57"]} pcbX="15.3561542mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin58"]} pcbX="16.3561522mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin59"]} pcbX="17.3561502mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin60"]} pcbX="18.3561482mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin61"]} pcbX="19.3561462mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin62"]} pcbX="20.3561442mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin63"]} pcbX="21.3561422mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin64"]} pcbX="22.3561402mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin65"]} pcbX="23.3561382mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin66"]} pcbX="24.3561362mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin67"]} pcbX="25.3561342mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin68"]} pcbX="26.3561322mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin69"]} pcbX="27.3561302mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin70"]} pcbX="28.3561282mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin71"]} pcbX="29.3561262mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin72"]} pcbX="30.3561242mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin73"]} pcbX="31.3561222mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin74"]} pcbX="32.3561202mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin75"]} pcbX="33.3561182mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin76"]} pcbX="34.3561162mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin77"]} pcbX="35.3561142mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin78"]} pcbX="36.3561122mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin79"]} pcbX="37.3561102mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin80"]} pcbX="38.3561082mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin81"]} pcbX="39.3561062mm" pcbY="1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin82"]} pcbX="40.3561042mm" pcbY="3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin83"]} pcbX="39.3561062mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin84"]} pcbX="37.3561102mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin85"]} pcbX="35.3561142mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin86"]} pcbX="33.3561182mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin87"]} pcbX="31.3561222mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin88"]} pcbX="29.3561262mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin89"]} pcbX="27.3561302mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin90"]} pcbX="25.3561342mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin91"]} pcbX="23.3561382mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin92"]} pcbX="21.3561422mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin93"]} pcbX="19.3561462mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin94"]} pcbX="17.3561502mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin95"]} pcbX="15.3561542mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin96"]} pcbX="13.3561582mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin97"]} pcbX="11.3561622mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin98"]} pcbX="9.3561662mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin99"]} pcbX="7.3561702mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin100"]} pcbX="5.3559202mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin101"]} pcbX="3.3561782mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin102"]} pcbX="1.3561822mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin103"]} pcbX="-0.6440678mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin104"]} pcbX="-2.6440638mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin105"]} pcbX="-4.6440598mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin106"]} pcbX="-6.6440558mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin107"]} pcbX="-8.6440518mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin108"]} pcbX="-10.6440478mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin109"]} pcbX="-12.6440438mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin110"]} pcbX="-14.6440398mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin111"]} pcbX="-16.6440358mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin112"]} pcbX="-18.6440318mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin113"]} pcbX="-20.6440278mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin114"]} pcbX="-22.6440238mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin115"]} pcbX="-24.6440198mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin116"]} pcbX="-26.6440158mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin117"]} pcbX="-28.6440118mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin118"]} pcbX="-32.6440038mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin119"]} pcbX="-34.6439998mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin120"]} pcbX="-36.6439958mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin121"]} pcbX="-38.6439918mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin122"]} pcbX="-40.6439878mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin123"]} pcbX="-42.6439838mm" pcbY="-1.250061mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin124"]} pcbX="40.3561042mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin125"]} pcbX="38.3561082mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin126"]} pcbX="36.3561122mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin127"]} pcbX="34.3561162mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin128"]} pcbX="32.3561202mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin129"]} pcbX="30.3561242mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin130"]} pcbX="28.3561282mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin131"]} pcbX="26.3561322mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin132"]} pcbX="24.3561362mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin133"]} pcbX="22.3561402mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin134"]} pcbX="20.3561442mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin135"]} pcbX="18.3561482mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin136"]} pcbX="16.3561522mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin137"]} pcbX="14.3561562mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin138"]} pcbX="12.3561602mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin139"]} pcbX="10.3561642mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin140"]} pcbX="8.3561682mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin141"]} pcbX="6.3561722mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin142"]} pcbX="4.3561762mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin143"]} pcbX="2.3561802mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin144"]} pcbX="0.3561842mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin145"]} pcbX="-1.6438118mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin146"]} pcbX="-3.6438078mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin147"]} pcbX="-5.6438038mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin148"]} pcbX="-7.6437998mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin149"]} pcbX="-9.6437958mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin150"]} pcbX="-11.6437918mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin151"]} pcbX="-13.6437878mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin152"]} pcbX="-15.6437838mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin153"]} pcbX="-17.6437798mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin154"]} pcbX="-19.6437758mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin155"]} pcbX="-21.6437718mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin156"]} pcbX="-23.6437678mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin157"]} pcbX="-25.6437638mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin158"]} pcbX="-27.6437598mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin159"]} pcbX="-29.6437558mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin160"]} pcbX="-33.6437478mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin161"]} pcbX="-35.6437438mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin162"]} pcbX="-37.6439938mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin163"]} pcbX="-39.6439898mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<platedhole  portHints={["pin164"]} pcbX="-41.6439858mm" pcbY="-3.250057mm" outerDiameter="1.524mm" holeDiameter="0.9144mm" shape="circle" />
<silkscreenpath route={[{"x":43.35592040000006,"y":0.799236399999927},{"x":43.35592040000006,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":41.21378600000003,"y":-3.7500052000000323},{"x":43.35592040000006,"y":-3.7500052000000323},{"x":43.35592040000006,"y":-0.7995412000000215}]} />
<silkscreenpath route={[{"x":39.21379000000002,"y":-3.7500052000000323},{"x":39.49842239999998,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":37.21379400000001,"y":-3.7500052000000323},{"x":37.4984264000002,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":35.213925000000245,"y":-3.7500052000000323},{"x":35.49843040000019,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":33.213903600000094,"y":-3.7500052000000323},{"x":33.49843439999995,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":31.213907599999857,"y":-3.7500052000000323},{"x":31.498413000000028,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":29.213911600000074,"y":-3.7500052000000323},{"x":29.498417000000018,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":27.213915600000064,"y":-3.7500052000000323},{"x":27.498421000000008,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":25.21389420000014,"y":-3.7500052000000323},{"x":25.498425000000225,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":23.21389820000013,"y":-3.7500052000000323},{"x":23.498403600000074,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":21.21390220000012,"y":-3.7500052000000323},{"x":21.498407600000064,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":19.213906199999883,"y":-3.7500052000000323},{"x":19.498411600000054,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":17.2139102000001,"y":-3.7500052000000323},{"x":17.498415600000044,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":15.21388879999995,"y":-3.7500052000000323},{"x":15.49839420000012,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":13.21389279999994,"y":-3.7500052000000323},{"x":13.49839820000011,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":11.213896800000157,"y":-3.7500052000000323},{"x":11.4984022000001,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":9.21390079999992,"y":-3.7500052000000323},{"x":9.49840620000009,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":7.213879399999996,"y":-3.7500052000000323},{"x":7.49841020000008,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":5.213883399999986,"y":-3.7500052000000323},{"x":5.498388800000157,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":3.213887399999976,"y":-3.7500052000000323},{"x":3.498392800000147,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":1.2138914000001932,"y":-3.7500052000000323},{"x":1.4985238000001573,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-0.7861299999999574,"y":-3.7500052000000323},{"x":-0.501497599999766,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-2.78612599999974,"y":-3.7500052000000323},{"x":-2.501620600000024,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-4.786121999999978,"y":-3.7500052000000323},{"x":-4.501616600000034,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-6.786117999999988,"y":-3.7500052000000323},{"x":-6.501612599999817,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-8.78601239999989,"y":-3.7500052000000323},{"x":-8.501608599999827,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-10.786135399999921,"y":-3.7500052000000323},{"x":-10.501502999999957,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-12.786131399999931,"y":-3.7500052000000323},{"x":-12.501498999999967,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-14.786127399999941,"y":-3.7500052000000323},{"x":-14.501494999999977,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-16.786021799999844,"y":-3.7500052000000323},{"x":-16.501490999999987,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-18.78601780000008,"y":-3.7500052000000323},{"x":-18.50151239999991,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-20.786013799999864,"y":-3.7500052000000323},{"x":-20.50150839999992,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-22.786009799999874,"y":-3.7500052000000323},{"x":-22.50150439999993,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-24.786031199999798,"y":-3.7500052000000323},{"x":-24.501500399999713,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-26.786027199999808,"y":-3.7500052000000323},{"x":-26.501521799999864,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-28.786023200000045,"y":-3.7500052000000323},{"x":-28.501517799999874,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-32.78601519999984,"y":-3.7500052000000323},{"x":-30.501463000000058,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-34.786036599999875,"y":-3.7500052000000323},{"x":-34.50145499999985,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-36.78628660000004,"y":-3.7500052000000323},{"x":-36.50145100000009,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-38.78620639999997,"y":-3.7500052000000323},{"x":-38.501701000000025,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-40.78622779999989,"y":-3.7500052000000323},{"x":-40.50172239999995,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-42.50171839999996,"y":3.7500051999999187},{"x":-45.64385079999988,"y":3.7500051999999187},{"x":-45.64385079999988,"y":-3.7500052000000323},{"x":-42.50171839999996,"y":-3.7500052000000323}]} />
<silkscreenpath route={[{"x":-40.50172239999995,"y":3.7500051999999187},{"x":-40.78622779999989,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-38.501701000000025,"y":3.7500051999999187},{"x":-38.78620639999997,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-36.5017049999999,"y":3.7500051999999187},{"x":-36.78628660000004,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-34.50170899999989,"y":3.7500051999999187},{"x":-34.78626519999989,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-30.501767799999925,"y":3.7500051999999187},{"x":-32.78626919999988,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-28.501771799999915,"y":3.7500051999999187},{"x":-28.78627719999986,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-26.50175039999999,"y":3.7500051999999187},{"x":-26.786281200000076,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-24.50175439999998,"y":3.7500051999999187},{"x":-24.786259799999925,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-22.50175839999997,"y":3.7500051999999187},{"x":-22.786263799999915,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-20.501762399999734,"y":3.7500051999999187},{"x":-20.786267799999905,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-18.50174099999981,"y":3.7500051999999187},{"x":-18.786271799999895,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-16.501745000000028,"y":3.7500051999999187},{"x":-16.786377399999765,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-14.501749000000018,"y":3.7500051999999187},{"x":-14.786381399999755,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-12.50175299999978,"y":3.7500051999999187},{"x":-12.786385399999972,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-10.501858599999878,"y":3.7500051999999187},{"x":-10.786262399999941,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-8.501862599999868,"y":3.7500051999999187},{"x":-8.786368000000039,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-6.501866600000085,"y":3.7500051999999187},{"x":-6.7863720000000285,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-4.501870600000075,"y":3.7500051999999187},{"x":-4.786375999999791,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-2.501849199999924,"y":3.7500051999999187},{"x":-2.7862529999997605,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":-0.5017261999998937,"y":3.7500051999999187},{"x":-0.7863585999998577,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":1.498142800000096,"y":3.7500051999999187},{"x":1.2136374000001524,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":3.498138800000106,"y":3.7500051999999187},{"x":3.2136334000001625,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":5.498160200000029,"y":3.7500051999999187},{"x":5.213629399999945,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":7.4981562000000395,"y":3.7500051999999187},{"x":7.2136507999998685,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":9.498152200000277,"y":3.7500051999999187},{"x":9.213646800000106,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":11.498148200000287,"y":3.7500051999999187},{"x":11.213642800000116,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":13.49839820000011,"y":3.7500051999999187},{"x":13.213638800000126,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":15.49839420000012,"y":3.7500051999999187},{"x":15.21388879999995,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":17.498415600000044,"y":3.7500051999999187},{"x":17.2139102000001,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":19.498411600000054,"y":3.7500051999999187},{"x":19.213906199999883,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":21.498407600000064,"y":3.7500051999999187},{"x":21.21390220000012,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":23.498403600000074,"y":3.7500051999999187},{"x":23.21389820000013,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":25.498425000000225,"y":3.7500051999999187},{"x":25.21389420000014,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":27.498421000000008,"y":3.7500051999999187},{"x":27.213915600000064,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":29.498417000000018,"y":3.7500051999999187},{"x":29.213911600000074,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":31.498413000000028,"y":3.7500051999999187},{"x":31.213907599999857,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":33.49843439999995,"y":3.7500051999999187},{"x":33.213903600000094,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":35.49843040000019,"y":3.7500051999999187},{"x":35.213925000000245,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":37.4984264000002,"y":3.7500051999999187},{"x":37.21379400000001,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":39.49842239999998,"y":3.7500051999999187},{"x":39.21379000000002,"y":3.7500051999999187}]} />
<silkscreenpath route={[{"x":43.35592040000006,"y":3.7500051999999187},{"x":41.21378600000003,"y":3.7500051999999187}]} />
<silkscreentext text="A" pcbX="-45.1438518mm" pcbY="0.499999mm" anchorAlignment="bottom_left" fontSize="2.032mm" />
<silkscreentext text="B" pcbX="-45.1428358mm" pcbY="-2.049399mm" anchorAlignment="bottom_left" fontSize="2.032mm" />
<silkscreentext text="{NAME}" pcbX="-1.0086594mm" pcbY="5.2190924mm" anchorAlignment="center" fontSize="1mm" />
<courtyardoutline outline={[{"x":-45.6239503999999,"y":4.457865599999877},{"x":43.87587159999998,"y":4.457865599999877},{"x":43.87587159999998,"y":-4.842116799999985},{"x":-45.6239503999999,"y":-4.842116799999985},{"x":-45.6239503999999,"y":4.457865599999877}]} />
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C5711214.obj?uuid=be48e33b3d694127bfebd257efe405f9",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C5711214.step?uuid=be48e33b3d694127bfebd257efe405f9",
        pcbRotationOffset: 0,
        modelOriginPosition: { x: 0.8740393999999014, y: 0.19212560000005396, z: -0.9000090000000007 },
      }}
      {...props}
    />
  )
}
