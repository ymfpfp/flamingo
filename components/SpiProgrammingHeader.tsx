import type {ChipProps} from "@tscircuit/props";

const pinLabels = {
  pin1: ["RST_N"],
  pin2: ["GND"],
  pin3: ["V3V3"],
  pin4: ["CS_N"],
  pin5: ["CLK"],
  pin6: ["MOSI"],
  pin7: ["MISO"],
} as const;

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
      footprint="pinrow7_p2.54mm"
      {...props}
    />
  );
}
