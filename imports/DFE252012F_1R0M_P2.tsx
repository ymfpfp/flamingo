import type {InductorProps} from "@tscircuit/props";

// Murata J(E)TE243A-0017D-01, pages 1, 2 and 5. TI TPS62903 table 8-4.
// The automatically imported C435392 land pattern is oversized; use Murata's
// 2.8 mm overall span, 1.2 mm gap and 2.0 mm land height instead.
export const DFE252012F_1R0M_P2 = (props: Omit<InductorProps, "inductance">) => (
  <inductor
    inductance="1uH"
    maxCurrentRating="3.3A"
    manufacturerPartNumber="DFE252012F-1R0M=P2"
    supplierPartNumbers={{jlcpcb: ["C435392"]}}
    datasheetUrl="https://pim.murata.com/asset/pim4/inductor/J(E)TE243A-0017_PDF_INDUCTOR"
    footprint="smdpads2_p2mm_pw0.8mm_ph2mm_cyw3.2mm_cyh2.6mm_nosilkscreen"
    {...props}
  />
);
