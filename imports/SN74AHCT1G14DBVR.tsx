import type { ChipProps } from "@tscircuit/props"
import {Fragment} from "react"

const pinLabels = {
  pin1: ["NC"],
  pin2: ["A"],
  pin3: ["GND"],
  pin4: ["Y"],
  pin5: ["VCC"]
} as const

const pinAttributes = {
  pin1: {doNotConnect: true},
  pin3: {requiresGround: true},
  pin5: {requiresPower: true}
} as const

export const SN74AHCT1G14DBVR = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      pinAttributes={pinAttributes}
      supplierPartNumbers={{
  "jlcpcb": [
    "C55250"
  ]
}}
      manufacturerPartNumber="SN74AHCT1G14DBVR"
      // Explicit axis-aligned lands avoid a footprinter pad-rotation error after packing.
      footprint={<footprint>
        {[[1,1.3,-0.95],[2,1.3,0],[3,1.3,0.95],[4,-1.3,0.95],[5,-1.3,-0.95]].map(([pin,x,y]) =>
          <Fragment key={pin}><smtpad portHints={[`pin${pin}`]} pcbX={x} pcbY={y} width={1.1} height={0.6} shape="rect"/></Fragment>
        )}
        <courtyardoutline outline={[{x:-2.1,y:-1.5},{x:2.1,y:-1.5},{x:2.1,y:1.5},{x:-2.1,y:1.5},{x:-2.1,y:-1.5}]}/>
        <silkscreentext text="{NAME}" pcbX={0} pcbY={1.9} fontSize={0.8}/>
      </footprint>}
      cadModel={{
        objUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C55250.obj?uuid=460193f9bf2d42e58cf3c2f675b07dc6",
        stepUrl: "https://modelcdn.tscircuit.com/easyeda_models/assets/C55250.step?uuid=460193f9bf2d42e58cf3c2f675b07dc6",
        pcbRotationOffset: 180,
        modelOriginPosition: { x: 0, y: -0.000012700000070253736, z: -0.049083 },
      }}
      {...props}
    />
  )
}
