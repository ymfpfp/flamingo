import {CL05A225KO5NQNC} from "imports/CL05A225KO5NQNC";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import {CL21A106KAYNNNE} from "imports/CL21A106KAYNNNE";

// ASMedia ASM2464PDX_TI_R03, sheet 3: VCC33_SYS supplies the VCCH balls.
// Keep the reference's values and quantities: 4*2.2uF + 2*10uF + 4*220nF.
// Selected MPNs and catalog footprints; final PCB placement remains pending.
const banks = [
  {refs: [3, 11, 16, 19], Capacitor: CL05A225KO5NQNC},
  {refs: [6, 14], Capacitor: CL21A106KAYNNNE},
  {refs: [23, 27, 31, 35], Capacitor: CL05B224KO5NNNC},
] as const;

const capacitors = banks.flatMap(bank => bank.refs.map(ref => ({...bank, ref})));

export function BridgeVcchDecoupling() {
  return (
    <group name="VCCH_DECOUPLING">
      <schematictext text="VCCH Decoupling" schX={-1.5} schY={2.6} fontSize={0.18} anchor="left"/>
      {capacitors.map(({ref, Capacitor}, index) => (
        <Capacitor
          key={ref}
          name={`C_VCCH_${ref}`}
          schSectionName="VCCH_DECOUPLING"
          schX={index * 1.8}
          schY={0}
          schOrientation="vertical"
          connections={{pin1: "net.VCCH", pin2: "net.GND"}}
        />
      ))}
      <netlabel inline
        net="VCCH"
        connectsTo={capacitors.map(({ref}) => `C_VCCH_${ref}.pin1`)}
      />
      <netlabel inline
        net="GND"
        connectsTo={capacitors.map(({ref}) => `C_VCCH_${ref}.pin2`)}
      />
      <schematictext
        text="ASMedia sheet 3: 4 x 2.2uF + 2 x 10uF + 4 x 220nF = 29.68uF."
        schX={-1.5} schY={2} fontSize={0.18} anchor="left"
      />
    </group>
  );
}
