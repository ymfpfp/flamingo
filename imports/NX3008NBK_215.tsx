import {cloneElement} from "react";
import type {ChipProps} from "@tscircuit/props";
import {A_2N7002K_7} from "./A_2N7002K_7";

/** Same SOT-23 pinout and copper as the original driver: 1=G, 2=S, 3=D.
 * NX3008NBK datasheet, pages 2, 3 and 6: 30 V, +/-8 V, 2.8 ohm max at 1.8 V / 10 mA / 25 C.
 * Reuse the compact symbol and footprint, without the old part's branded CAD model.
 */
export const NX3008NBK_215 = (props: ChipProps<{pin1: ["G"]; pin2: ["S"]; pin3: ["D"]}>) =>
  cloneElement(A_2N7002K_7(props), {
    manufacturerPartNumber: "NX3008NBK,215",
    supplierPartNumbers: {jlcpcb: ["C179399"]},
    cadModel: undefined,
  });
