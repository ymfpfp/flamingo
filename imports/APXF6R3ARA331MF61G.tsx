import type {CapacitorProps} from "@tscircuit/props";
import {ChemiConF61F80Footprint} from "./ChemiConF61F80Footprint";
import capacitorBody from "../models/CP_Elec_6.3x5.8.glb";

/** Chemi-Con PXF F61: 330 uF, 6.3 V, 10 mOhm max ESR,
 * 3.9 A ripple at 105 C / 100 kHz; 15000 h endurance at 105 C.
 * Source: datasheets/APXF6R3ARA331MF61G.pdf, pages 1-2.
 */
export function APXF6R3ARA331MF61G(props: Omit<CapacitorProps, "capacitance">) {
  return <capacitor
    capacitance="330uF" maxVoltageRating="6.3V" polarized
    manufacturerPartNumber="APXF6R3ARA331MF61G"
    supplierPartNumbers={{jlcpcb: ["C133476"]}}
    datasheetUrl="https://www.chemi-con.co.jp/en/products/detail-condenser.php?part_number=APXF6R3ARA331MF61G"
    footprint={<ChemiConF61F80Footprint/>}
    cadModel={{
      glbUrl: capacitorBody, modelBoardNormalDirection: "y+",
      modelOriginPosition: {x: 0, y: 0, z: 0},
      modelBounds: {
        min: {x: -3.8989, y: 0, z: -3.29946},
        max: {x: 3.8989, y: 5.79882, z: 3.29946},
      },
    }}
    {...props}
  />;
}
