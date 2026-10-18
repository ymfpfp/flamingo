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
    <group name="VCCL_DECOUPLING">
      <schematictext text="VCCL Decoupling" schX={0} schY={2.6} fontSize={0.18} anchor="center"/>
      {capacitors.map(({ref, Capacitor}, index) => (
        <Capacitor
          key={ref}
          name={`C_VCCL_${ref}`}
          schSectionName="VCCL_DECOUPLING"
          schX={-12.3 + index * 1.8}
          schY={0}
          schOrientation="vertical"
          connections={{pin1: "net.VCCL", pin2: "net.GND"}}
        />
      ))}
      <netlabel inline
        net="VCCL"
        connectsTo={capacitors.map(({ref}) => `C_VCCL_${ref}.pin1`)}
      />
      <netlabel inline
        net="GND"
        connectsTo={capacitors.map(({ref}) => `C_VCCL_${ref}.pin2`)}
      />
      <schematictext
        text="ASMedia sheet 3, VCC18: 11 x 2.2uF + 3 x 10uF = 54.2uF. Selected ratings: 16V / 25V."
        schX={0} schY={2} fontSize={0.18} anchor="center"
      />
      <schematictext
        text="Keep both 10uF COUT capacitors at the buck: combined nominal total = 74.2uF."
        schX={0} schY={-2} fontSize={0.18} anchor="center"
      />
    </group>
  );
}
