import {Footprint} from "../../imports/ASM2464PDX";

export default function BridgeFootprintReview() {
  return (
    <board
      width="20mm"
      height="20mm"
      layers={6}
      thickness="1.6mm"
      routingDisabled
    >
      <chip
        name="ASM2464PDX"
        manufacturerPartNumber="ASM2464PDX"
        pcbX={0}
        pcbY={0}
        pcbRotation={0}
        footprint={<Footprint/>}
      />
    </board>
  );
}
