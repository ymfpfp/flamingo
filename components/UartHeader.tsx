import type {ChipProps} from "@tscircuit/props";
import {Fragment} from "react";

const pinLabels = {
  pin1: ["GND"],
  pin2: ["TX"],
  pin3: ["RX"],
} as const;

/** Unpopulated UART access: solder wires or fit a 2.54 mm pin header. */
export function UartHeaderFootprint() {
  return (
    <footprint insertionDirection="from_above">
      {(["GND", "TX", "RX"] as const).map((label, index) => (
        <Fragment key={label}>
          <platedhole
            portHints={[`pin${index + 1}`, label]}
            pcbX={(index - 1) * 2.54}
            pcbY={0}
            shape="circle"
            holeDiameter="1mm"
            outerDiameter="1.8mm"
          />
          <silkscreentext
            text={label === "GND" ? label : `UART_${label}`}
            pcbX={(index - 1) * 2.54}
            pcbY={1.6}
            // A full turn explicitly keeps text horizontal when the header is at 90°.
            // Zero inherits the header rotation in the current renderer.
            pcbRotation={360}
            fontSize="0.8mm"
            anchorAlignment="center_right"
          />
        </Fragment>
      ))}
      <silkscreenpath route={[
        {x: -3.7, y: -1.15}, {x: 3.7, y: -1.15},
        {x: 3.7, y: 1.15}, {x: -3.7, y: 1.15}, {x: -3.7, y: -1.15},
      ]}/>
      <silkscreentext
        text="{NAME}"
        pcbY={-2.5}
        fontSize="0.8mm"
        anchorAlignment="center"
      />
      <courtyardoutline outline={[
        {x: -4, y: -3.6}, {x: 4, y: -3.6},
        {x: 4, y: 5.4}, {x: -4, y: 5.4}, {x: -4, y: -3.6},
      ]}/>
    </footprint>
  );
}

/** TX/RX are named from Flamingo's perspective; connect adapter RX/TX. */
export function UartHeader(props: ChipProps<typeof pinLabels>) {
  return (
    <connector
      doNotPlace
      pinLabels={pinLabels}
      schPinArrangement={{leftSide: {pins: [1, 2, 3], direction: "top-to-bottom"}}}
      footprint={<UartHeaderFootprint/>}
      {...props}
    />
  );
}
