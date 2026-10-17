import {Fragment} from "react";
import {AO4407A} from "imports/AO4407A";
import {DMP2008UFG_7} from "imports/DMP2008UFG_7";
import {A_2N7002K_7} from "imports/A_2N7002K_7";
import {A_0402WGF1001TCE} from "imports/A_0402WGF1001TCE";
import {A_0402WGF1003TCE} from "imports/A_0402WGF1003TCE";
import {A_0402WGF5100TCE} from "imports/A_0402WGF5100TCE";
import {RC1206FR_071KL} from "imports/RC1206FR_071KL";
import {CL31B106KAHNNNE} from "imports/CL31B106KAHNNNE";

const rails = [
  {suffix: "3V3", input: "VCCH", output: "SLOT_3V3", y: 4},
  {suffix: "12V", input: "V12V", output: "SLOT_12V", y: -3},
] as const;

// Source and drain each have several internally connected package terminals.
// Show one port per electrical terminal while preserving every physical pad.
function PowerMosfetSymbol() {
  const paths = [
    [{x: -0.4, y: 0}, {x: -0.24, y: 0}],
    [{x: -0.24, y: -0.2}, {x: -0.24, y: 0.2}],
    [{x: -0.2, y: -0.2}, {x: -0.2, y: -0.12}],
    [{x: -0.2, y: -0.04}, {x: -0.2, y: 0.04}],
    [{x: -0.2, y: 0.12}, {x: -0.2, y: 0.2}],
    [{x: -0.2, y: -0.2}, {x: 0.2, y: -0.2}, {x: 0.2, y: -0.4}],
    [{x: -0.2, y: 0.2}, {x: 0.2, y: 0.2}, {x: 0.2, y: 0.4}],
    [{x: -0.2, y: 0}, {x: 0.2, y: 0}, {x: 0.2, y: -0.2}],
    [{x: 0, y: 0}, {x: -0.12, y: 0.06}, {x: -0.12, y: -0.06}, {x: 0, y: 0}],
  ];
  return (
    <symbol>
      <port name="pin1" pinNumber={1} aliases={["S", "S1", "S2", "S3"]} direction="left" schX={-0.6} schY={0.2} schStemLength={0.2}/>
      <port name="pin4" pinNumber={4} aliases={["G"]} direction="down" schX={0} schY={-0.6} schStemLength={0.2}/>
      <port name="pin5" pinNumber={5} aliases={["D", "D1", "D2", "D3", "D4"]} direction="right" schX={0.6} schY={0.2} schStemLength={0.2}/>
      {paths.map((points, index) => (
        <Fragment key={index}>
          <schematicpath
            points={points.map(({x, y}) => ({x: y, y: x}))}
            strokeColor="#880000"
            isFilled={index === paths.length - 1}
            fillColor="#880000"
          />
        </Fragment>
      ))}
      <schematictext text="{NAME}" schX={0} schY={0.9} fontSize={0.2} anchor="bottom_center"/>
    </symbol>
  );
}

/** ASMedia reference sheet 6, with both main-rail switches populated. */
export function SlotPower() {
  return (
    <subcircuit
      name="SLOT_POWER" schX={3.2} schY={0}
      schTraceAutoLabelEnabled={false} schMaxTraceDistance={12}
      exposedNets={["VCCH", "V12V", "SLOT_3V3", "SLOT_12V", "ASM_HDDPC", "GND"]}
    >
      {["VCCH", "V12V", "SLOT_3V3", "SLOT_12V", "ASM_HDDPC", "GND"].map(name => (
        <Fragment key={name}><net name={name}/></Fragment>
      ))}
      {/* Match the sheet's fixed dividers so each function has its own area. */}
      {[-0.2, -7.2].map(y => (
        <Fragment key={y}>
          <schematicline x1={-1.7} y1={y} x2={12.75} y2={y}
            strokeWidth={0.02} color="#000000" isDashed/>
        </Fragment>
      ))}
      {rails.map(({suffix, input, output, y}) => {
        const power = `Q_SLOT_${suffix}`;
        const driver = `Q_SLOT_DRV_${suffix}`;
        const series = `R_SLOT_GATE_${suffix}`;
        const off = `R_SLOT_OFF_${suffix}`;
        const cap = `C_SLOT_GATE_${suffix}`;
        const discharge = `R_SLOT_DISCHARGE_${suffix}`;
        const section = `SLOT_POWER_${suffix}`;
        const commonPowerProps = {
          name: power,
          schSectionName: section,
          schX: 8,
          schY: y,
          symbol: <PowerMosfetSymbol/>,
          connections: {pin1: `net.${input}`, pin5: `net.${output}`},
        };
        return (
          <Fragment key={suffix}>
            <schematictext text={`${suffix === "3V3" ? "3.3 V" : "12 V"} slot power`}
              schX={-1.5} schY={y + (suffix === "3V3" ? 3.36 : 2.6)} fontSize={0.18} anchor="top_left"/>
            {suffix === "3V3" ? (
              <DMP2008UFG_7 {...commonPowerProps} internallyConnectedPins={[["pin1", "pin2", "pin3"]]}/>
            ) : (
              <AO4407A {...commonPowerProps} internallyConnectedPins={[["pin1", "pin2", "pin3"], ["pin5", "pin6", "pin7", "pin8"]]}/>
            )}
            <A_2N7002K_7 name={driver} schSectionName={section} schX={1} schY={y - 2.8}
              connections={{G: "net.ASM_HDDPC", S: "net.GND"}}/>
            <A_0402WGF5100TCE name={series} schSectionName={section} schX={3.5} schY={y - 2.8}/>
            <A_0402WGF1003TCE name={off} schSectionName={section} schX={3.5} schY={y - 1.4} schOrientation="vertical"/>
            {/* Reference nominal value; verify startup current and MOSFET SOA with the card load. */}
            <CL31B106KAHNNNE name={cap} schSectionName={section} schX={6} schY={y - 1.4} schOrientation="vertical"/>
            <RC1206FR_071KL name={discharge} schSectionName={section} schX={9.8} schY={y - 1.4} schOrientation="vertical"/>
            <trace from={`.${power} > .pin1`} to={`.${off} > .pin1`}/>
            <trace from={`.${power} > .pin1`} to={`.${cap} > .pin1`}/>
            <trace from={`.${power} > .pin4`} to={`.${off} > .pin2`}/>
            <trace from={`.${power} > .pin4`} to={`.${cap} > .pin2`}/>
            <trace from={`.${power} > .pin4`} to={`.${series} > .pin2`}/>
            <trace from={`.${series} > .pin1`} to={`.${driver} > .D`}/>
            <trace from={`.${power} > .pin5`} to={`.${discharge} > .pin1`}/>
            <netlabel inline net="ASM_HDDPC" connection={`${driver}.G`}/>
            <netlabel inline net={input} connection={`${power}.pin1`}/>
            <netlabel inline net={output} connection={`${power}.pin5`}/>
            <netlabel inline net="GND" connection={`${driver}.S`}/>
            <netlabel inline net="GND" connection={`${discharge}.pin2`}/>
          </Fragment>
        );
      })}
      <schematictext text="ASM_HDDPC control" schX={-1.5} schY={-7.4}
        fontSize={0.18} anchor="top_left"/>
      <A_0402WGF1001TCE
        name="R_HDDPC_PD"
        schSectionName="SLOT_POWER_CONTROL"
        schX={1} schY={-9.3}
        schOrientation="vertical"
        connections={{pin1: "net.ASM_HDDPC", pin2: "net.GND"}}
      />
      <netlabel inline net="ASM_HDDPC" connection="R_HDDPC_PD.pin1"/>
      <netlabel inline net="GND" connection="R_HDDPC_PD.pin2"/>
    </subcircuit>
  );
}
