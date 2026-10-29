import {Fragment} from "react";
import {FixedTrace} from "components/FixedTrace";
const branches=[{suffix:"A",x:43.55},{suffix:"B",x:48.8}];
export function VddReserveRouting(){return <>
  {branches.map(({suffix,x})=><Fragment key={suffix}>
    {[
      {name:`VDD_RESERVE_${suffix}_GND`,pin:`C_VDD_RESERVE_${suffix}.pin2`,x:x+1.46,y:112.6},
    ].map(p=><Fragment key={p.name}><via name={p.name} pcbX={p.x} pcbY={p.y} connectsTo={p.pin}
      fromLayer="top" toLayer="bottom" outerDiameter={.6} holeDiameter={.3}/></Fragment>)}
    <FixedTrace name={`VDD_RESERVE_${suffix}_CONTACT`} from={`R_VDD_DAMP_${suffix}.pin2`}
      to={`C_VDD_RESERVE_${suffix}.pin1`} width={1} points={[[x-1.46,109.8625]]}/>
  </Fragment>)}
  {[43.25,43.85].map((x,i)=><Fragment key={i}>
    <via name={`VDD_RESERVE_FEED_${i}`} pcbX={x} pcbY={108.5}
      connectsTo="R_VDD_DAMP_A.pin1" fromLayer="top" toLayer="bottom" outerDiameter={.6} holeDiameter={.3}/>
    <FixedTrace name={`VDD_RESERVE_FEED_CONTACT_${i}`} from={`VDD_RESERVE_FEED_${i}.top`}
      to="R_VDD_DAMP_A.pin1" width={.4} points={[]}/>
  </Fragment>)}
  <FixedTrace name="VDD_RESERVE_COMMON_FEED" from="R_VDD_DAMP_A.pin1" to="R_VDD_DAMP_B.pin1" width={1.2} points={[]}/>
  <via name="VDD_SS_GND" pcbX={39.020116} pcbY={76.764} connectsTo="C_VDD_SS.pin2"
    fromLayer="top" toLayer="bottom" outerDiameter={.4} holeDiameter={.2}/>
  <FixedTrace name="VDD_SS_CONTACT" from="VDD_BUCK.SS" to="C_VDD_SS.pin1" width={.15} points={[]}/>
</>}
