import {Fragment} from "react";
import {controlNets, controlProfiles, controlRoutingPolicy} from "../lib/control-routing-config.mjs";
import {jlcpcbBoardRules} from "../lib/jlcpcb-rules";

export type ControlAutorouting = {
  algorithmForNet: (name: string) => (input: any) => Promise<any>;
  remainingAlgorithm: (input: any) => Promise<any>;
};

// A named net is collapsed to source_net_N in native SRJ. It must carry the
// phase too; assigning only its trace endpoints leaves that connection in the
// implicit remaining pass. These two labels differ from the inventory names.
export function controlNetProperties(name: string) {
  const aliases: Record<string, string> = {ASM_TEST_EN: 'TEST_EN', W25Q32JVSSIQ_WP: 'FLASH_WP'};
  const index = controlNets.findIndex(net => net.name === (aliases[name] ?? name));
  if (index < 0) return {};
  return {routingPhaseIndex: 20 + index,
    nominalTraceWidth: controlProfiles[controlNets[index].profile].widthMm};
}

// Explicit phases give each electrical net its own width and edge clearance.
// The native-solver adapter also applies the clearance as defaultObstacleMargin
// and restricts search to the two signal surfaces. See route-control-board.mjs.
// Length, plane continuity, impedance and full-stack via checks are acceptance
// checks, since this installed general-purpose router does not enforce them.
export function ControlRouting({routing}: {routing: ControlAutorouting}) {
  return <>
    {/* Export this otherwise sheet-local net to the board routing phase. */}
    <net name="PCIE_CLKREQ_N" {...controlNetProperties('PCIE_CLKREQ_N')}/>
    {controlNets.map((net, index) => {
    const rule = controlProfiles[net.profile as keyof typeof controlProfiles];
    const bga = net.terminals.some((pin: string) => pin.startsWith("ASM2464PDX."));
    return <Fragment key={net.name}>
      <autoroutingphase name={`CONTROL_${net.name}`} phaseIndex={20 + index}
        connections={net.terminals}
        minTraceWidth={rule.widthMm}
        minTraceToPadEdgeClearance={rule.clearanceMm}
        minViaEdgeToPadEdgeClearance={Math.max(jlcpcbBoardRules.minViaEdgeToPadEdgeClearance, rule.clearanceMm)}
        minTraceToHoleEdgeClearance={jlcpcbBoardRules.minTraceToHoleEdgeClearance}
        minViaHoleEdgeToViaHoleEdgeClearance={jlcpcbBoardRules.minViaHoleEdgeToViaHoleEdgeClearance}
        minPlatedHoleDrillEdgeToDrillEdgeClearance={jlcpcbBoardRules.minPlatedHoleDrillEdgeToDrillEdgeClearance}
        minPadEdgeToPadEdgeClearance={jlcpcbBoardRules.minPadEdgeToPadEdgeClearance}
        minBoardEdgeClearance={jlcpcbBoardRules.minBoardEdgeClearance}
        minViaHoleDiameter={bga ? controlRoutingPolicy.bgaViaHoleDiameterMm : controlRoutingPolicy.viaHoleDiameterMm}
        minViaPadDiameter={bga ? controlRoutingPolicy.bgaViaDiameterMm : controlRoutingPolicy.viaDiameterMm}
        autorouter={{local: true, allowViaInPad: true}}
        algorithmFn={routing.algorithmForNet(net.name)}/>
    </Fragment>;
  })}</>;
}
