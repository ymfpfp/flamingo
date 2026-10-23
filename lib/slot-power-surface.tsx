import {Fragment} from 'react';
import regions from '../manufacturing/slot-power-routing/surface-regions.json';
import stitches from '../manufacturing/slot-power-routing/surface-stitches.json';

// Render before the existing pours so they retain priority. Native tscircuit
// fills these power outlines and clears all new via barrels on every layer.
export function SlotPowerSurfaceCopper(){return <>
  {regions.map(p=><Fragment key={p.name}>
    <copperpour name={`SLOT_SURFACE_${p.name}`} layer={p.layer as 'top'|'bottom'}
      connectsTo={`net.${p.net}`} outline={p.outline} clearance={p.clearance}
      traceMargin={p.traceMargin} padMargin={p.clearance} cutoutMargin={p.clearance}
      boardEdgeMargin={0} useThermalReliefs={false} coveredWithSolderMask/>
  </Fragment>)}
  {stitches.map(p=><Fragment key={p.name}><via name={p.name} pcbX={p.x} pcbY={p.y}
    connectsTo={`net.${p.net}`} fromLayer="top" toLayer="bottom"
    outerDiameter={p.copperDiameter} holeDiameter={p.drillDiameter}/></Fragment>)}
</>}
