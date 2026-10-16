import {CL05A225KO5NQNC} from "imports/CL05A225KO5NQNC";
import {CL21A106KAYNNNE} from "imports/CL21A106KAYNNNE";

// ASMedia ASM2464PDX_TI_R03, sheet 3: VCC18 supplies the VCCL balls.
// Keep the reference's values and quantities: 11*2.2uF + 3*10uF.
// The existing 22uF regulator output capacitor is additional, matching C78
// on reference sheet 4. Check TPS62903 stability with the combined bank.
// Selected MPNs and catalog footprints; final PCB placement remains pending.
const banks = [
  {refs: [2, 10, 17, 25, 29, 33, 37, 41, 43, 45, 46], Capacitor: CL05A225KO5NQNC},
  {refs: [5, 13, 20], Capacitor: CL21A106KAYNNNE},
] as const;

const capacitors = banks.flatMap(bank => bank.refs.map(ref => ({...bank, ref})));

export function BridgeVcclDecoupling() {
  return (
    <group name="VCCL_DECOUPLING" schY={-7}>
      <schematicsection name="VCCL_DECOUPLING"/>
      <schematictext text="VCCL Decoupling" schX={-1.5} schY={2.6} fontSize={0.3} anchor="left"/>
      {capacitors.map(({ref, Capacitor}, index) => (
        <Capacitor
          key={ref}
          name={`C_VCCL_${ref}`}
          schSectionName="VCCL_DECOUPLING"
          schX={index * 1.8}
          schY={0}
          schOrientation="vertical"
          connections={{pin1: "net.VCCL", pin2: "net.GND"}}
        />
      ))}
      <netlabel
        net="VCCL"
        connectsTo={capacitors.map(({ref}) => `C_VCCL_${ref}.pin1`)}
        schX={-1.2} schY={0.9} anchorSide="right"
      />
      <netlabel
        net="GND"
        connectsTo={capacitors.map(({ref}) => `C_VCCL_${ref}.pin2`)}
        schX={-1.2} schY={-0.9} anchorSide="right"
      />
      <schematictext
        text="ASMedia sheet 3, VCC18: 11 x 2.2uF + 3 x 10uF = 54.2uF. Selected ratings: 16V / 25V."
        schX={-1.5} schY={2} fontSize={0.2} anchor="left"
      />
      <schematictext
        text="Keep C_VCCL_COUT (22uF) at the buck: combined nominal total = 76.2uF."
        schX={-1.5} schY={-2} fontSize={0.18} anchor="left"
      />
      <schematictext
        text="Reference capacitor numbers retained. PCB placement and regulator compatibility pending."
        schX={-1.5} schY={-2.5} fontSize={0.18} anchor="left"
      />
    </group>
  );
}
