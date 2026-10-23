import {cloneElement} from "react";
import {AO4407A} from "./AO4407A";

/** Vishay Si4497DY, SO-8: sources 1-3, gate 4, drains 5-8.
 * Preserve the reviewed AO4407A lands, symbol and SO-8 package-body CAD proxy.
 * Electrical limits and ordering metadata belong to the Vishay part.
 * Datasheet: https://www.vishay.com/docs/65748/si4497dy.pdf
 */
export const SI4497DY_T1_GE3 = (props: Parameters<typeof AO4407A>[0]) =>
  cloneElement(AO4407A(props), {
    manufacturerPartNumber: "SI4497DY-T1-GE3",
    supplierPartNumbers: {jlcpcb: ["C143044"]},
    datasheetUrl: "https://www.vishay.com/docs/65748/si4497dy.pdf",
  });
