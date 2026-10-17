import {Fragment} from "react";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import {CL21A226MAYNNNE} from "imports/CL21A226MAYNNNE";
import {CL31B106KAHNNNE} from "imports/CL31B106KAHNNNE";
import {SLW5040S2R2MST} from "imports/SLW5040S2R2MST";
import {TPS62903RPJR} from "imports/TPS62903RPJR";
import {VO_0402_1pct_21K} from "imports/VO_0402_1pct_21K";
import {RT0402BRD0710K7L} from "imports/RT0402BRD0710K7L";
import {RT0402BRD0712K1L} from "imports/RT0402BRD0712K1L";
import {RT0402BRD0726K1L} from "imports/RT0402BRD0726K1L";

/** TPS62903 supplies: external feedback, 1 MHz forced PWM, discharge disabled. */
export function BuckInputs() {
  return (
    <>
      {(["VCCL", "VDD"] as const).map((rail, index) => {
        const name = `${rail}_BUCK`;
        const section = `${rail}_BUCK_INPUT`;
        const TopResistor = rail === "VCCL" ? RT0402BRD0726K1L : RT0402BRD0710K7L;
        return (
          <group key={rail} name={section} schX={3 + index * 14} schY={8}>
            <schematicsection name={section}/>
            <schematictext text={`${rail} Buck: 5 V Supply`}
              schX={-6.2} schY={1.7} fontSize={0.18} anchor="left"/>
            <TPS62903RPJR
              name={name}
              schSectionName={section}
              schX={0}
              schY={0}
              schWidth={1.8}
              schHeight={1.2}
              // SS/TR open selects fastest startup; unused PG may remain open (TI 7.3.6).
              noConnect={["SS", "PG"]}
              schPinArrangement={{
                leftSide: {direction: "top-to-bottom", pins: ["VIN", "EN", "MODE", "SS", "GND"]},
                rightSide: {direction: "top-to-bottom", pins: ["SW", "VOS", "FB", "PG"]},
              }}
              connections={{
                VIN: "net.V5V",
                GND: "net.GND",
                SW: `.L_${rail} > .pin1`,
                MODE: `.R_${rail}_MODE > .pin1`,
                VOS: `net.${rail}`,
                FB: `net.FB_${rail}`,
                EN: "net.BUCK_EN",
              }}
            />
            <SLW5040S2R2MST
              name={`L_${rail}`}
              schSectionName={section}
              schX={3.1}
              schY={0.8}
              connections={{pin2: `net.${rail}`}}
            />
            {/* Share the output anchor to avoid automatic wire stubs. */}
            <netlabel inline net={rail} connectsTo={[`L_${rail}.pin2`, `C_${rail}_COUT.pin1`, `R_${rail}_FBT.pin1`]}/>
            <netlabel inline net={rail} connection={`${name}.VOS`}/>
            <netlabel inline net={`FB_${rail}`} connection={`${name}.FB`}/>
            {/* TI table 8-3: 2.2uH + 22uF is the standard 1 MHz LC filter. */}
            <CL21A226MAYNNNE
              name={`C_${rail}_COUT`}
              schSectionName={section}
              schX={5}
              schY={-0.8}
              schOrientation="vertical"
              connections={{pin2: "net.GND"}}
            />
            <trace name={`${rail}_OUTPUT_FILTER`} from={`.L_${rail} > .pin2`} to={`.C_${rail}_COUT > .pin1`}/>
            <netlabel inline net="GND" connection={`C_${rail}_COUT.pin2`}/>
            {/* TI equation 10: VOUT = 0.6 V * (1 + Rtop/Rbottom).
                26.1k/12.1k gives 1.894215 V; 10.7k/12.1k gives 1.130579 V. */}
            <TopResistor name={`R_${rail}_FBT`} schSectionName={section}
              schX={2.5} schY={-1} schOrientation="vertical"
              connections={{pin2: `net.FB_${rail}`}}/>
            <RT0402BRD0712K1L name={`R_${rail}_FBB`} schSectionName={section}
              schX={2.5} schY={-2.2} schOrientation="vertical"
              connections={{pin2: "net.GND"}}/>
            <trace name={`${rail}_FB_OUTPUT`} from={`.L_${rail} > .pin2`} to={`.R_${rail}_FBT > .pin1`}/>
            <trace name={`${rail}_FB_DIVIDER`} from={`.R_${rail}_FBT > .pin2`} to={`.R_${rail}_FBB > .pin1`}/>
            <netlabel inline net={`FB_${rail}`} connectsTo={[`R_${rail}_FBT.pin2`, `R_${rail}_FBB.pin1`]}/>
            <netlabel inline net="GND" connection={`R_${rail}_FBB.pin2`}/>
            {/* Table 7-1, option 8: 21k selects external FB, 1 MHz,
                forced PWM and no active output discharge. */}
            <VO_0402_1pct_21K name={`R_${rail}_MODE`} schSectionName={section}
              schX={-2.8} schY={-1.6} schOrientation="vertical"
              connections={{pin2: "net.GND"}}/>
            <netlabel inline net="GND" connection={`R_${rail}_MODE.pin2`}/>
            {/* These capacitors shunt the input to ground; neither is in series.
                PCB follow-up: keep both capacitors close to VIN/GND. */}
            <CL31B106KAHNNNE
              name={`C_${rail}_CIN`}
              schSectionName={section}
              schX={-5.7}
              schY={0.8}
              schOrientation="vertical"
              pcbMarginX="1mm"
              pcbMarginY="1mm"
              connections={{pin1: "net.V5V", pin2: "net.GND"}}
            />
            <CL05B104KO5NNNC
              name={`C_${rail}_HF`}
              schSectionName={section}
              schX={-3.8}
              schY={0.8}
              schOrientation="vertical"
              pcbMarginX="1mm"
              pcbMarginY="1mm"
              connections={{pin1: "net.V5V", pin2: "net.GND"}}
            />
            {(["CIN", "HF"] as const).map((suffix, capacitorIndex) => (
              <Fragment key={suffix}>
                <netlabel inline net="V5V" connection={`C_${rail}_${suffix}.pin1`}/>
                <netlabel inline net="GND" connection={`C_${rail}_${suffix}.pin2`}/>
              </Fragment>
            ))}
            <netlabel inline net="V5V" connection={`${name}.VIN`}/>
            <netlabel inline net="BUCK_EN" connection={`${name}.EN`}/>
            <netlabel inline net="GND" connection={`${name}.GND`}/>
            <schematictext text="EN: shared VCCH monitor; SS NC: fastest startup; PG NC." schX={-5} schY={-3} fontSize={0.18} anchor="left"/>
            <schematictext text="CIN: 10uF + 100nF; COUT: 22uF / 25V X5R." schX={-5} schY={-3.4} fontSize={0.18} anchor="left"/>
            <schematictext text="MODE: 21k to GND selects 1MHz forced PWM; no discharge." schX={-5} schY={-3.8} fontSize={0.18} anchor="left"/>
          </group>
        );
      })}
    </>
  );
}
