import type {ChipProps} from "@tscircuit/props";

const pinLabels = {
  pin1: ["GND"],
  pin2: ["V3V3"],
  pin3: ["CS_N"],
  pin4: ["CLK"],
  pin5: ["MOSI"],
  pin6: ["MISO"],
} as const;

/** Unpopulated 1x6 programming access, with signals named from the programmer's perspective.
 * MOSI connects to flash DI; MISO connects to flash DO. This is a custom pinout.
 * The 3V3 pin connects directly to board power; this header does not isolate the bridge.
 */
export function SpiProgrammingHeader(props: ChipProps<typeof pinLabels>) {
  return (
    <connector
      doNotPlace
      pinLabels={pinLabels}
      schPinArrangement={{leftSide: {pins: [1, 2, 3, 4, 5, 6], direction: "top-to-bottom"}}}
      footprint="pinrow6_p2.54mm"
      {...props}
    />
  );
}
