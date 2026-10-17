import {BridgeReset} from "../../components/BridgeReset";
import {BuckEnable} from "../../components/BuckEnable";
import {supervisorModel, waveformModel} from "./models";
import type {Scenario} from "./scenarios";
import {Fragment} from "react";

/** Reuses the production reset, supervisor divider, bypass and pull-up network. */
export default function PowerResetSimulation({scenario}: {scenario: Scenario}) {
  return <board routingDisabled>
    {Object.entries(scenario.rails).map(([rail, points]) => <chip
      key={rail} name={`U_STIM_${rail}`} pinLabels={{pin1: "OUT", pin2: "GND"}}
      spiceModel={<spicemodel source={waveformModel(points, `FLAMINGO_${rail}`)}/>}
      connections={{OUT: `net.${rail}`, GND: "net.GND"}}/>
    )}
    <BridgeReset/>
    <BuckEnable spiceModel={<spicemodel source={supervisorModel}/>}/>
    {scenario.resetLeakageUa ? <currentsource name="I_RESET_LEAKAGE" current={`${scenario.resetLeakageUa}uA`}
      connections={{pin1: "net.GND", pin2: "net.ASM_RST_N"}}/> : null}
    {["V5V", "VCCH", "VCCL", "VDD", "ASM_RST_N", "BUCK_EN", "VCCH_SENSE"].map(name =>
      <Fragment key={name}><voltageprobe name={name} connectsTo={`net.${name}`}/></Fragment>
    )}
    <analogsimulation name={scenario.name} spiceEngine="ngspice"
      duration={`${scenario.durationMs}ms`} timePerStep={`${scenario.stepMs}ms`}/>
  </board>;
}
