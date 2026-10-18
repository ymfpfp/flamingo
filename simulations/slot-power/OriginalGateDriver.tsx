import {Fragment} from "react";
import {waveformModel} from "../power-reset/models";

type Rail = {suffix: string; supplyV: number; seriesOhm: number; pullupOhm: number; gateCapF: number};

/** Gate network only. No power-MOSFET channel, card load or output-rail model. */
export function OriginalGateDriver({rails, controlV, model}: {rails: Rail[]; controlV: number; model: string}) {
  return <board routingDisabled>
    <chip name="CONTROL" pinLabels={{pin1: "OUT", pin2: "GND"}}
      connections={{OUT: "net.EN", GND: "net.GND"}}
      spiceModel={<spicemodel source={waveformModel([[0, 0], [1, 0], [1.001, controlV], [100, controlV], [100.001, 0], [3000, 0]], "GATE_CONTROL")}/>}/>
    {rails.map(r => <Fragment key={r.suffix}>
      <chip name={`SUPPLY_${r.suffix}`} pinLabels={{pin1: "OUT", pin2: "GND"}}
        connections={{OUT: `net.IN_${r.suffix}`, GND: "net.GND"}}
        spiceModel={<spicemodel source={waveformModel([[0, r.supplyV], [3000, r.supplyV]], `SUPPLY_${r.suffix}`)}/>}/>
      <resistor name={`R_SLOT_GATE_${r.suffix}`} resistance={`${r.seriesOhm}ohm`}
        connections={{pin1: `net.DRIVER_D_${r.suffix}`, pin2: `net.P_GATE_${r.suffix}`}}/>
      <resistor name={`R_SLOT_OFF_${r.suffix}`} resistance={`${r.pullupOhm}ohm`}
        connections={{pin1: `net.IN_${r.suffix}`, pin2: `net.P_GATE_${r.suffix}`}}/>
      <capacitor name={`C_SLOT_GATE_${r.suffix}`} capacitance={`${r.gateCapF}F`}
        connections={{pin1: `net.IN_${r.suffix}`, pin2: `net.P_GATE_${r.suffix}`}}/>
      <chip name={`Q_SLOT_DRV_${r.suffix}`} pinLabels={{pin1: "D", pin2: "G", pin3: "S"}}
        connections={{D: `net.DRIVER_D_${r.suffix}`, G: "net.EN", S: "net.GND"}}
        spiceModel={<spicemodel source={`.subckt DRIVER_${r.suffix} D G S
${model}
.ends DRIVER_${r.suffix}`}/>}/>
      <voltageprobe name={`P_GATE_${r.suffix}`} connectsTo={`net.P_GATE_${r.suffix}`}/>
      <voltageprobe name={`DRIVER_D_${r.suffix}`} connectsTo={`net.DRIVER_D_${r.suffix}`}/>
    </Fragment>)}
    <voltageprobe name="EN" connectsTo="net.EN"/>
    <analogsimulation name="original_gate_driver" duration="3000ms" timePerStep="1ms" spiceEngine="ngspice"/>
  </board>;
}
