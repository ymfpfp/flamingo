import {CL05A225KO5NQNC} from "imports/CL05A225KO5NQNC";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import {CL21A106KAYNNNE} from "imports/CL21A106KAYNNNE";
import {bridgeDecouplingPlacement} from "lib/bridge-decoupling-placement";

// ASMedia ASM2464PDX_TI_R03, sheet 3: VDD095 supplies the VDD balls.
// Keep the reference's values and quantities on our 1.13V VDD rail.
// The existing 22uF regulator output capacitor is additional, matching C79
// on reference sheet 4. Check TPS62903 stability with the combined bank.
// Top-side placement follows the left edge of the VDD supply region.
const banks = [
  {refs: [1, 9, 15, 22, 24, 28, 32, 36, 40, 42, 44], Capacitor: CL05A225KO5NQNC},
  {refs: [4, 12, 18], Capacitor: CL21A106KAYNNNE},
  {refs: [26, 30, 34, 39], Capacitor: CL05B224KO5NNNC},
] as const;

const capacitors = banks.flatMap(bank => bank.refs.map(ref => ({...bank, ref})));
const rows = [capacitors.slice(0, 9), capacitors.slice(9)];

export function BridgeVddDecoupling() {
  return (
    <group name="VDD_DECOUPLING" schY={-7}>
      <schematictext text="VDD Decoupling" schX={0} schY={2.6} fontSize={0.18} anchor="center"/>
      {rows.map((row, rowIndex) => (
        <group key={rowIndex} schY={-rowIndex * 2.2} pcbX={0} pcbY={0} pcbRelative>
          {row.map(({ref, Capacitor}, index) => (
            <Capacitor
              key={ref}
              name={`C_VDD_${ref}`}
              {...bridgeDecouplingPlacement(`C_VDD_${ref}`)}
              schSectionName="VDD_DECOUPLING"
              schX={-7.8 + index * 1.8}
              schY={0}
              schOrientation="vertical"
              connections={{pin1: "net.VDD", pin2: "net.GND"}}
            />
          ))}
          <netlabel inline
            net="VDD"
            connectsTo={row.map(({ref}) => `C_VDD_${ref}.pin1`)}
          />
          <netlabel inline
            net="GND"
            connectsTo={row.map(({ref}) => `C_VDD_${ref}.pin2`)}
          />
        </group>
      ))}
      <schematictext
        text="ASMedia sheet 3, VDD095: 11 x 2.2uF + 3 x 10uF + 4 x 220nF = 55.08uF."
        schX={0} schY={2} fontSize={0.18} anchor="center"
      />
      <schematictext
        text="Keep both 10uF COUT capacitors at the buck: combined nominal total = 75.08uF."
        schX={0} schY={-4} fontSize={0.18} anchor="center"
      />
    </group>
  );
}
