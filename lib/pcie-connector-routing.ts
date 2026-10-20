import type {AutoroutingPhase, Board, Port} from "tscircuit";
import type {FanoutTracePath} from "@tscircuit/props";
import {applyToPoint, compose, inverse, translate} from "transformation-matrix";
import stackup from "../manufacturing/stackup/JLC06161H-3313.json";
import {traceWidthsMm} from "./trace-width-rules";
import {createPcieTxRoutes} from "./pcie-tx-routing";
import {createPcieRxRoutes} from "./pcie-rx-routing";

const profile = stackup.impedanceProfiles[0];
export const pcieConnectorRules = {
  width: traceWidthsMm.surfaceDifferential85,
  gap: profile.calculatedPairGapMm,
  maxSkew: 0.025,
  maxUncoupledLength: 3,
} as const;

// Fixed 45-degree pad launches and a straight coupled section. These authored
// paths use native saved phases; there is no path search or custom router.
export function preparePcieConnectorRouting(board: Board, phase: AutoroutingPhase) {
  const port = (selector: string) => {
    const p = board.selectOne(selector, {type: "port"}) as Port | null;
    if (!p) throw new Error(`PCIe routing port missing: ${selector}`);
    return p;
  };
  const position = (selector: string) => port(selector)._getGlobalPcbPositionAfterLayout();
  const paths: FanoutTracePath[] = [];
  for (const lane of [0, 1, 2, 3]) {
    const midpointY = (position(`PCIe.TX${lane}_P`).y + position(`PCIe.TX${lane}_N`).y) / 2;
    for (const polarity of ["P", "N"]) {
      const connection = `C_TX${lane}_${polarity}.pin2`;
      const p = port(connection), cap = position(connection), end = position(`PCIe.TX${lane}_${polarity}`);
      const railY = midpointY + (polarity === "P" ? 1 : -1)
        * (pcieConnectorRules.width + pcieConnectorRules.gap) / 2;
      // Straight exits clear the 0402 land and the long connector land.
      const left = cap.x + 0.3, right = end.x - 1.4;
      const points = [cap, {x: left, y: cap.y},
        {x: left + Math.abs(railY - cap.y), y: railY},
        {x: right - Math.abs(end.y - railY), y: railY},
        {x: right, y: end.y}, end];
      const before = p._getGlobalPcbPositionBeforeLayout();
      const transform = inverse(compose(translate(cap.x - before.x, cap.y - before.y),
        phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
      paths.push({connection, route: points.map(point => ({route_type: "wire" as const,
        ...applyToPoint(transform, point), width: pcieConnectorRules.width, layer: "top" as const}))});
    }
  }
  for (const path of [...createPcieTxRoutes(position), ...createPcieRxRoutes(position)]) {
    const p = port(path.connection);
    const before = p._getGlobalPcbPositionBeforeLayout(), after = position(path.connection);
    const transform = inverse(compose(translate(after.x - before.x, after.y - before.y),
      phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    paths.push({...path, route: path.route.map(point => ({...point,
      ...applyToPoint(transform, {x: Number(point.x), y: Number(point.y)})}))});
  }
  phase._parsedProps.pcbTracePaths = paths as typeof phase._parsedProps.pcbTracePaths;
}
