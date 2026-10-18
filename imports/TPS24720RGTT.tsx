import {Fragment} from "react";
import type {ChipProps} from "@tscircuit/props";

export const tps24720Pins = {
  pin1: ["EN"], pin2: ["PROG"], pin3: ["TIMER"], pin4: ["GND"],
  pin5: ["OV"], pin6: ["IMON"], pin7: ["SET"], pin8: ["OUT"],
  pin9: ["N_FFLT"], pin10: ["GATE"], pin11: ["SENSE"], pin12: ["VCC"],
  pin13: ["N_FLT"], pin14: ["LATCH"], pin15: ["N_PG"], pin16: ["ENSD"], pin17: ["EP"],
} as const;

/** TI RGT0016C land example: 0.5 mm pitch, 0.6 x 0.24 lands, 1.68 mm EP. */
export const TPS24720RGTT = (props: ChipProps<typeof tps24720Pins>) => (
  <chip pinLabels={tps24720Pins} manufacturerPartNumber="TPS24720RGTT"
    datasheetUrl="https://www.ti.com/lit/ds/symlink/tps24720.pdf"
    pinAttributes={{pin4: {requiresGround: true}, pin17: {requiresGround: true}}}
    footprint={<footprint>
      {Array.from({length: 16}, (_, i) => {
        const side = Math.floor(i / 4), along = i % 4;
        const x = side === 0 ? -1.4 : side === 1 ? -0.75 + along * 0.5 : side === 2 ? 1.4 : 0.75 - along * 0.5;
        const y = side === 0 ? 0.75 - along * 0.5 : side === 1 ? -1.4 : side === 2 ? -0.75 + along * 0.5 : 1.4;
        return <Fragment key={i}><smtpad portHints={[`pin${i + 1}`]} pcbX={x} pcbY={y}
          width={side % 2 === 0 ? 0.6 : 0.24} height={side % 2 === 0 ? 0.24 : 0.6} shape="rect"/></Fragment>;
      })}
      <smtpad portHints={["pin17"]} pcbX={0} pcbY={0} width={1.68} height={1.68} shape="rect"/>
      <courtyardoutline outline={[{x:-1.95,y:-1.95},{x:1.95,y:-1.95},{x:1.95,y:1.95},{x:-1.95,y:1.95},{x:-1.95,y:-1.95}]}/>
      <silkscreentext text="{NAME}" pcbX={0} pcbY={2.4} fontSize={0.8}/>
    </footprint>} {...props}/>
);
