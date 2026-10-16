import {CL05A225KO5NQNC} from "imports/CL05A225KO5NQNC";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import {CL21A106KAYNNNE} from "imports/CL21A106KAYNNNE";

// ASMedia ASM2464PDX_TI_R03, sheet 3: VDD095 supplies the VDD balls.
// Keep the reference's values and quantities on our 1.13V VDD rail.
// The existing 22uF regulator output capacitor is additional, matching C79
// on reference sheet 4. Check TPS62903 stability with the combined bank.
// Selected MPNs and catalog footprints; final PCB placement remains pending.
const banks = [
  {refs: [1, 9, 15, 22, 24, 28, 32, 36, 40, 42, 44], Capacitor: CL05A225KO5NQNC},
  {refs: [4, 12, 18], Capacitor: CL21A106KAYNNNE},
  {refs: [26, 30, 34, 39], Capacitor: CL05B224KO5NNNC},
] as const;

const capacitors = banks.flatMap(bank => bank.refs.map(ref => ({...bank, ref})));
const rows = [capacitors.slice(0, 9), capacitors.slice(9)];

export function BridgeVddDecoupling() {
  return (
    <group name="VDD_DECOUPLING" schY={-13}>
      <schematicsection name="VDD_DECOUPLING"/>
      <schematictext text="VDD Decoupling" schX={-1.5} schY={2.6} fontSize={0.3} anchor="left"/>
      {rows.map((row, rowIndex) => (
        <group key={rowIndex} schY={-rowIndex * 1.5}>
          {row.map(({ref, Capacitor}, index) => (
            <Capacitor
              key={ref}
              name={`C_VDD_${ref}`}
              schSectionName="VDD_DECOUPLING"
              schX={index * 1.8}
              schY={0}
              schOrientation="vertical"
              connections={{pin1: "net.VDD", pin2: "net.GND"}}
            />
          ))}
          <netlabel
            net="VDD"
            connectsTo={row.map(({ref}) => `C_VDD_${ref}.pin1`)}
            schX={-1.2} schY={0.6} anchorSide="right"
          />
          <netlabel
            net="GND"
            connectsTo={row.map(({ref}) => `C_VDD_${ref}.pin2`)}
            schX={-1.2} schY={-0.6} anchorSide="right"
          />
        </group>
      ))}
      <schematictext
        text="ASMedia sheet 3, VDD095: 11 x 2.2uF + 3 x 10uF + 4 x 220nF = 55.08uF."
        schX={-1.5} schY={2} fontSize={0.2} anchor="left"
      />
      <schematictext
        text="Keep C_VDD_COUT (22uF) at the buck: combined nominal total = 77.08uF."
        schX={-1.5} schY={-3.5} fontSize={0.18} anchor="left"
      />
      <schematictext
        text="Reference capacitor numbers retained. PCB placement and regulator compatibility pending."
        schX={-1.5} schY={-4} fontSize={0.18} anchor="left"
      />
    </group>
  );
}
