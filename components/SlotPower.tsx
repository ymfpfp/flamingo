import {Fragment} from "react";
import {AO4407A} from "imports/AO4407A";
import {DMP2008UFG_7} from "imports/DMP2008UFG_7";
import {A_2N7002K_7} from "imports/A_2N7002K_7";
import {A_0402WGF0000TCE} from "imports/A_0402WGF0000TCE";
import {A_0402WGF1001TCE} from "imports/A_0402WGF1001TCE";
import {A_0402WGF1003TCE} from "imports/A_0402WGF1003TCE";
import {A_0402WGF5100TCE} from "imports/A_0402WGF5100TCE";
import {A_1206W4F1001T5E} from "imports/A_1206W4F1001T5E";
import {CL31B106KAHNNNE} from "imports/CL31B106KAHNNNE";

const rails = [
  {suffix: "3V3", input: "V3V3", output: "SLOT_3V3", y: 4},
  {suffix: "12V", input: "V12V", output: "SLOT_12V", y: -4},
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
      exposedNets={["V3V3", "V12V", "SLOT_3V3", "SLOT_12V", "ASM_HDDPC", "GND"]}
    >
      {["V3V3", "V12V", "SLOT_3V3", "SLOT_12V", "ASM_HDDPC", "GND"].map(name => (
        <Fragment key={name}><net name={name}/></Fragment>
      ))}
      <net name="SLOT_POWER_ENABLE"/>
      <schematicsection name="SLOT_POWER" displayName="2. Slot power switches"/>
      <A_0402WGF0000TCE
        name="R_SLOT_ENABLE"
        schSectionName="SLOT_POWER"
        schX={-1} schY={-3.9}
        connections={{pin1: "net.ASM_HDDPC", pin2: "net.SLOT_POWER_ENABLE"}}
      />
      <A_0402WGF1001TCE
        name="R_SLOT_ENABLE_PD"
        schSectionName="SLOT_POWER"
        schX={-0.2} schY={-5.5}
        schOrientation="vertical"
      />
      <trace from=".R_SLOT_ENABLE > .pin2" to=".R_SLOT_ENABLE_PD > .pin1"/>
      <netlabel net="GND" connection="R_SLOT_ENABLE_PD.pin2" schX={-0.2} schY={-6.5} anchorSide="top"/>
      <netlabel net="ASM_HDDPC" connection="R_SLOT_ENABLE.pin1" schX={-1.8} schY={-3.9} anchorSide="right"/>
      <schematictext text="HDDPC high: both rails ON" schX={1} schY={-2.9} fontSize={0.23} anchor="left"/>
      <schematictext text="HDDPC low: both rails OFF" schX={1} schY={-3.3} fontSize={0.23} anchor="left"/>
      {rails.map(({suffix, input, output, y}) => {
        const power = `Q_SLOT_${suffix}`;
        const driver = `Q_SLOT_DRV_${suffix}`;
        const series = `R_SLOT_GATE_${suffix}`;
        const off = `R_SLOT_OFF_${suffix}`;
        const cap = `C_SLOT_GATE_${suffix}`;
        const discharge = `R_SLOT_DISCHARGE_${suffix}`;
        const section = "SLOT_POWER";
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
            <schematictext text={`${suffix === "3V3" ? "3.3 V" : "12 V"}: supply → switch → PCIe slot`} schX={1} schY={y + 1.6} fontSize={0.26} anchor="left"/>
            {suffix === "3V3" ? (
              <DMP2008UFG_7 {...commonPowerProps} internallyConnectedPins={[["pin1", "pin2", "pin3"]]}/>
            ) : (
              <AO4407A {...commonPowerProps} internallyConnectedPins={[["pin1", "pin2", "pin3"], ["pin5", "pin6", "pin7", "pin8"]]}/>
            )}
            <A_2N7002K_7 name={driver} schSectionName={section} schX={1} schY={y - 4}
              connections={{S: "net.GND"}}/>
            <A_0402WGF5100TCE name={series} schSectionName={section} schX={3.5} schY={y - 2.8}/>
            <A_0402WGF1003TCE name={off} schSectionName={section} schX={3.5} schY={y - 1.4} schOrientation="vertical"/>
            {/* Reference nominal value; verify startup current and MOSFET SOA with the card load. */}
            <CL31B106KAHNNNE name={cap} schSectionName={section} schX={6} schY={y - 1.4} schOrientation="vertical"/>
            <A_1206W4F1001T5E name={discharge} schSectionName={section} schX={9.8} schY={y - 1.4} schOrientation="vertical"/>
            <trace from={`.${power} > .pin1`} to={`.${off} > .pin1`}/>
            <trace from={`.${power} > .pin1`} to={`.${cap} > .pin1`}/>
            <trace from={`.${power} > .pin4`} to={`.${off} > .pin2`}/>
            <trace from={`.${power} > .pin4`} to={`.${cap} > .pin2`}/>
            <trace from={`.${power} > .pin4`} to={`.${series} > .pin2`}/>
            <trace from={`.${series} > .pin1`} to={`.${driver} > .D`}/>
            <trace from={`.${power} > .pin5`} to={`.${discharge} > .pin1`}/>
            <trace from=".R_SLOT_ENABLE > .pin2" to={`.${driver} > .G`}/>
            <netlabel net={input} connection={`${power}.pin1`} schX={1.8} schY={y + 0.2} anchorSide="right"/>
            <netlabel net={output} connection={`${power}.pin5`} schX={11} schY={y + 0.2} anchorSide="left"/>
            <netlabel net="GND" connection={`${driver}.S`} schX={1.2} schY={y - 5.1} anchorSide="top"/>
            <netlabel net="GND" connection={`${discharge}.pin2`} schX={9.8} schY={y - 3} anchorSide="top"/>
            <schematictext text="Gate driver" schX={1.2} schY={y - 5.6} fontSize={0.2} anchor="center"/>
          </Fragment>
        );
      })}
      <schematictext text="100k holds each switch OFF. 10uF slows its turn-on." schX={0} schY={-10.4} fontSize={0.22} anchor="left"/>
      <schematictext text="1k at each output discharges the rail after switch-off." schX={0} schY={-10.8} fontSize={0.22} anchor="left"/>
      <schematictext text="Reference: ASMedia sheet 6. Startup timing and protection need verification." schX={0} schY={-11.3} fontSize={0.18} anchor="left"/>
    </subcircuit>
  );
}
