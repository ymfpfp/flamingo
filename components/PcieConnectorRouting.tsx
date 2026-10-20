import {Fragment} from "react";
import {pcieConnectorRules} from "../lib/pcie-connector-routing";
import {pcieTxContacts, pcieTxViaRules, pcieTxBridgeReturns, pcieTxCapReturns, pcieTxBgaReturns} from "../lib/pcie-tx-routing";
import {pcieRxContacts, pcieRxReturns, pcieRxBgaReturns, pcieRxNeckWidth} from "../lib/pcie-rx-routing";

// Complete PCIe TX/RX surface channels. L2 and L5 provide the references;
// saved native phases preserve the authored differential geometry.
export function PcieConnectorRouting() {
  return <>
    <autoroutingphase name="PCIE_TX_CONNECTOR" phaseIndex={1}
      minTraceWidth={pcieRxNeckWidth} pcbTracePaths={[]}/>
    <bus name="PCIE_TX_CONNECTOR_TOP"
      connections={[0, 1, 2, 3].flatMap(lane =>
        ["P", "N"].map(polarity => `C_TX${lane}_${polarity}.pin2`))}
      pcbAllowedLayers={["top"]} preferredLayer="top" pcbTraceWidth={pcieConnectorRules.width}/>
    <bus name="PCIE_TX_PHY_BOTTOM"
      connections={pcieTxContacts.flatMap(({positive, negative}) => [positive, negative].map(ball => `ASM2464PDX.${ball}`))}
      pcbAllowedLayers={["top", "bottom"]} preferredLayer="bottom" pcbTraceWidth={pcieConnectorRules.width}/>
    <bus name="PCIE_RX_SURFACE"
      connections={pcieRxContacts.flatMap(({positive, negative}) => [positive, negative].map(ball => `ASM2464PDX.${ball}`))}
      pcbAllowedLayers={["top", "bottom"]} preferredLayer="top" pcbTraceWidth={pcieConnectorRules.width}/>
    {[...pcieTxBridgeReturns, ...pcieTxCapReturns, ...pcieRxReturns].map(({x, y}, i) =>
      <Fragment key={i}><via name={`PCIE_TX_GND_RETURN_${i}`} pcbX={x} pcbY={y}
        fromLayer="top" toLayer="bottom" holeDiameter={pcieTxViaRules.hole}
        outerDiameter={pcieTxViaRules.diameter} connectsTo="net.GND"/></Fragment>)}
    {[...pcieTxBgaReturns, ...pcieRxBgaReturns].map(({x, y}, i) => <Fragment key={`bga-return-${i}`}>
      <via name={`PCIE_TX_BGA_GND_${i}`} pcbX={x} pcbY={y} fromLayer="top" toLayer="bottom"
        holeDiameter={pcieTxViaRules.bgaHole} outerDiameter={pcieTxViaRules.bgaDiameter} connectsTo="net.GND"/>
    </Fragment>)}
    {pcieTxContacts.map(({lane, positive, negative}) => <Fragment key={`phy-${lane}`}>
      <differentialpair name={`PCIE_TX${lane}_PHY`}
        positiveConnection={`ASM2464PDX.${positive}`} negativeConnection={`ASM2464PDX.${negative}`}
        pcbTraceGap={pcieConnectorRules.gap} maxLengthSkew={pcieConnectorRules.maxSkew}
        targetDifferentialImpedance={85}/>
    </Fragment>)}
    {pcieRxContacts.map(({lane, positive, negative}) => <Fragment key={`rx-${lane}`}>
      <differentialpair name={`PCIE_RX${lane}`} positiveConnection={`ASM2464PDX.${positive}`}
        negativeConnection={`ASM2464PDX.${negative}`} pcbTraceGap={pcieConnectorRules.gap}
        maxLengthSkew={pcieConnectorRules.maxSkew} targetDifferentialImpedance={85}/>
    </Fragment>)}
    {[0, 1, 2, 3].map(lane => <Fragment key={lane}>
      {(["P", "N"] as const).map(polarity =>
        <Fragment key={polarity}><net name={`PCIE_TX${lane}_${polarity}`}
          routingPhaseIndex={1} nominalTraceWidth={pcieConnectorRules.width}/></Fragment>
      )}
      <differentialpair name={`PCIE_TX${lane}_CON`}
        positiveConnection={`C_TX${lane}_P.pin2`} negativeConnection={`C_TX${lane}_N.pin2`}
        pcbTraceGap={pcieConnectorRules.gap} maxLengthSkew={pcieConnectorRules.maxSkew}
        targetDifferentialImpedance={85} maxUncoupledLength={pcieConnectorRules.maxUncoupledLength}/>
    </Fragment>)}
  </>;
}
