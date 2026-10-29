import {Fragment} from "react";
import {CL10B104KB8NNNC} from "imports/CL10B104KB8NNNC";
import {CL21A106KAYNNNE} from "imports/CL21A106KAYNNNE";
import {CL31B106KAHNNNE} from "imports/CL31B106KAHNNNE";
import {DFE252012F_1R0M_P2} from "imports/DFE252012F_1R0M_P2";
import {TPS62903RPJR} from "imports/TPS62903RPJR";
import {RC0402FR_078K87L} from "imports/RC0402FR_078K87L";
import {VddPrecisionFeedback} from "imports/VddPrecisionFeedback";
import {RT0402BRD0712K1L} from "imports/RT0402BRD0712K1L";
import {RT0402BRD0716K2L} from "imports/RT0402BRD0716K2L";
import {RT0402BRD0710KL} from "imports/RT0402BRD0710KL";
import {FixedTrace} from "./FixedTrace";

/** TPS62903: external feedback, 2.5 MHz forced PWM, 1 uH and 2 x 10 uF per rail. */
export function BuckInputs() {
  return (
    <>
      {(["VCCL", "VDD"] as const).map((rail, index) => {
        const name = `${rail}_BUCK`;
        const section = `${rail}_BUCK_INPUT`;
        const BottomResistor = rail === "VDD" ? VddPrecisionFeedback : RT0402BRD0712K1L;
        const TopResistor = rail === "VCCL" ? RT0402BRD0716K2L : VddPrecisionFeedback;
        const feedbackEnd = rail === "VCCL" ? "R_VCCL_FBT_B.pin2" : "R_VDD_FBT.pin2";
        return (
          <group key={rail} name={section} schX={3 + index * 14} schY={8} pcbRelative
            pcbStyle={{silkscreenTextVisibility: "hidden"}}>
            <schematicsection name={section}/>
            <schematictext text={`${rail} Buck: 5 V Supply`}
              schX={-6.2} schY={1.7} fontSize={0.18} anchor="left"/>
            <TPS62903RPJR
              name={name} schSectionName={section} schX={0} schY={0}
              pcbX={0} pcbY={0} pcbRotation={270} layer="top"
              noConnect={rail === "VDD" ? ["PG"] : ["SS", "PG"]}
              schPinArrangement={{
                leftSide: {direction: "top-to-bottom", pins: ["VIN", "EN", "MODE", "SS", "GND"]},
                rightSide: {direction: "top-to-bottom", pins: ["SW", "VOS", "FB", "PG"]},
              }}
              connections={{
                VIN: "net.V5V", GND: "net.GND", EN: "net.BUCK_EN",
                VOS: `net.${rail}`, FB: `net.FB_${rail}`,
              }}
            />
            <DFE252012F_1R0M_P2
              name={`L_${rail}`}
              pcbX={0} pcbY={3.5} pcbRotation={90} layer="top"
              schSectionName={section}
              schX={3.1}
              schY={0.8}
              connections={{pin2: `net.${rail}`}}
            />
            {/* Share the output anchor to avoid automatic wire stubs. */}
            <netlabel inline net={rail} connectsTo={[`L_${rail}.pin2`, `C_${rail}_COUT.pin1`, `C_${rail}_COUT_B.pin1`, `R_${rail}_FBT.pin1`]}/>
            <netlabel inline net={rail} connection={`${name}.VOS`}/>
            <netlabel inline net={`FB_${rail}`} connection={`${name}.FB`}/>
            {/* TI table 8-3: 1 uH and 10-100 uF effective total at 2.5 MHz. */}
            <CL21A106KAYNNNE
              pcbX={-3.3} pcbY={1.6} pcbRotation={270} layer="top" name={`C_${rail}_COUT`}
              maxDecouplingTraceLength="6mm"
              schSectionName={section}
              schX={5}
              schY={-0.8}
              schOrientation="vertical"
              connections={{pin2: "net.GND"}}
            />
            <CL21A106KAYNNNE
              name={`C_${rail}_COUT_B`} schSectionName={section}
              schX={6.8} schY={-0.8} schOrientation="vertical"
              pcbX={3.3} pcbY={5.7} pcbRotation={90} layer="top"
              maxDecouplingTraceLength="6mm"
              connections={{pin1: `net.${rail}`, pin2: "net.GND"}}
            />
            <netlabel inline net="GND" connection={`C_${rail}_COUT.pin2`}/>
            <netlabel inline net="GND" connection={`C_${rail}_COUT_B.pin2`}/>
            {/* Retain the 0.6 V feedback dividers for the 1.9 V / 1.13 V targets.
                Keep the divider beside FB on the quiet right side. One output
                capacitor sits toward VOS/GND; the other faces the inductor output. */}
            <TopResistor name={`R_${rail}_FBT`} schSectionName={section}
              pcbX={rail === "VDD" ? 4.2 : 4.329998} pcbY={rail === "VDD" ? 1.4 : 2.686} pcbRotation={180} layer="top"
              schX={2.5} schY={-1} schOrientation="vertical"
              connections={{pin2: rail === "VCCL" ? "net.FBT_VCCL_SERIES" : "net.FB_VDD"}}/>
            {rail === "VCCL" && <>
              {/* 16.2k + 10k = 26.2k; both 0.1% / 25 ppm/K.
                  Nominal VCCL is 1.89917 V with the unchanged 12.1k bottom. */}
              <RT0402BRD0710KL name="R_VCCL_FBT_B" schSectionName={section}
                pcbX={2.394998} pcbY={1.836} pcbRotation={180} layer="top"
                footprint="smdpads2_p0.8656mm_pw0.5657mm_ph0.54mm_cyw1.9313mm_cyh1.04mm"
                schX={2.5} schY={-2.2} schOrientation="vertical"
                connections={{pin1:"net.FBT_VCCL_SERIES",pin2:"net.FB_VCCL"}}/>
              <FixedTrace name="BUCK_VCCL_FB_TOP_SERIES" from="R_VCCL_FBT.pin2" to="R_VCCL_FBT_B.pin1"
                width={.15} points={[[29.2672,77.4]]}/>
            </>}
            <BottomResistor {...(rail === "VDD" ? {bottom:true} : {})} name={`R_${rail}_FBB`} schSectionName={section}
              pcbX={rail === "VDD" ? 3.3 : 2.494998} pcbY={rail === "VDD" ? 2.8 : .336} pcbRotation={rail === "VDD" ? 0 : 270} layer="top"
              schX={2.5} schY={rail === "VCCL" ? -3.4 : -2.2} schOrientation="vertical"
              connections={{pin2: "net.GND"}}/>
            <netlabel inline net={`FB_${rail}`} connectsTo={[feedbackEnd, `R_${rail}_FBB.pin1`]}/>
            <netlabel inline net="GND" connection={`R_${rail}_FBB.pin2`}/>
            {/* TI table 7-1 option 4: external FB, 2.5 MHz forced PWM, discharge off. */}
            <RC0402FR_078K87L name={`R_${rail}_MODE`} schSectionName={section}
              pcbX={3.3} pcbY={-1.95} pcbRotation={90} layer="top"
              schX={-2.5} schY={-1.5} schOrientation="vertical"
              connections={{pin2: "net.GND"}}/>
            <netlabel inline net={`${rail}_MODE`} connectsTo={[`${name}.MODE`, `R_${rail}_MODE.pin1`]}/>
            <netlabel inline net="GND" connection={`R_${rail}_MODE.pin2`}/>
            {/* These capacitors shunt the input to ground; neither is in series.
                The local PCB layout keeps bypassing below VIN/GND. */}
            <CL31B106KAHNNNE
              name={`C_${rail}_CIN`}
              pcbX={-0.425} pcbY={-3.721} pcbRotation={180} layer="top"
              maxDecouplingTraceLength="3mm"
              schSectionName={section}
              schX={-5.7}
              schY={0.8}
              schOrientation="vertical"
              connections={{pin1: "net.V5V", pin2: "net.GND"}}
            />
            <CL10B104KB8NNNC
              name={`C_${rail}_HF`}
              pcbX={-.4} pcbY={-1.902} pcbRotation={180} layer="top"
              maxDecouplingTraceLength="3mm"
              schSectionName={section}
              schX={-3.8}
              schY={0.8}
              schOrientation="vertical"
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
            <schematictext text="EN: shared VCCH monitor. PG and SS/TR open; fastest internal soft start." schX={-5} schY={-3} fontSize={0.18} anchor="left"/>
            <schematictext text="CIN: 10uF + 100nF; COUT: 2 x 10uF / 25V X5R, plus bridge decoupling." schX={-5} schY={-3.4} fontSize={0.18} anchor="left"/>
            <schematictext text="TPS62903: 3A, 2.5MHz forced PWM; 8.87k MODE, output discharge off." schX={-5} schY={-3.8} fontSize={0.18} anchor="left"/>
          </group>
        );
      })}
    </>
  );
}
