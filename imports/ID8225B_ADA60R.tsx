import type {ChipProps} from "@tscircuit/props";

// ASMedia ASM2464PDX_TI_R03, sheet 4, U6 supplies this physical pin map.
// iDESYN Rev 0.4 identifies A60 as SOT-23-6. The public two-page document
// omits electrical accuracy limits and package dimensions. Vendor confirmation
// of this standard package footprint and procurement remains open.
const pinLabels = {
  pin1: ["EN"], pin2: ["GND"], pin3: ["SW"],
  pin4: ["VIN"], pin5: ["PG"], pin6: ["FB"],
} as const;

export const ID8225B_ADA60R = (props: ChipProps<typeof pinLabels>) => (
  <chip
    pinLabels={pinLabels}
    pinAttributes={{pin2: {requiresGround: true}, pin4: {requiresPower: true}}}
    manufacturerPartNumber="ID8225B-ADA60R"
    datasheetUrl="https://idesyn.com/wp-content/uploads/2024/01/iD8225B-V0.4.pdf"
    footprint="sot23_6"
    {...props}
  />
);
