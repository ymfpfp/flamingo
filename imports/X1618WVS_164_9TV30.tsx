/** XKB PCIe 4.0 x16 SMT connector, 30 microinch gold, JLCPCB C21263101. */

import type { ChipProps } from "@tscircuit/props"

// PCI Express CEM 4.0, Table 37 (pp. 86-88):
// https://whycan.com/files/members/1761/PCIe_CEM_SPEC_R4_V9_12072018_NCB.pdf
// TX/RX are from the system-board perspective: PET = TX, PER = RX.
// The first alias is displayed in the schematic; the final alias is the contact ID.
// Logical IDs retain the existing circuit aliases. Physical pads map by A/B contact ID.
const pinLabels = {
  pin1: ["PRSNT1_N", "PRSNT1", "A1"],
  pin2: ["V12V", "12V_P", "A2"],
  pin3: ["V12V", "12V_P", "A3"],
  pin4: ["GND", "A4"],
  pin5: ["JTAG_TCK", "TCK", "JTAG2", "A5"],
  pin6: ["JTAG_TDI", "TDI", "JTAG3", "A6"],
  pin7: ["JTAG_TDO", "TDO", "JTAG4", "A7"],
  pin8: ["JTAG_TMS", "TMS", "JTAG5", "A8"],
  pin9: ["V3V3", "3V3_P", "A9"],
  pin10: ["V3V3", "3V3_P", "A10"],
  pin11: ["PERST_N", "PERST", "A11"],
  pin12: ["REFCLK_P", "A13"],
  pin13: ["GND", "A12"],
  pin14: ["REFCLK_N", "A14"],
  pin15: ["GND", "A15"],
  pin16: ["RX0_P", "PERp0", "A16"],
  pin17: ["RX0_N", "PERn0", "A17"],
  pin18: ["GND", "A18"],
  pin19: ["RSVD_A19", "A19"],
  pin20: ["GND", "A20"],
  pin21: ["RX1_P", "PERp1", "A21"],
  pin22: ["RX1_N", "PERn1", "A22"],
  pin23: ["GND", "A23"],
  pin24: ["GND", "A24"],
  pin25: ["RX2_P", "PERp2", "A25"],
  pin26: ["RX2_N", "PERn2", "A26"],
  pin27: ["GND", "A27"],
  pin28: ["GND", "A28"],
  pin29: ["RX3_P", "PERp3", "A29"],
  pin30: ["RX3_N", "PERn3", "A30"],
  pin31: ["GND", "A31"],
  pin32: ["RSVD_A32", "A32"],
  pin33: ["RSVD_A33", "A33"],
  pin34: ["GND", "A34"],
  pin35: ["RX4_P", "PERp4", "A35"],
  pin36: ["RX4_N", "PERn4", "A36"],
  pin37: ["GND", "A37"],
  pin38: ["GND", "A38"],
  pin39: ["RX5_P", "PERp5", "A39"],
  pin40: ["RX5_N", "PERn5", "A40"],
  pin41: ["GND", "A41"],
  pin42: ["GND", "A42"],
  pin43: ["RX6_P", "PERp6", "A43"],
  pin44: ["RX6_N", "PERn6", "A44"],
  pin45: ["GND", "A45"],
  pin46: ["GND", "A46"],
  pin47: ["RX7_P", "PERp7", "A47"],
  pin48: ["RX7_N", "PERn7", "A48"],
  pin49: ["GND", "A49"],
  pin50: ["RSVD_A50", "A50"],
  pin51: ["GND", "A51"],
  pin52: ["RX8_P", "PERp8", "A52"],
  pin53: ["RX8_N", "PERn8", "A53"],
  pin54: ["GND", "A54"],
  pin55: ["GND", "A55"],
  pin56: ["RX9_P", "PERp9", "A56"],
  pin57: ["RX9_N", "PERn9", "A57"],
  pin58: ["GND", "A58"],
  pin59: ["GND", "A59"],
  pin60: ["RX10_P", "PERp10", "A60"],
  pin61: ["RX10_N", "PERn10", "A61"],
  pin62: ["GND", "A62"],
  pin63: ["GND", "A63"],
  pin64: ["RX11_P", "PERp11", "A64"],
  pin65: ["RX11_N", "PERn11", "A65"],
  pin66: ["GND", "A66"],
  pin67: ["GND", "A67"],
  pin68: ["RX12_P", "PERp12", "A68"],
  pin69: ["RX12_N", "PERn12", "A69"],
  pin70: ["GND", "A70"],
  pin71: ["GND", "A71"],
  pin72: ["RX13_P", "PERp13", "A72"],
  pin73: ["RX13_N", "PERn13", "A73"],
  pin74: ["GND", "A74"],
  pin75: ["GND", "A75"],
  pin76: ["RX14_P", "PERp14", "A76"],
  pin77: ["RX14_N", "PERn14", "A77"],
  pin78: ["GND", "A78"],
  pin79: ["GND", "A79"],
  pin80: ["RX15_P", "PERp15", "A80"],
  pin81: ["RX15_N", "PERn15", "A81"],
  pin82: ["GND", "A82"],
  pin83: ["PRSNT2_X16_N", "PRSNT2_N", "B81"],
  pin84: ["TX15_N", "PETn15", "B79"],
  pin85: ["GND", "B77"],
  pin86: ["TX14_N", "PETn14", "B75"],
  pin87: ["GND", "B73"],
  pin88: ["TX13_N", "PETn13", "B71"],
  pin89: ["GND", "B69"],
  pin90: ["TX12_N", "PETn12", "B67"],
  pin91: ["GND", "B65"],
  pin92: ["TX11_N", "PETn11", "B63"],
  pin93: ["GND", "B61"],
  pin94: ["TX10_N", "PETn10", "B59"],
  pin95: ["GND", "B57"],
  pin96: ["TX9_N", "PETn9", "B55"],
  pin97: ["GND", "B53"],
  pin98: ["TX8_N", "PETn8", "B51"],
  pin99: ["GND", "B49"],
  pin100: ["GND", "B47"],
  pin101: ["TX7_P", "PETp7", "B45"],
  pin102: ["GND", "B43"],
  pin103: ["TX6_P", "PETp6", "B41"],
  pin104: ["GND", "B39"],
  pin105: ["TX5_P", "PETp5", "B37"],
  pin106: ["GND", "B35"],
  pin107: ["TX4_P", "PETp4", "B33"],
  pin108: ["PRSNT2_X4_N", "PRSNT2_N", "B31"],
  pin109: ["GND", "B29"],
  pin110: ["TX3_P", "PETp3", "B27"],
  pin111: ["GND", "B25"],
  pin112: ["TX2_P", "PETp2", "B23"],
  pin113: ["GND", "B21"],
  pin114: ["TX1_P", "PETp1", "B19"],
  pin115: ["PRSNT2_X1_N", "PRSNT2_N", "B17"],
  pin116: ["TX0_N", "PETn0", "B15"],
  pin117: ["GND", "B13"],
  pin118: ["WAKE_N", "WAKE", "B11"],
  pin119: ["JTAG_TRST_N", "TRST_N", "JTAG1", "B9"],
  pin120: ["GND", "B7"],
  pin121: ["SMB_CLK", "SMBCLK", "B5"],
  pin122: ["V12V", "12V_P", "B3"],
  pin123: ["V12V", "12V_P", "B1"],
  pin124: ["RSVD_B82", "B82"],
  pin125: ["GND", "B80"],
  pin126: ["TX15_P", "PETp15", "B78"],
  pin127: ["GND", "B76"],
  pin128: ["TX14_P", "PETp14", "B74"],
  pin129: ["GND", "B72"],
  pin130: ["TX13_P", "PETp13", "B70"],
  pin131: ["GND", "B68"],
  pin132: ["TX12_P", "PETp12", "B66"],
  pin133: ["GND", "B64"],
  pin134: ["TX11_P", "PETp11", "B62"],
  pin135: ["GND", "B60"],
  pin136: ["TX10_P", "PETp10", "B58"],
  pin137: ["GND", "B56"],
  pin138: ["TX9_P", "PETp9", "B54"],
  pin139: ["GND", "B52"],
  pin140: ["TX8_P", "PETp8", "B50"],
  pin141: ["PRSNT2_X8_N", "PRSNT2_N", "B48"],
  pin142: ["TX7_N", "PETn7", "B46"],
  pin143: ["GND", "B44"],
  pin144: ["TX6_N", "PETn6", "B42"],
  pin145: ["GND", "B40"],
  pin146: ["TX5_N", "PETn5", "B38"],
  pin147: ["GND", "B36"],
  pin148: ["TX4_N", "PETn4", "B34"],
  pin149: ["GND", "B32"],
  pin150: ["PWRBRK_N", "PWRBRK", "B30"],
  pin151: ["TX3_N", "PETn3", "B28"],
  pin152: ["GND", "B26"],
  pin153: ["TX2_N", "PETn2", "B24"],
  pin154: ["GND", "B22"],
  pin155: ["TX1_N", "PETn1", "B20"],
  pin156: ["GND", "B18"],
  pin157: ["GND", "B16"],
  pin158: ["TX0_P", "PETp0", "B14"],
  pin159: ["CLKREQ_N", "CLKREQ", "B12"],
  pin160: ["V3V3_AUX", "3V3_AUX_P", "B10"],
  pin161: ["V3V3", "3V3_P", "B8"],
  pin162: ["SMB_DATA", "SMBDAT", "B6"],
  pin163: ["GND", "B4"],
  pin164: ["V12V", "12V_P", "B2"],
} as const

// Display one schematic pin per supply, while retaining every physical contact.
const powerPins = new Set<string>(["GND", "V12V", "V3V3", "V3V3_AUX"])
const getSignalPins = (side: "A" | "B") => Object.values(pinLabels)
  .filter(labels => !powerPins.has(labels[0]) && labels[labels.length - 1].startsWith(side))
  .sort((a, b) => Number(a[a.length - 1].slice(1)) - Number(b[b.length - 1].slice(1)))
  .map(labels => labels[0])

// Geometry imported from C21263100 (same X1618WVS family, V15 plating).
// The C21263101 drawing specifies the same footprint for V15 and V30.
// Page 2: 0.70 x 2.00 mm lands, 1.00 mm pitch, 7.20 mm row spacing,
// two 1.20 mm locating holes 73.15 mm apart, and two 3.00 x 5.00 mm hold-down lands.
// Hold-down lands are mechanical and have no signal port. No old through-hole model is reused.
export const Footprint = () => (
  <footprint>
    <hole pcbX="-29.849953mm" pcbY="0mm" diameter="1.1999976mm" />
    <hole pcbX="43.300015mm" pcbY="0mm" diameter="1.1999976mm" />
    <smtpad layer="top" pcbX="-44.499911mm" pcbY="0mm" width="2.999994mm" height="4.99999mm" shape="rect" />
    <smtpad layer="top" portHints={["pin99", "B49"]} pcbX="8.499983mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin141", "B48"]} pcbX="7.499985mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin100", "B47"]} pcbX="6.499987mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin142", "B46"]} pcbX="5.499989mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin101", "B45"]} pcbX="4.499991mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin143", "B44"]} pcbX="3.499993mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin102", "B43"]} pcbX="2.499995mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin144", "B42"]} pcbX="1.499997mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin103", "B41"]} pcbX="0.499999mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin145", "B40"]} pcbX="-0.499999mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin104", "B39"]} pcbX="-1.499997mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin146", "B38"]} pcbX="-2.499995mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin105", "B37"]} pcbX="-3.499993mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin147", "B36"]} pcbX="-4.499991mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin106", "B35"]} pcbX="-5.499989mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin148", "B34"]} pcbX="-6.499987mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin107", "B33"]} pcbX="-7.499985mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin149", "B32"]} pcbX="-8.499983mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin108", "B31"]} pcbX="-9.499981mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin150", "B30"]} pcbX="-10.499979mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin109", "B29"]} pcbX="-11.499977mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin151", "B28"]} pcbX="-12.499975mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin110", "B27"]} pcbX="-13.499973mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin152", "B26"]} pcbX="-14.499971mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin111", "B25"]} pcbX="-15.499969mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin153", "B24"]} pcbX="-16.499967mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin112", "B23"]} pcbX="-17.499965mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin154", "B22"]} pcbX="-18.499963mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin113", "B21"]} pcbX="-19.499961mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin155", "B20"]} pcbX="-20.499959mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin114", "B19"]} pcbX="-21.499957mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin156", "B18"]} pcbX="-22.499955mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin115", "B17"]} pcbX="-23.499953mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin157", "B16"]} pcbX="-24.499951mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin116", "B15"]} pcbX="-25.499949mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin158", "B14"]} pcbX="-26.499947mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin117", "B13"]} pcbX="-27.499945mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin159", "B12"]} pcbX="-28.499943mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin118", "B11"]} pcbX="-31.499937mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin160", "B10"]} pcbX="-32.499935mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin119", "B9"]} pcbX="-33.499933mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin161", "B8"]} pcbX="-34.499931mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin120", "B7"]} pcbX="-35.499929mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin162", "B6"]} pcbX="-36.499927mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin121", "B5"]} pcbX="-37.499925mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin163", "B4"]} pcbX="-38.499923mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin122", "B3"]} pcbX="-39.499921mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin164", "B2"]} pcbX="-40.499919mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin123", "B1"]} pcbX="-41.499917mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin49", "A49"]} pcbX="8.499983mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin48", "A48"]} pcbX="7.499985mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin47", "A47"]} pcbX="6.499987mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin46", "A46"]} pcbX="5.499989mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin45", "A45"]} pcbX="4.499991mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin44", "A44"]} pcbX="3.499993mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin43", "A43"]} pcbX="2.499995mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin42", "A42"]} pcbX="1.499997mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin41", "A41"]} pcbX="0.499999mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin40", "A40"]} pcbX="-0.499999mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin39", "A39"]} pcbX="-1.499997mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin38", "A38"]} pcbX="-2.499995mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin37", "A37"]} pcbX="-3.499993mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin36", "A36"]} pcbX="-4.499991mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin35", "A35"]} pcbX="-5.499989mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin34", "A34"]} pcbX="-6.499987mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin33", "A33"]} pcbX="-7.499985mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin32", "A32"]} pcbX="-8.499983mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin31", "A31"]} pcbX="-9.499981mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin30", "A30"]} pcbX="-10.499979mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin29", "A29"]} pcbX="-11.499977mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin28", "A28"]} pcbX="-12.499975mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin27", "A27"]} pcbX="-13.499973mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin26", "A26"]} pcbX="-14.499971mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin25", "A25"]} pcbX="-15.499969mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin24", "A24"]} pcbX="-16.499967mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin23", "A23"]} pcbX="-17.499965mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin22", "A22"]} pcbX="-18.499963mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin21", "A21"]} pcbX="-19.499961mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin20", "A20"]} pcbX="-20.499959mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin19", "A19"]} pcbX="-21.499957mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin18", "A18"]} pcbX="-22.499955mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin17", "A17"]} pcbX="-23.499953mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin16", "A16"]} pcbX="-24.499951mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin15", "A15"]} pcbX="-25.499949mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin14", "A14"]} pcbX="-26.499947mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin12", "A13"]} pcbX="-27.499945mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin13", "A12"]} pcbX="-28.499943mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin11", "A11"]} pcbX="-31.499937mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin10", "A10"]} pcbX="-32.499935mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin9", "A9"]} pcbX="-33.499933mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin8", "A8"]} pcbX="-34.499931mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin7", "A7"]} pcbX="-35.499929mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin6", "A6"]} pcbX="-36.499927mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin5", "A5"]} pcbX="-37.499925mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin4", "A4"]} pcbX="-38.499923mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin3", "A3"]} pcbX="-39.499921mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin2", "A2"]} pcbX="-40.499919mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin1", "A1"]} pcbX="-41.499917mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin140", "B50"]} pcbX="9.499981mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin98", "B51"]} pcbX="10.499979mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin139", "B52"]} pcbX="11.499977mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin97", "B53"]} pcbX="12.499975mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin138", "B54"]} pcbX="13.499973mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin96", "B55"]} pcbX="14.499971mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin137", "B56"]} pcbX="15.499969mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin95", "B57"]} pcbX="16.499967mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin50", "A50"]} pcbX="9.499981mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin51", "A51"]} pcbX="10.499979mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin52", "A52"]} pcbX="11.499977mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin53", "A53"]} pcbX="12.499975mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin54", "A54"]} pcbX="13.499973mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin55", "A55"]} pcbX="14.499971mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin56", "A56"]} pcbX="15.499969mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin57", "A57"]} pcbX="16.499967mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin136", "B58"]} pcbX="17.499965mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin94", "B59"]} pcbX="18.499963mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin135", "B60"]} pcbX="19.499961mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin93", "B61"]} pcbX="20.499959mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin134", "B62"]} pcbX="21.499957mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin92", "B63"]} pcbX="22.499955mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin133", "B64"]} pcbX="23.499953mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin91", "B65"]} pcbX="24.499951mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin132", "B66"]} pcbX="25.499949mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin90", "B67"]} pcbX="26.499947mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin131", "B68"]} pcbX="27.499945mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin89", "B69"]} pcbX="28.499943mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin130", "B70"]} pcbX="29.499941mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin88", "B71"]} pcbX="30.499939mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin129", "B72"]} pcbX="31.499937mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin87", "B73"]} pcbX="32.499935mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin128", "B74"]} pcbX="33.499933mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin86", "B75"]} pcbX="34.499931mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin127", "B76"]} pcbX="35.499929mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin85", "B77"]} pcbX="36.499927mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin126", "B78"]} pcbX="37.499925mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin84", "B79"]} pcbX="38.499923mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin125", "B80"]} pcbX="39.499921mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin83", "B81"]} pcbX="40.499919mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin124", "B82"]} pcbX="41.499917mm" pcbY="-3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin58", "A58"]} pcbX="17.499965mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin59", "A59"]} pcbX="18.499963mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin60", "A60"]} pcbX="19.499961mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin61", "A61"]} pcbX="20.499959mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin62", "A62"]} pcbX="21.499957mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin63", "A63"]} pcbX="22.499955mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin64", "A64"]} pcbX="23.499953mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin65", "A65"]} pcbX="24.499951mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin66", "A66"]} pcbX="25.499949mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin67", "A67"]} pcbX="26.499947mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin68", "A68"]} pcbX="27.499945mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin69", "A69"]} pcbX="28.499943mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin70", "A70"]} pcbX="29.499941mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin71", "A71"]} pcbX="30.499939mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin72", "A72"]} pcbX="31.499937mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin73", "A73"]} pcbX="32.499935mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin74", "A74"]} pcbX="33.499933mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin75", "A75"]} pcbX="34.499931mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin76", "A76"]} pcbX="35.499929mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin77", "A77"]} pcbX="36.499927mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin78", "A78"]} pcbX="37.499925mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin79", "A79"]} pcbX="38.499923mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin80", "A80"]} pcbX="39.499921mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin81", "A81"]} pcbX="40.499919mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" portHints={["pin82", "A82"]} pcbX="41.499917mm" pcbY="3.599942mm" width="0.6999986mm" height="1.999996mm" shape="rect" />
    <smtpad layer="top" pcbX="44.499911mm" pcbY="0mm" width="2.999994mm" height="4.99999mm" shape="rect" />
    <silkscreenpath route={[{"x":38.48762940000006,"y":-5.099939000000177},{"x":44.49991100000034,"y":-5.099939000000177}]} />
    <silkscreenpath route={[{"x":44.49991100000034,"y":-3.7000180000001137},{"x":42.08109440000021,"y":-3.7000180000001137}]} />
    <silkscreenpath route={[{"x":44.49991100000034,"y":-2.7310842000001685},{"x":44.49991100000034,"y":-3.7000180000001137}]} />
    <silkscreenpath route={[{"x":44.49991100000034,"y":3.6999671999999464},{"x":44.49991100000034,"y":2.731084199999941}]} />
    <silkscreenpath route={[{"x":42.08109440000021,"y":3.6999671999999464},{"x":44.49991100000034,"y":3.6999671999999464}]} />
    <silkscreenpath route={[{"x":44.49991100000034,"y":-3.7000180000001137},{"x":44.49991100000034,"y":-5.099939000000177}]} />
    <silkscreenpath route={[{"x":38.46951920000015,"y":-5.099964399999976},{"x":38.46951920000015,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":32.39488060000008,"y":-5.099939000000177},{"x":32.39488060000008,"y":-4.831232399999976}]} />
    <silkscreenpath route={[{"x":26.328268400000297,"y":-5.099939000000177},{"x":26.328268400000297,"y":-4.831181600000036}]} />
    <silkscreenpath route={[{"x":26.346378600000207,"y":-5.099939000000177},{"x":32.358558599999924,"y":-5.099939000000177}]} />
    <silkscreenpath route={[{"x":25.39489460000027,"y":-5.099939000000177},{"x":25.39489460000027,"y":-4.831232399999976}]} />
    <silkscreenpath route={[{"x":19.328282400000035,"y":-5.099939000000177},{"x":19.328282400000035,"y":-4.831181600000036}]} />
    <silkscreenpath route={[{"x":19.3463926000004,"y":-5.099939000000177},{"x":25.358572600000343,"y":-5.099939000000177}]} />
    <silkscreenpath route={[{"x":18.394908600000235,"y":-5.099939000000177},{"x":18.394908600000235,"y":-4.831232399999976}]} />
    <silkscreenpath route={[{"x":12.3282964,"y":-5.099939000000177},{"x":12.3282964,"y":-4.831181600000036}]} />
    <silkscreenpath route={[{"x":12.346406600000364,"y":-5.099939000000177},{"x":18.358586600000308,"y":-5.099939000000177}]} />
    <silkscreenpath route={[{"x":11.3949226000002,"y":-5.099939000000177},{"x":11.3949226000002,"y":-4.831232399999976}]} />
    <silkscreenpath route={[{"x":5.328310400000191,"y":-5.099939000000177},{"x":5.328310400000191,"y":-4.831181600000036}]} />
    <silkscreenpath route={[{"x":5.346420600000101,"y":-5.099939000000177},{"x":11.358600600000045,"y":-5.099939000000177}]} />
    <silkscreenpath route={[{"x":4.394936600000165,"y":-5.099964399999976},{"x":4.394936600000165,"y":-4.831207000000063}]} />
    <silkscreenpath route={[{"x":-1.671675599999844,"y":-5.099964399999976},{"x":-1.671675599999844,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-1.653565399999934,"y":-5.099964399999976},{"x":4.358589200000097,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-2.971063399999821,"y":-5.099964399999976},{"x":-2.971063399999821,"y":-4.831207000000063}]} />
    <silkscreenpath route={[{"x":-9.037751799999569,"y":-5.099964399999976},{"x":-9.037751799999569,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-9.01956539999992,"y":-5.099964399999976},{"x":-3.0074107999998887,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-10.1545643999998,"y":-5.099964399999976},{"x":-10.1545643999998,"y":-4.831207000000063}]} />
    <silkscreenpath route={[{"x":-16.221252800000002,"y":-5.099964399999976},{"x":-16.221252800000002,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-16.203066399999898,"y":-5.099964399999976},{"x":-10.190860999999813,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-17.16498979999983,"y":-5.099964399999976},{"x":-17.16498979999983,"y":-4.831207000000063}]} />
    <silkscreenpath route={[{"x":-23.23160199999984,"y":-5.099964399999976},{"x":-23.23160199999984,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-23.2134917999997,"y":-5.099964399999976},{"x":-17.201286399999844,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-24.378564399999732,"y":-5.099964399999976},{"x":-24.378564399999732,"y":-4.831207000000063}]} />
    <silkscreenpath route={[{"x":-30.44525279999982,"y":-5.099964399999976},{"x":-30.44525279999982,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-30.427066399999717,"y":-5.099964399999976},{"x":-24.414860999999974,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-37.52128639999978,"y":-5.099964399999976},{"x":-31.509055599999783,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-37.53937119999989,"y":-5.099964399999976},{"x":-37.53937119999989,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-31.472784399999796,"y":-5.099964399999976},{"x":-31.472784399999796,"y":-4.831207000000063}]} />
    <silkscreenpath route={[{"x":-44.49988559999974,"y":-5.099964399999976},{"x":-38.487654799999746,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-38.45138359999976,"y":-5.099964399999976},{"x":-38.45138359999976,"y":-4.831156200000123}]} />
    <silkscreenpath route={[{"x":-44.49988559999974,"y":-3.699992600000087},{"x":-44.49988559999974,"y":-5.099964399999976}]} />
    <silkscreenpath route={[{"x":-44.49988559999974,"y":-3.699992600000087},{"x":-44.49988559999974,"y":-2.731109599999968}]} />
    <silkscreenpath route={[{"x":-42.08106899999984,"y":-3.699992600000087},{"x":-44.49988559999974,"y":-3.699992600000087}]} />
    <silkscreenpath route={[{"x":-29.081044199999837,"y":-3.699992600000087},{"x":-30.918759599999817,"y":-3.699992600000087}]} />
    <silkscreenpath route={[{"x":-30.918759599999817,"y":3.699992599999973},{"x":-29.081044199999837,"y":3.699992599999973}]} />
    <silkscreenpath route={[{"x":-44.49988559999974,"y":3.699992599999973},{"x":-42.08106899999984,"y":3.699992599999973}]} />
    <silkscreenpath route={[{"x":-44.49988559999974,"y":2.731109599999968},{"x":-44.49988559999974,"y":3.699992599999973}]} />
    <silkscreentext text="{NAME}" pcbX="-0.0085344mm" pcbY="5.607814mm" anchorAlignment="center" fontSize="1mm" />
    <courtyardoutline outline={[{"x":-46.25793439999984,"y":4.857813999999962},{"x":46.240865600000234,"y":4.857813999999962},{"x":46.240865600000234,"y":-5.344986000000063},{"x":-46.25793439999984,"y":-5.344986000000063},{"x":-46.25793439999984,"y":4.857813999999962}]} />
  </footprint>
)

export const X1618WVS_164_9TV30 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      schWidth="3.2mm"
      schPinArrangement={{
        leftSide: {direction: "top-to-bottom", pins: getSignalPins("A")},
        rightSide: {direction: "top-to-bottom", pins: getSignalPins("B")},
        topSide: {direction: "left-to-right", pins: ["V12V", "V3V3", "V3V3_AUX"]},
        bottomSide: {direction: "left-to-right", pins: ["GND"]},
      }}
      supplierPartNumbers={{jlcpcb: ["C21263101"]}}
      manufacturerPartNumber="X1618WVS-164-9TV30"
      footprint={<Footprint />}
      {...props}
    />
  )
}
