import type {ChipProps} from "@tscircuit/props";
import {fp} from "@tscircuit/footprinter";
import {Fragment} from "react";

const pinLabels = {
  pin1: ["RST_N"],
  pin2: ["GND"],
  pin3: ["V3V3"],
  pin4: ["CS_N"],
  pin5: ["CLK"],
  pin6: ["MOSI"],
  pin7: ["MISO"],
} as const;

// Keep the standard pinrow's pads, courtyard, and pin-1 marker exactly as generated.
// Replace only its text so the vertical header has horizontal labels like UART.
const spiFootprintGeometry = fp.string("pinrow7_p2.54mm").circuitJson()
  .filter(element => element.type !== "pcb_silkscreen_text");

function SpiProgrammingHeaderSilkscreen() {
  return (
    <footprint insertionDirection="from_above">
      {Object.values(pinLabels).map(([label], index) => (
        <Fragment key={label}>
          <silkscreentext
            text={label}
            pcbX={(index - 3) * 2.54}
            pcbY={1.6}
            // Explicit full turn keeps the text horizontal at the header's 90° rotation.
            pcbRotation={360}
            fontSize="0.8mm"
            anchorAlignment="center_right"
          />
        </Fragment>
      ))}
      <silkscreenpath route={[
        {x: -8.78, y: -1.15}, {x: 8.78, y: -1.15},
        {x: 8.78, y: 1.15}, {x: -8.78, y: 1.15}, {x: -8.78, y: -1.15},
      ]}/>
      <silkscreentext
        text="{NAME}"
        pcbY={-2.5}
        fontSize="0.8mm"
        anchorAlignment="center"
      />
    </footprint>
  );
}

/** Unpopulated 1x7 programming access, with signals named from the programmer's perspective.
 * MOSI connects to flash DI; MISO connects to flash DO. This is a custom pinout.
 * RST_N sits next to GND so a jumper can hold the bridge in reset.
 * The 3V3 pin connects directly to board power; this header does not isolate the bridge.
 */
export function SpiProgrammingHeader(props: ChipProps<typeof pinLabels>) {
  return (
    <connector
      doNotPlace
      pinLabels={pinLabels}
      schPinArrangement={{leftSide: {pins: [1, 2, 3, 4, 5, 6, 7], direction: "top-to-bottom"}}}
      footprint={spiFootprintGeometry as ChipProps<typeof pinLabels>["footprint"]}
      {...props}
    >
      <SpiProgrammingHeaderSilkscreen/>
    </connector>
  );
}
