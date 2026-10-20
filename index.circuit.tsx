import {Children, cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode} from "react";
import type {AutoroutingPhase, Board as PcbBoard, Group} from "tscircuit";
import {applyPcbGroupPlacements, type PcbGroupPlacement, type PcbPlacementGroups} from "lib/pcb-group-placement";
import {jlcpcbBoardRules} from "lib/jlcpcb-rules";
import {usb4RoutedContacts, prepareUsb4Routing} from "lib/usb4-routing";
import {prepareUsb2Routing, Usb2Routing} from "lib/usb2-routing";
import {BridgeClockRouting, prepareBridgeClockRouting} from "lib/bridge-clock-routing";
import {usbGuardBands, usbShieldFences} from "lib/usb-shielding";
import {pcieConnectorRules, preparePcieConnectorRouting} from "lib/pcie-connector-routing";
import {usb4Rules, usb4TraceRules} from "lib/high-speed-rules";
import {outlineSilkscreenText} from "lib/silkscreen-font";
import {flamingoSilkscreen} from "lib/flamingo-silkscreen";
import {tsMarkSilkscreen} from "lib/ts-mark-silkscreen";
import {BridgeReset} from "components/BridgeReset";
import {BridgeVcca33Decoupling} from "components/BridgeVcca33Decoupling";
import {BridgeVcchDecoupling} from "components/BridgeVcchDecoupling";
import {BridgeVcclDecoupling} from "components/BridgeVcclDecoupling";
import {BridgeVddDecoupling} from "components/BridgeVddDecoupling";
import {BuckEnable} from "components/BuckEnable";
import {BuckInputs} from "components/BuckInputs";
import {PsuControl, PsuOkLed} from "components/PsuControl";
import {PcieConnectorRouting} from "components/PcieConnectorRouting";
import {PsuStatusRouting} from "components/PsuStatusRouting";
import {SpiProgrammingHeader} from "components/SpiProgrammingHeader";
import {SlotPower} from "components/SlotPower";
import {SlotDecoupling} from "components/SlotDecoupling";
import {UartHeader} from "components/UartHeader";
import {Usb4Lanes, usb4Signals} from "components/Usb4Lanes";
import {UsbVbusSense} from "components/UsbVbusSense";
import {A_0402WGF0000TCE} from "imports/A_0402WGF0000TCE";
import {A_0402WGF1002TCE} from "imports/A_0402WGF1002TCE";
import {A_39301240} from "imports/A_39301240";
import {CL05B104KO5NNNC} from "imports/CL05B104KO5NNNC";
import {CL05B224KO5NNNC} from "imports/CL05B224KO5NNNC";
import ASM2464PDX from "imports/ASM2464PDX";
import {GT_USB_7087B} from "imports/GT_USB_7087B";
import {RC0402FR_0712K1L} from "imports/RC0402FR_0712K1L";
import {TCC0402COG100J500AT} from "imports/TCC0402COG100J500AT";
import {W25Q32JVSSIQ} from "imports/W25Q32JVSSIQ";
import {X1618WVS_164_9TV30} from "imports/X1618WVS_164_9TV30";
import {XXCBCLNANF_25M} from "imports/XXCBCLNANF_25M";

// Set false to temporarily hide both logos without changing their placements.
const showSilkscreenArtwork = true;

// Coordinates place the bottom-left of each group's footprint/courtyard bounds.
// Set offBoard: false when placing a group to enable its board-boundary checks.
// Root coordinates are board coordinates; / keys offset a subgroup within its parent.
// Connector-only sections are included so every part is controlled by this map.
export const pcbGroupPlacements = {
  BRIDGE_CORE: {pcbX: 23.5, pcbY: 83.7, offBoard: false}, // USB4 faces the upper-right USB-C connector; PCIe faces left.
  "BRIDGE_CORE/OSCILLATOR": {pcbX: 8.2798845, pcbY: 21.179998}, // Short crystal loop above XI/XO; all parts remain on top.
  BRIDGE_UART: {pcbX: 43.07, pcbY: 59.95, pcbRotation: 90, offBoard: false}, // UART below SPI, near the bridge and right edge.
  R_UART_TX: {pcbX: 47.54, pcbY: 58.4, pcbRotation: 180, offBoard: false}, // Continue the UART column, 2.54 mm below GND.
  LED_PSU_OK: {pcbX: 47.81655, pcbY: 28.05055, pcbRotation: 90, offBoard: false}, // Right-edge indicator beside its ATX control circuit.
  BRIDGE_SPI: {pcbX: 46.7, pcbY: 69.8, pcbRotation: 90, offBoard: false}, // Beside flash; same column as UART with 5.08 mm between their nearest holes.
  BRIDGE_RESET: {pcbX: 44.00435, pcbY: 107.9501, offBoard: false}, // Right-edge reset access immediately above USB-C; RC parts sit left of the button.

  // Top-only bypass banks leave the PCIe surface corridors clear.
  VCCH_DECOUPLING: {pcbX: 34.045, pcbY: 83.575, offBoard: false},
  VCCA33_DECOUPLING: {pcbX: 35.83435, pcbY: 88.545, offBoard: false},
  VCCL_DECOUPLING: {pcbX: 23.545, pcbY: 103.78, offBoard: false},
  VDD_DECOUPLING: {pcbX: 20.445, pcbY: 81.375, offBoard: false},
  "VDD_DECOUPLING/0": {pcbX: 1.0349, pcbY: 28.405},
  "VDD_DECOUPLING/1": {pcbX: 0, pcbY: 0},

  // A1/B1 are at native -X; 270 degrees puts the bracket end at the top.
  PCIE_LINK: {pcbX: 5, pcbY: 26.12, pcbRotation: 270, offBoard: false}, // Original position, 5 mm above ATX.
  // Clock links share identical top-side geometry beside A13/A14. The slower
  // control links and CLKREQ pull-up form a second column toward the bridge.
  R_PCIE_REFCLK_P: {pcbX: 15.58, pcbY: 100.03435, offBoard: false},
  R_PCIE_REFCLK_N: {pcbX: 16.78, pcbY: 100.03435, offBoard: false},
  R_PCIE_PERST: {pcbX: 16.43435, pcbY: 102.68, offBoard: false},
  R_PCIE_CLKREQ: {pcbX: 18.43435, pcbY: 104.98, offBoard: false},
  R_PCIE_CLKREQ_PU: {pcbX: 18.434355, pcbY: 106.58, offBoard: false},
  // Four top-side TX pairs in the left strip, beside slot B14/B15 through B27/B28.
  // Anchors use courtyard lower-left corners; centers share X=3 mm and 1.2 mm P/N pitch.
  C_TX0_P: {pcbX: 2.0799, pcbY: 98.4408, offBoard: false},
  C_TX0_N: {pcbX: 2.0799, pcbY: 97.2408, offBoard: false},
  C_TX1_P: {pcbX: 2.0799, pcbY: 93.4408, offBoard: false},
  C_TX1_N: {pcbX: 2.0799, pcbY: 92.2408, offBoard: false},
  C_TX2_P: {pcbX: 2.0799, pcbY: 89.4408, offBoard: false},
  C_TX2_N: {pcbX: 2.0799, pcbY: 88.2408, offBoard: false},
  C_TX3_P: {pcbX: 2.0799, pcbY: 85.4408, offBoard: false},
  C_TX3_N: {pcbX: 2.0799, pcbY: 84.2408, offBoard: false},
  PCIE_PRESENCE: {pcbX: 17, pcbY: 64.34, offBoard: false}, // Beside the slot's x8 presence contact, below the buck converters.
  SLOT_DECOUPLING: {pcbX: 15.55, pcbY: 104.66, offBoard: false}, // Original power-contact bypass position beside the slot.
  // One ceramic column beside the power contacts, with rail pads toward the slot.
  "SLOT_DECOUPLING/C132_PLACEMENT": {pcbX: 0, pcbY: 7}, // A2/A3, 12 V.
  "SLOT_DECOUPLING/C133_PLACEMENT": {pcbX: 0, pcbY: 3.5}, // Second 12 V bypass.
  "SLOT_DECOUPLING/C131_PLACEMENT": {pcbX: 0, pcbY: 0}, // A9/A10, 3.3 V.
  // Bulk capacitors sit side by side on the same centerline, outside the card zone.
  "SLOT_DECOUPLING/C134_PLACEMENT": {pcbX: 3.2, pcbY: 7.94},
  "SLOT_DECOUPLING/C135_PLACEMENT": {pcbX: 17.1, pcbY: 9.74},
  SLOT_POWER: {pcbX: 25.0, pcbY: 53.0, pcbRotation: 180, offBoard: false}, // Tuck the slot switches under the bucks toward the bridge; output capacitors stay at the slot.

  USB: {pcbX: 44.2, pcbY: 91.7, pcbRotation: 90, offBoard: false}, // Upper-right; cutout opens onto the right edge.
  USB4_LANES: {pcbX: 40.2, pcbY: 92.5653302, offBoard: false}, // Top-side banks, with bottom escapes returning before the ESD pads.
  USB_VBUS_SENSE: {pcbX: 37.434355, pcbY: 98.78, offBoard: false}, // Top-side filter outside the coupled USB4 corridors.
  ATX: {pcbX: 0, pcbY: 0, offBoard: false}, // Courtyard meets the bottom/left board edges.
  R_PSU_ON: {pcbX: 47.50435, pcbY: 23.28, offBoard: false}, // Below the PSU LED near ATX, with clearance for rework.
  // Local buck layouts keep VIN bypassing and the SW/inductor loops compact.
  // Align the upper VDD buck with VCCL, keeping their horizontal positions.
  VCCL_BUCK_INPUT: {pcbX: 21.995002, pcbY: 72.0, offBoard: false},
  VDD_BUCK_INPUT: {pcbX: 30.995002, pcbY: 72.0, offBoard: false},
  BUCK_ENABLE: {pcbX: 34, pcbY: 62, offBoard: false}, // Clear the slot-power switch and discharge resistor below the monitor.
  PSU_CONTROL: {pcbX: 39.5, pcbY: 22.11, offBoard: false}, // Bypass below VCC, clear of the SOT-23 courtyard; driver and resistors retain their positions.
} satisfies Record<string, PcbGroupPlacement>;

let renderedPlacementGroups: PcbPlacementGroups | undefined;
export function getRenderedPlacementGroups(): PcbPlacementGroups {
  if (!renderedPlacementGroups) throw new Error("Render the board before reading placement groups");
  return renderedPlacementGroups;
}

function groupPlacement(name: string): PcbGroupPlacement {
  const placement = (pcbGroupPlacements as Record<string, PcbGroupPlacement>)[name];
  if (!placement) throw new Error(`Add ${name} to pcbGroupPlacements`);
  return placement;
}

type PlacementContext = {
  name: string;
  offBoard: boolean;
  manualLayout: boolean;
  partIndex: number;
};

const pcbPartElements = new Set([
  "chip", "connector", "resistor", "capacitor", "inductor", "diode", "led",
  "mosfet", "transistor", "crystal", "resonator", "pushbutton", "pinheader",
]);

// Align actual rendered geometry after tscircuit's local layouts have finished,
// before placement checks, routing, or CAD generation. This also includes loose
// schematic sections, which do not have a native <group> element.
function bottomLeftGroupLayout() {
  let usb4Phase: AutoroutingPhase | undefined;
  let pciePhase: AutoroutingPhase | undefined;
  let usb2Phase: AutoroutingPhase | undefined;
  let clockPhase: AutoroutingPhase | undefined;
  const members = new Map<string, Set<string>>();
  const nativeGroups = new Map<string, Group>();
  const looseOffsets: PcbPlacementGroups["looseOffsets"] = {};
  const addPart = (group: string, part: string) => {
    if (!members.has(group)) members.set(group, new Set());
    members.get(group)!.add(part);
  };
  const attachBoard = (board: PcbBoard | null) => {
    if (!board) return;
    const original = board.doInitialPcbFlexRender.bind(board);
    board.doInitialPcbFlexRender = () => {
      original();
      if (board.root!.pcbDisabled) return;
      const json = board.root!.db.toArray();
      renderedPlacementGroups = {
        looseOffsets,
        members: Object.fromEntries([...members].map(([name, parts]) => [name, [...parts]])),
        nativeGroupIds: Object.fromEntries([...nativeGroups]
          .filter(([, group]) => group.pcb_group_id)
          .map(([name, group]) => [name, group.pcb_group_id!])),
      };
      applyPcbGroupPlacements(json, pcbGroupPlacements, renderedPlacementGroups);
      if (usb4Phase) prepareUsb4Routing(board, usb4Phase);
      if (pciePhase) preparePcieConnectorRouting(board, pciePhase);
      if (usb2Phase) prepareUsb2Routing(board, usb2Phase);
      if (clockPhase) prepareBridgeClockRouting(board, clockPhase);
      // Omit footprint outlines, but retain board artwork and the bridge's A1 corner marker.
      // Keep text, circular pin markers, and placement courtyards.
      const {db} = board.root!;
      const bridgeSource = db.source_component.list().find(part => part.name === "ASM2464PDX");
      const bridgePcb = db.pcb_component.list().find(part => part.source_component_id === bridgeSource?.source_component_id);
      for (const element of [...json]) {
        if (element.type === "pcb_silkscreen_path" && element.pcb_component_id && element.pcb_component_id !== bridgePcb?.pcb_component_id) {
          db.pcb_silkscreen_path.delete(element.pcb_silkscreen_path_id);
        }
        if (element.type === "pcb_silkscreen_rect") db.pcb_silkscreen_rect.delete(element.pcb_silkscreen_rect_id);
        if (element.type === "pcb_silkscreen_line") db.pcb_silkscreen_line.delete(element.pcb_silkscreen_line_id);
      }
    };
    // Convert resolved labels after placement and automatic text adjustment.
    const originalCadRender = board.doInitialCadModelRender.bind(board);
    board.doInitialCadModelRender = () => {
      originalCadRender();
      if (board.root!.pcbDisabled) return;
      const {db} = board.root!;
      if (showSilkscreenArtwork) {
        for (const graphic of flamingoSilkscreen({pcbX: 42, pcbY: 49, pcbRotation: 130})) db.pcb_silkscreen_graphic.insert(graphic);
        // Companion badge between the PSU_OK LED and flamingo, in board coordinates.
        for (const graphic of tsMarkSilkscreen({pcbX: 44.5, pcbY: 36.5, pcbRotation: 90})) db.pcb_silkscreen_graphic.insert(graphic);
      }
      for (const text of [...db.pcb_silkscreen_text.list()]) {
        const graphics = outlineSilkscreenText(text);
        for (const graphic of graphics) db.pcb_silkscreen_graphic.insert(graphic);
        db.pcb_silkscreen_text.delete(text.pcb_silkscreen_text_id);
      }
    };
  };
  return {addPart, nativeGroups, looseOffsets, attachBoard,
    attachUsb4Phase: (phase: AutoroutingPhase | null) => { if (phase) usb4Phase = phase; },
    attachUsb2Phase: (phase: AutoroutingPhase | null) => { if (phase) usb2Phase = phase; },
    attachClockPhase: (phase: AutoroutingPhase | null) => { if (phase) clockPhase = phase; },
    attachPciePhase: (phase: AutoroutingPhase | null) => { if (phase) pciePhase = phase; }};
}

// Resolve pure component functions to apply group positions from this file only.
// Footprint props are left intact, including their local pad coordinates.
function placePcbGroups(
  node: ReactNode,
  context?: PlacementContext,
  loosePartCounts: Record<string, number> = {},
  layout = bottomLeftGroupLayout(),
): ReactNode {
  if (Array.isArray(node)) return node.map(child => placePcbGroups(child, context, loosePartCounts, layout));
  if (!isValidElement<Record<string, unknown>>(node)) return node;
  if (typeof node.type === "function") {
    return placePcbGroups(
      (node.type as (props: Record<string, unknown>) => ReactNode)(node.props), context, loosePartCounts, layout,
    );
  }

  const props = node.props;
  if (typeof node.type === "string" && pcbPartElements.has(node.type)) {
    const capacitorStyle = node.type === "capacitor" ? {
      pcbStyle: {...props.pcbStyle as Record<string, unknown>, silkscreenTextVisibility: "hidden"},
    } : {};
    // Individual references listed in the map override schematic-section grouping.
    const partName = String(props.name);
    const name = context?.name ?? (partName in pcbGroupPlacements ? partName : String(props.schSectionName));
    layout.addPart(name, partName);
    if (context) {
      const index = context.partIndex++;
      return cloneElement(node, {
        ...capacitorStyle,
        // Groups containing independently positioned subgroups cannot be packed.
        // Give their remaining parts a preliminary local layout instead.
        ...(context.manualLayout && props.pcbX === undefined && props.pcbY === undefined
          ? {pcbX: (index % 3) * 12 - 12, pcbY: -Math.floor(index / 3) * 12}
          : {}),
        allowOffBoard: context.offBoard,
      });
    }

    // Other loose parts on a sheet move together by schematic section.
    const placement = groupPlacement(name);
    const index = loosePartCounts[name] ?? 0;
    loosePartCounts[name] = index + 1;
    const localX = name === "BRIDGE_UART" ? -index * 8 : (index % 4) * 4;
    const localY = name === "BRIDGE_UART" ? index * 6 : -Math.floor(index / 4) * 4;
    const angle = (placement.pcbRotation ?? 0) * Math.PI / 180;
    const x = localX * Math.cos(angle) - localY * Math.sin(angle);
    const y = localX * Math.sin(angle) + localY * Math.cos(angle);
    layout.looseOffsets[partName] = {x, y};
    return cloneElement(node, {
      ...capacitorStyle,
      pcbX: x,
      pcbY: y,
      pcbRotation: (placement.pcbRotation ?? 0) + Number(props.pcbRotation ?? 0),
      allowOffBoard: placement.offBoard ?? true,
    });
  }

  const isGroup = node.type === "group" || node.type === "subcircuit";
  let groupProps = {};
  if (isGroup) {
    const name = context
      ? `${context.name}/${props.name ?? node.key}`
      : String(props.name);
    const placement = groupPlacement(name);
    const manualLayout = Object.keys(pcbGroupPlacements).some(key => key.startsWith(`${name}/`));
    context = {
      name,
      offBoard: placement.offBoard ?? context?.offBoard ?? true,
      manualLayout,
      partIndex: 0,
    };
    groupProps = {
      ref: (group: Group | null) => { if (group) layout.nativeGroups.set(name, group); },
      // Pack at a stable local origin. Moving an anchor must not repack other groups.
      pcbX: 0,
      pcbY: 0,
      pcbRotation: placement.pcbRotation ?? 0,
      ...(placement.pcbGrid ? {
        pcbGrid: true,
        pcbGridCols: placement.pcbGridCols,
        pcbGridGap: placement.pcbGridGap,
      } : {}),
      ...(manualLayout ? {pcbRelative: true} : {}),
    };
  }
  const children = props.children === undefined ? undefined
    : Children.map(props.children as ReactNode, child => placePcbGroups(child, context, loosePartCounts, layout));
  return cloneElement(node, {
    ...groupProps,
    ...(node.type === "board" ? {pcbRelative: true, ref: layout.attachBoard} : {}),
    ...(node.type === "autoroutingphase" && props.name === "USB4_FIXED" ? {ref: layout.attachUsb4Phase} : {}),
    ...(node.type === "autoroutingphase" && props.name === "PCIE_TX_CONNECTOR" ? {ref: layout.attachPciePhase} : {}),
    ...(node.type === "autoroutingphase" && props.name === "USB2_FIXED" ? {ref: layout.attachUsb2Phase} : {}),
    ...(node.type === "autoroutingphase" && props.name === "BRIDGE_CLOCKS" ? {ref: layout.attachClockPhase} : {}),
    ...(props.children === undefined ? {} : {children}),
  });
}

// The slot is mechanically x16; the bridge supplies four PCIe lanes.
const unusedPcieLanes = ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const)
  .flatMap(lane => [`TX${lane}_P`, `TX${lane}_N`, `RX${lane}_P`, `RX${lane}_N`] as const);
const unusedPcieSideband = [
  "JTAG_TCK", "JTAG_TDI", "JTAG_TDO", "JTAG_TMS", "JTAG_TRST_N",
  "SMB_CLK", "SMB_DATA", "PWRBRK_N",
  "RSVD_A19", "RSVD_A32", "RSVD_A33", "RSVD_A50", "RSVD_B82",
] as const;

export default function Board() {
  return placePcbGroups(
    <board
      {...jlcpcbBoardRules}
      autorouter={{...jlcpcbBoardRules.autorouter, allowViaInPad: true}}
      isViaInPadAllowed={true}
      enableViaStitching={true} viaStitchPitch={0.7}
      // Top view in millimeters: +X right, +Y up. ATX remains on the bottom edge.
      // Original outline, without added M3 mounting holes or screw keepouts.
      width="52.5mm"
      height="123.62mm"
      boardAnchorAlignment="bottom_left"
      boardAnchorPosition={{x: 0, y: 0}}
      routeRemaining={false}
      layers={6}
      // Nominal order thickness. The selected JLC06161H-3313 fabrication
      // recipe and its 1.54 mm calculator value are in manufacturing/stackup/.
      thickness="1.6mm"
      schLayout={{ layoutMode: "none" }}
    >
      {/* Converted to the same Iosevka Term outlines as the component labels. */}
      <silkscreentext text="rev 1" pcbX={48.9} pcbY={36.5} pcbRotation={90} fontSize={0.8}
        layer="top" anchorAlignment="center"/>
      <net name="GND"/>
      {/* Nominal 0.21 mm via drill-edge clearance. The emitted-polygon check
          enforces 0.20 mm, including the polygon approximation of apertures. */}
      <copperpour name="GND_L2" connectsTo="net.GND" layer="inner1" clearance="0.2mm" padMargin={.16} cutoutMargin={.215} boardEdgeMargin="0.2mm"/>
      <copperpour name="GND_L5" connectsTo="net.GND" layer="inner4" clearance="0.2mm" padMargin={.16} cutoutMargin={.215} boardEdgeMargin="0.2mm"/>
      {usbGuardBands.flatMap(band=>band.layers.map(layer=><Fragment key={`usb-shield-${layer}-${band.name}`}><copperpour
        name={`USB_SHIELD_${layer}_${band.name}`} connectsTo="net.GND" layer={layer}
        clearance={0.8} traceMargin={0.8} padMargin={0.1} boardEdgeMargin={0.1} useThermalReliefs={false}
        outline={band.outline}/></Fragment>))}
      {usbShieldFences.flat().filter((p,i,all)=>all.findIndex(q=>q.x===p.x&&q.y===p.y)===i)
        .filter(p=>!(p.x===40.5&&p.y===102.8||p.x===40.9&&p.y===95.7)).map(({x,y},i)=><Fragment key={`usb-fence-${i}`}>
        <via name={`USB_SHIELD_FENCE_${i}`} pcbX={x} pcbY={y} fromLayer="top" toLayer="bottom"
          holeDiameter={.2} outerDiameter={.3} connectsTo="net.GND"/>
      </Fragment>)}
      <autoroutingphase name="USB4_FIXED" phaseIndex={0}
        minTraceWidth={usb4Rules.neckWidth}
        connections={usb4RoutedContacts.flatMap(({name, ball}) => [`ASM2464PDX.${ball}`, `C_USB_${name}.pin1`])}
        pcbTracePaths={[]}/>
      <PcieConnectorRouting/>
      <PsuStatusRouting/>
      <Usb2Routing/>
      <BridgeClockRouting/>
      {/* Local return vias bridge the two GND references beside row transitions. */}
      {[[42.65, 100.74475],
        [40.9, 95.7], [40.2, 97.9], [40.5, 102.8],
        [45.875, 99.75], [45.875, 101.65], [45.875, 97.75], [45.2, 95.8]].map(([x, y], i) =>
        <Fragment key={`usb-return-${i}`}><via name={`USB4_GND_RETURN_${i}`} pcbX={x} pcbY={y}
          fromLayer="top" toLayer="bottom" holeDiameter={0.2} outerDiameter={0.35} connectsTo="net.GND"/></Fragment>)}
      {/* Filled/capped GND vias flank the fine-pitch USB4 launches on both columns. */}
      {[98.3200065, 99.2400065, 100.1600065, 101.0800065, 102.0000065].flatMap((y, row) =>
        [33.64, 34.1].filter(x => x === 33.64 || row !== 1 && row !== 3).map((x, column) => <Fragment key={`usb-bga-return-${row}-${column}`}><via
          name={`USB4_BGA_GND_${row}_${column}`} pcbX={x} pcbY={y}
          fromLayer="top" toLayer="bottom" holeDiameter={usb4Rules.bgaViaHole}
          outerDiameter={usb4Rules.bgaViaDiameter} connectsTo="net.GND"/></Fragment>))}
      {usb4RoutedContacts.map(({name, ball, contact}) => <Fragment key={`route-${name}`}>
        <trace name={`USB4_${name}_PHY_A`} from={`ASM2464PDX.${ball}`} to={`D_USB_${name}.pin1`}
          routingPhaseIndex={0} {...usb4TraceRules}/>
        <trace name={`USB4_${name}_PHY_B`} from={`D_USB_${name}.pin1`} to={`C_USB_${name}.pin2`}
          routingPhaseIndex={0} {...usb4TraceRules}/>
        <trace name={`USB4_${name}_CON_A`} from={`C_USB_${name}.pin1`} to={`R_USB_${name}.pin1`}
          routingPhaseIndex={0} {...usb4TraceRules}/>
        <trace name={`USB4_${name}_CON_B`} from={`R_USB_${name}.pin1`} to={`USBC.${contact}`}
          routingPhaseIndex={0} {...usb4TraceRules}/>
      </Fragment>)}
      <net name="GNDA" connectsTo={["net.GND"]}/>
      <net name="VDD"/>
      <net name="VCCH"/>
      <net name="VCCA33"/>
      <net name="VCCL"/>
      <net name="BUCK_EN"/>
      <net name="VCCH_SENSE"/>

      <net name="V5V"/>
      <net name="V5VSB"/>
      <net name="V12V"/>
      <net name="ATX_PWR_OK"/>
      <net name="SLOT_3V3"/>
      <net name="SLOT_12V"/>
      <net name="ASM_HDDPC" connectsTo={[".ASM2464PDX > .HDDPC"]}/>
      <net name="USB_VBUS"/>
      <net name="USB_VBUS_SENSE" connectsTo={[".ASM2464PDX > .VBUS"]}/>
      <net name="ASM_PERST0_N" connectsTo={[".ASM2464PDX > .PERST0"]}/>
      <net name="ASM_RST_N" connectsTo={[".ASM2464PDX > .RST"]}/>
      <net name="ASM_REFCLK_P0" connectsTo={[".ASM2464PDX > .REFCLK_P0"]}/>
      <net name="ASM_REFCLK_N0" connectsTo={[".ASM2464PDX > .REFCLK_N0"]}/>
      <net name="ASM_CLKREQ_N" connectsTo={[".ASM2464PDX > .GPIO8"]}/>
      <net name="ASM_WAKE_N" connectsTo={[".ASM2464PDX > .GPIO22"]}/>
      <net name="ASM_PRESENT_N" connectsTo={[".ASM2464PDX > .GPIO2"]}/>
      <net name="PCIE_PRESENT_N"/>
      {usb4Signals.map(signal => (
        <Fragment key={signal.name}>
          <net
            name={`ASM_${signal.bridgePin}`}
            connectsTo={[`.ASM2464PDX > .${signal.bridgePin}`]}
          />
        </Fragment>
      ))}
      {/* Named nets carry PCIe lanes between the bridge and connector sheets. */}
      {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).flatMap(polarity => (
        ["TX", "RX"].map(direction => (
          <Fragment key={`ASM_P${direction}${polarity}${lane}`}>
            <net
              name={`ASM_P${direction}${polarity}${lane}`}
              connectsTo={[`.ASM2464PDX > .P${direction}${polarity}${lane}`]}
              routingPhaseIndex={1} nominalTraceWidth={pcieConnectorRules.width}
            />
          </Fragment>
        ))
      )))}

      {[
        ["ASM_UART_TX", "UART_TX"], ["ASM_UART_RX", "UART_RX"],
        ["ASM_SPI_CS_N", "SPI_CS"], ["ASM_SPI_CLK", "SPI_CLK"],
        ["ASM_SPI_MOSI", "SPI_DO"], ["ASM_SPI_MISO", "SPI_DI"],
        ["ASM_XI", "XI"], ["ASM_XO", "XO"],
      ].map(([name, pin]) => (
        <Fragment key={name}>
          <net name={name} connectsTo={[`.ASM2464PDX > .${pin}`]}/>
        </Fragment>
      ))}

      {[
        {net: "ASM_CC1", pin: "CC1", contacts: ["A5"]},
        {net: "ASM_CC2", pin: "CC2", contacts: ["B5"]},
        {net: "ASM_SBU1", pin: "SBU1", contacts: ["A8"]},
        {net: "ASM_SBU2", pin: "SBU2", contacts: ["B8"]},
        {net: "USB_D_P", pin: "UDP", contacts: ["A6", "B6"]},
        {net: "USB_D_N", pin: "UDM", contacts: ["A7", "B7"]},
      ].map(({net, pin, contacts}) => (
        <Fragment key={net}>
          <netlabel inline net={net} connectsTo={[
            `.ASM2464PDX > .${pin}`,
            ...contacts.map(contact => `.USBC > .${contact}`),
          ]}/>
        </Fragment>
      ))}
      <netlabel inline net="ASM_TEST_EN" connectsTo={[".ASM2464PDX > .TEST_EN", ".R_TEST_EN > .pin1"]}/>
      <netlabel inline net="USB_VBUS_SENSE" connection=".ASM2464PDX > .VBUS"/>

      <schematicsheet name="bridge" sheetIndex={1} sheetSize="ANSI_B">
        {/* Fixed section dividers keep the centered clusters independent of their bounds. */}
        <schematicline x1={-4} y1={-10} x2={-4} y2={8}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={4.5} y1={-10} x2={4.5} y2={8}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={-4} y1={-1.5} x2={25} y2={-1.5}
          strokeWidth={0.02} color="#000000" isDashed/>
        {[
          {text: "Chip", x: -17.3, y: 7.8},
          {text: "UART", x: -3.8, y: 7.8},
          {text: "SPI", x: 4.7, y: 7.8},
          {text: "Crystal Oscillator", x: -3.8, y: -1.7},
          {text: "Bridge Reset", x: 4.7, y: -1.7},
        ].map(({text, x, y}) => (
          <Fragment key={text}>
            <schematictext text={text} schX={x} schY={y}
              fontSize={0.18} anchor="top_left"/>
          </Fragment>
        ))}
        {/* PCB positions for these loose sections are in pcbGroupPlacements. */}
        <UartHeader
          name="UART"
          schSectionName="BRIDGE_UART"
          schX={1.8}
          schY={3.1}
          connections={{
            GND: "net.GND",
            TX: "net.ASM_UART_TX",
            RX: "net.ASM_UART_RX",
          }}
        />
        {/* UART_TX is sampled as MEMREPAIR at startup (ASMedia section 5.1).
            The R_UART_TX map entry places its pull-up directly below the header. */}
        <resistor
          name="R_UART_TX"
          schSectionName="BRIDGE_UART"
          pcbRotation={0}
          resistance="4.7k"
          footprint="0402_nosilkscreen"
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          manufacturerPartNumber="0402WGF4701TCE"
          supplierPartNumbers={{jlcpcb: ["C25900"]}}
          schX={-1.2}
          schY={5.1}
          schOrientation="vertical"
          connections={{pin1: "net.VCCH", pin2: "net.ASM_UART_TX"}}
        />
        <netlabel inline net="VCCH" connection="R_UART_TX.pin1"/>
        <group name="BRIDGE_CORE" schX={-12} schY={-3} pcbPackGap="3mm" pcbPadding="2mm"
          pcbStyle={{silkscreenTextVisibility: "hidden"}}>
          <ASM2464PDX schSectionName="BRIDGE_CHIP" pcbX={0} pcbY={0} pcbRotation={180}/>
          {[
            "UART_TX is sampled at power-on.",
            "High enables internal memory repair (MEMREPAIR).",
            "The 4.7k pull-up allows normal UART output.",
            "ASMedia datasheet, section 5.1.",
          ].map((text, index) => (
            <Fragment key={text}>
              <schematictext text={text} schX={9.8} schY={4.6 - index * 0.32}
                fontSize={0.18} anchor="left"/>
            </Fragment>
          ))}
          <RC0402FR_0712K1L
            name="R_RST_N"
            pcbX={3.5} pcbY={11}
            schSectionName="BRIDGE_CHIP"
            schX={6}
            schY={-2.3}
            schRotation={-90}
            connections={{pin1: ".ASM2464PDX > .REXT", pin2: "net.GND"}}
          />
          {/* Match the reference design: hold TEST_EN low during normal operation. */}
          <resistor
            name="R_TEST_EN"
            pcbX={9.3} pcbY={9}
            schSectionName="BRIDGE_CHIP"
            resistance="4.7k"
            footprint="0402"
            manufacturerPartNumber="0402WGF4701TCE"
            supplierPartNumbers={{jlcpcb: ["C25900"]}}
            schX={6}
            schY={0.6}
            schOrientation="vertical"
            connections={{pin1: ".ASM2464PDX > .TEST_EN", pin2: "net.GND"}}
          />
          <W25Q32JVSSIQ
            name="W25Q32JVSSIQ"
            pcbX={-0.8} pcbY={-10.8} pcbRotation={90}
            schSectionName="BRIDGE_SPI"
            schX={23}
            schY={6.3}
            schPinArrangement={{
              leftSide: {direction: "top-to-bottom", pins: [3, 1, 2, 4]},
              rightSide: {direction: "top-to-bottom", pins: [8, 7, 6, 5]},
            }}
            connections={{
              N_CS: ".ASM2464PDX > .SPI_CS",
              MISO: ".ASM2464PDX > .SPI_DI",
              MOSI: ".ASM2464PDX > .SPI_DO",
              CLK: ".ASM2464PDX > .SPI_CLK",
              GND: "net.GND",
              // The flash and bridge SPI I/O use 3.3 V, not the 1.13 V core rail.
              VCC: "net.VCCH",
            }}
          />
          {/* Standard SPI: bias WP/IO2 and unused IO3 high through separate pull-ups. */}
          <A_0402WGF1002TCE
            name="R_SPI_WP"
            pcbX={-4} pcbY={-7.1}
            schSectionName="BRIDGE_SPI"
            schX={19}
            schY={8.8}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".W25Q32JVSSIQ > .WP"}}
          />
          <netlabel inline net="VCCH" connection="R_SPI_WP.pin1"/>
          <netlabel inline net="W25Q32JVSSIQ_WP" connectsTo={["R_SPI_WP.pin2", "W25Q32JVSSIQ.WP"]}/>
          {/* Winbond recommends an IO3 pull-up for non-Quad use:
              https://winbond.com/hq/support/faq/technical/?__locale=en
              We choose 10k to match CS; the FAQ specifies 10k explicitly only for CS. */}
          <A_0402WGF1002TCE
            name="R_SPI_HOLD"
            pcbX={-2} pcbY={-7.1} pcbRotation={180}
            schSectionName="BRIDGE_SPI"
            schX={27}
            schY={6.3}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".W25Q32JVSSIQ > .HOLD"}}
          />
          {[
            "Pin 7 is unused IO3 in this standard SPI design.",
            "The 10k pull-up keeps it at a defined high level.",
            "Winbond recommends a pull-up for non-Quad use.",
            "IQ option: QE=1, so the HOLD function is disabled.",
            "W25Q32JV pp. 9, 16; Winbond technical FAQ.",
          ].map((text, index) => (
            <Fragment key={`hold-note-${index}`}>
              <schematictext text={text} schX={19} schY={4.3 - index * 0.32}
                fontSize={0.18} anchor="left"/>
            </Fragment>
          ))}
          <A_0402WGF1002TCE
            name="R_SPI_CS"
            pcbX={0} pcbY={-7.1}
            schSectionName="BRIDGE_SPI"
            schX={22}
            schY={8.8}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: ".W25Q32JVSSIQ > .N_CS"}}
          />
          <netlabel inline net="VCCH" connection="R_SPI_CS.pin1"/>
          <netlabel inline net="ASM_SPI_CS_N" connectsTo={["R_SPI_CS.pin2", "W25Q32JVSSIQ.N_CS"]}/>
          {/* C73 on ASMedia's reference schematic, sheet 3, is also 100nF. */}
          <CL05B104KO5NNNC
            name="C_SPI_VCC"
            pcbX={5} pcbY={-10.8} pcbRotation={90}
            schSectionName="BRIDGE_SPI"
            schX={26}
            schY={8.8}
            schOrientation="vertical"
            connections={{pin1: "net.VCCH", pin2: "net.GND"}}
          />
          <netlabel inline net="VCCH" connection="C_SPI_VCC.pin1"/>
          <netlabel inline net="GND" connection="C_SPI_VCC.pin2"/>
          <group name="OSCILLATOR" schX={10.75} schY={-2.85} pcbRelative>
            <XXCBCLNANF_25M
              name="XCLK" pcbX={0} pcbY={0} pcbRotation={270} layer="top"
              connections={{pin2:"net.GND",pin4:"net.GND"}}
              schSectionName="BRIDGE_OSCILLATOR"
              schX={0}
              schY={0}
              loadCapacitance="10pF"
            />
            <TCC0402COG100J500AT name="C1" pcbX={-3.3} pcbY={-1.6} layer="top" schSectionName="BRIDGE_OSCILLATOR"
              schX={3} schY={0} schOrientation="vertical"/>
            <netlabel inline net="ASM_XI" connection="C1.pin1"/>
            <netlabel inline net="ASM_XO" connection="C1.pin2"/>
          </group>
        </group>
        <BridgeReset/>
        <SpiProgrammingHeader
          name="SPI"
          schSectionName="BRIDGE_SPI"
          schX={21}
          schY={3.3}
          connections={{
            RST_N: "net.ASM_RST_N",
            GND: "net.GND",
            V3V3: "net.VCCH",
            CS_N: ".W25Q32JVSSIQ > .N_CS",
            CLK: ".W25Q32JVSSIQ > .CLK",
            MOSI: ".W25Q32JVSSIQ > .MOSI",
            MISO: ".W25Q32JVSSIQ > .MISO",
          }}
        />
        {[
          "SPI programming access: custom 1x7 pinout, 2.54mm pitch.",
          "Jumper RST_N to adjacent GND to hold the bridge in reset.",
          "Power the board normally. Leave programmer 3V3 disconnected.",
          "Shared SPI bus: SPI output release during reset remains unverified.",
        ].map((text, index) => (
          <Fragment key={`spi-programming-note-${index}`}>
            <schematictext text={text} schX={18} schY={1.3 - index * 0.32}
              fontSize={0.18} anchor="left"/>
          </Fragment>
        ))}
      </schematicsheet>
      <schematicsheet name="bridge_decoupling" displayName="Bridge Decoupling" sheetIndex={2}>
        {/* Center each capacitor bank within its section. */}
        <schematicline x1={-14} y1={3.5} x2={14} y2={3.5}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={-14} y1={-3.5} x2={14} y2={-3.5}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={5.2} y1={10.2} x2={5.2} y2={3.5}
          strokeWidth={0.02} color="#000000" isDashed/>
        <BridgeVcchDecoupling/>
        <BridgeVcca33Decoupling/>
        <BridgeVcclDecoupling/>
        <BridgeVddDecoupling/>
      </schematicsheet>
      <schematicsheet name="pcie" displayName="PCIe x4" sheetIndex={5} sheetSize="ANSI_B">
        {/* Keep these dividers fixed when the component columns change width. */}
        <schematicline x1={-12.3} y1={1.6} x2={1.5} y2={1.6}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={-6.2} y1={1.6} x2={-6.2} y2={-9.2}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={-12.3} y1={-9.2} x2={1.5} y2={-9.2}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematicline x1={1.5} y1={8.1} x2={1.5} y2={-13.8}
          strokeWidth={0.02} color="#000000" isDashed/>
        <schematictext text="0 Ω control links" schX={-11.8} schY={1.4}
          fontSize={0.18} anchor="top_left"/>
        <schematictext text="AC-coupling capacitors" schX={-5.8} schY={1.4}
          fontSize={0.18} anchor="top_left"/>
        <schematictext text="PCIe x4 connection" schX={-11.6} schY={8.4} fontSize={0.18} anchor="left"/>
        <X1618WVS_164_9TV30
          name="PCIe"
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          schSectionName="PCIE_LINK"
          schX={-4.98}
          schY={4.6}
          schWidth={3.1}
          schHeight={3.645}
          // Hide unused contacts in this schematic view; physical pads and NCs remain.
          schPinArrangement={{
            leftSide: {direction: "top-to-bottom", pins: ["PERST_N", "REFCLK_P", "REFCLK_N", "CLKREQ_N", "WAKE_N", "RX0_P", "RX0_N", "RX1_P", "RX1_N", "RX2_P", "RX2_N", "RX3_P", "RX3_N"]},
            rightSide: {direction: "top-to-bottom", pins: ["TX0_P", "TX0_N", "TX1_P", "TX1_N", "TX2_P", "TX2_N", "TX3_P", "TX3_N", "PRSNT1_N", "PRSNT2_X1_N", "PRSNT2_X4_N", "PRSNT2_X8_N", "PRSNT2_X16_N"]},
            topSide: {direction: "left-to-right", pins: ["V12V", "V3V3", "V3V3_AUX"]},
            bottomSide: {direction: "left-to-right", pins: ["GND"]},
          }}
          // B10 is NC because this design does not support standby wake.
          noConnect={[...unusedPcieLanes, ...unusedPcieSideband, "V3V3_AUX"]}
          connections={{
            GND: "net.GND",
            V12V: "net.SLOT_12V",
            V3V3: "net.SLOT_3V3",
            WAKE_N: "net.ASM_WAKE_N",
            PRSNT1_N: "net.GND",
            PRSNT2_X1_N: "net.PCIE_PRESENT_N",
            PRSNT2_X4_N: "net.PCIE_PRESENT_N",
            PRSNT2_X8_N: "net.PCIE_PRESENT_N",
            PRSNT2_X16_N: "net.PCIE_PRESENT_N",
            RX0_P: "net.ASM_PRXP0",
            RX0_N: "net.ASM_PRXN0",
            RX1_P: "net.ASM_PRXP1",
            RX1_N: "net.ASM_PRXN1",
            RX2_P: "net.ASM_PRXP2",
            RX2_N: "net.ASM_PRXN2",
            RX3_P: "net.ASM_PRXP3",
            RX3_N: "net.ASM_PRXN3",
          }}
        />
        <netlabel inline net="SLOT_12V" connection="PCIe.V12V"/>
        <netlabel inline net="SLOT_3V3" connection="PCIe.V3V3"/>
        {[
          {pin: "PERST_N", resistor: "R_PCIE_PERST"},
          {pin: "REFCLK_P", resistor: "R_PCIE_REFCLK_P"},
          {pin: "REFCLK_N", resistor: "R_PCIE_REFCLK_N"},
          {pin: "CLKREQ_N", resistor: "R_PCIE_CLKREQ"},
        ].map(({pin, resistor}) => (
          <Fragment key={`compact-${pin}`}>
            <netlabel inline net={`PCIE_${pin}`} connection={`PCIe.${pin}`}/>
            <netlabel inline net={`PCIE_${pin}`} connection={`${resistor}.pin2`}/>
          </Fragment>
        ))}
        <netlabel inline net="PCIE_CLKREQ_N" connection="R_PCIE_CLKREQ_PU.pin2"/>
        {/* ASMedia reference sheet 6, R173: removable series link to slot A11. */}
        <A_0402WGF0000TCE
          schSectionName="PCIE_CONTROL"
          name="R_PCIE_PERST"
          layer="top" pcbRotation={180}
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          schX={-9.2}
          schY={0.2}
          connections={{
            pin1: "net.ASM_PERST0_N",
            pin2: ".PCIe > .PERST_N",
          }}
        />
        <netlabel inline
          net="ASM_PERST0_N"
          connection="R_PCIE_PERST.pin1"
        />
        {/* One x4 link uses clock pair 0. ASMedia sheet 6: R180 (P), R178 (N). */}
        {(["P", "N"] as const).map((polarity, index) => (
          <Fragment key={`PCIE_REFCLK_${polarity}`}>
            <A_0402WGF0000TCE
              schSectionName="PCIE_CONTROL"
              name={`R_PCIE_REFCLK_${polarity}`}
              layer="top" pcbRotation={270}
              pcbStyle={{silkscreenTextVisibility: "hidden"}}
              schX={-9.2}
              schY={-0.6 - index * 0.8}
            />
            <netlabel inline
              net={`ASM_REFCLK_${polarity}0`}
              connection={`R_PCIE_REFCLK_${polarity}.pin1`}
            />
          </Fragment>
        ))}
        {/* ASMedia reference sheet 6: R207 series link and R205 10k pull-up. */}
        <A_0402WGF0000TCE
          schSectionName="PCIE_CONTROL"
          name="R_PCIE_CLKREQ"
          layer="top" pcbRotation={180}
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          schX={-9.2}
          schY={-2.2}
          connections={{
            pin1: "net.ASM_CLKREQ_N",
            pin2: "net.PCIE_CLKREQ_N",
          }}
        />
        <netlabel inline
          net="ASM_CLKREQ_N"
          connection="R_PCIE_CLKREQ.pin1"
        />
        <A_0402WGF1002TCE
          schSectionName="PCIE_CONTROL"
          name="R_PCIE_CLKREQ_PU"
          layer="top" pcbRotation={180}
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          schX={-9.2}
          schY={-4.1}
          schOrientation="vertical"
          connections={{
            pin1: "net.VCCH",
            pin2: "net.PCIE_CLKREQ_N",
          }}
        />
        <netlabel inline
          net="VCCH"
          connection="R_PCIE_CLKREQ_PU.pin1"
        />
        <netlabel inline
          net="ASM_WAKE_N"
          connection="PCIe.WAKE_N"
        />
        {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).map(polarity => (
          <Fragment key={`PCIE_RX${lane}_${polarity}`}>
            <netlabel inline
              net={`ASM_PRX${polarity}${lane}`}
              connection={`PCIe.RX${lane}_${polarity}`}
            />
          </Fragment>
        )))}
        {/* ASMedia's PCIe guide places our TX coupling near the slot connector.
            The card supplies its own TX capacitors for the reverse direction. */}
        {[0, 1, 2, 3].flatMap(lane => (["P", "N"] as const).map((polarity, index) => (
          <Fragment key={`PCIE_TX${lane}_${polarity}`}>
            <netlabel inline net={`PCIE_TX${lane}_${polarity}`} connection={`PCIe.TX${lane}_${polarity}`}/>
            <netlabel inline net={`PCIE_TX${lane}_${polarity}`} connection={`C_TX${lane}_${polarity}.pin2`}/>
            <CL05B224KO5NNNC
              schSectionName="PCIE_AC_COUPLING"
              name={`C_TX${lane}_${polarity}`}
              schOrientation="neg_left"
              schX={-3}
              schY={0.2 - lane * 2.2 - index * 1.1}
              pcbRotation={0}
              layer="top"
              pcbStyle={{silkscreenTextVisibility: "hidden"}}
            />
            <netlabel inline
              net={`ASM_PTX${polarity}${lane}`}
              connection={`C_TX${lane}_${polarity}.pin1`}
            />
          </Fragment>
        )))}
        <schematictext
          text="TX capacitors: 220nF / 16V X7R, Samsung CL05B224KO5NNNC."
          schX={-5.5}
          schY={-8.5}
          fontSize={0.18}
          anchor="left"
        />
        <schematictext text="Card Presence" schX={-11.8} schY={-9.4}
          fontSize={0.18} anchor="top_left"/>
        <netlabel inline net="GND" connection="PCIe.PRSNT1_N"/>
        {(["X1", "X4", "X8", "X16"] as const).map(size => (
          <Fragment key={`PCIE_PRESENT_${size}`}>
            <netlabel inline net="PCIE_PRESENT_N" connection={`PCIe.PRSNT2_${size}_N`}/>
          </Fragment>
        ))}
        {/* ASMedia sheet 6 uses 4.7k pull-ups (R183/R196) and removable sense links. */}
        <resistor
          name="R_PCIE_PRESENT_PU"
          schSectionName="PCIE_PRESENCE"
          pcbRotation={0}
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          resistance="4.7k"
          tolerance="1%"
          footprint="0402"
          manufacturerPartNumber="0402WGF4701TCE"
          supplierPartNumbers={{jlcpcb: ["C25900"]}}
          schX={-8.5}
          schY={-10.8}
          schOrientation="vertical"
          connections={{pin1: "net.VCCH", pin2: "net.PCIE_PRESENT_N"}}
        />
        <netlabel inline net="VCCH" connection="R_PCIE_PRESENT_PU.pin1"/>
        <netlabel inline net="PCIE_PRESENT_N" connection="R_PCIE_PRESENT_PU.pin2"/>
        <A_0402WGF0000TCE
          name="R_PCIE_PRESENT"
          schSectionName="PCIE_PRESENCE"
          pcbRotation={180}
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          schX={-3.5}
          schY={-12.3}
          connections={{pin1: "net.ASM_PRESENT_N", pin2: "net.PCIE_PRESENT_N"}}
        />
        <netlabel inline net="ASM_PRESENT_N" connection="R_PCIE_PRESENT.pin1"/>
        <netlabel inline net="PCIE_PRESENT_N" connection="R_PCIE_PRESENT.pin2"/>
        {/* Include the switch block's local subcircuit in the page bounds without a visible frame. */}
        <schematicrect schX={8.7} schY={-2.7} width={14.4} height={18.2} strokeWidth={0} color="transparent"/>

        <SlotDecoupling/>
        <SlotPower/>
      </schematicsheet>

      <schematicsheet name="usb" sheetIndex={4}>
        <schematicsection name="USB" displayName="USB4 Receptacle"/>
        <GT_USB_7087B
          name="USBC"
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          // Reserve room for the connector courtyard during automatic packing.
          pcbMarginX="1mm"
          pcbMarginY="1mm"
          schSectionName="USB"
          schX={0}
          schY={0}
          connections={{
            A1: "net.GND", A12: "net.GND", B1: "net.GND", B12: "net.GND",
            A4: "net.USB_VBUS", A9: "net.USB_VBUS", B4: "net.USB_VBUS", B9: "net.USB_VBUS",
            A5: ".ASM2464PDX > .CC1", B5: ".ASM2464PDX > .CC2",
            A8: ".ASM2464PDX > .SBU1", B8: ".ASM2464PDX > .SBU2",
            // These nets connect through Usb4Lanes to the corresponding bridge pins.
            A2: "net.USB_TX1_P", A3: "net.USB_TX1_N",
            B2: "net.USB_TX2_P", B3: "net.USB_TX2_N",
            B11: "net.USB_RX1_P", B10: "net.USB_RX1_N",
            A11: "net.USB_RX2_P", A10: "net.USB_RX2_N",
            // Bond all shell contacts directly to GND, as in ASMedia reference CON1.
            pin3: "net.GND", pin4: "net.GND",
            pin2: "net.GND", pin1: "net.GND",
            EP1_FRONT: "net.GND", EP2_FRONT: "net.GND",
          }}
        />
        <Usb4Lanes/>
        <UsbVbusSense/>
      </schematicsheet>
      <schematicsheet name="power" sheetIndex={3} sheetSize="ANSI_B">
        <schematicsection name="ATX_START" displayName="ATX Input and Automatic Start"/>
        <A_39301240
          name="ATX"
          // Right-angle connector faces the bottom edge, opposite the bracket.
          schSectionName="ATX_START"
          schX={-4}
          schY={0}
          noConnect={["pin14", "pin20"]}
          connections={{
            pin1: "net.VCCH",
            pin2: "net.VCCH",
            pin12: "net.VCCH",
            pin13: "net.VCCH",
            pin4: "net.V5V",
            pin6: "net.V5V",
            pin8: "net.ATX_PWR_OK",
            pin9: "net.V5VSB",
            pin21: "net.V5V",
            pin22: "net.V5V",
            pin23: "net.V5V",
            pin10: "net.V12V",
            pin11:  "net.V12V",
            pin3: "net.GND",
            pin5: "net.GND",
            pin7: "net.GND",
            pin15: "net.GND",
            pin17: "net.GND",
            pin18: "net.GND",
            pin19: "net.GND",
            pin24: "net.GND",
          }}
        />
        {/* Anchor the shared 3.3 V rail explicitly to avoid a dangling auto-label stub. */}
        <netlabel inline net="VCCH" connectsTo={["ATX.pin1", "ATX.pin2", "ATX.pin12"]}/>
        {/* The PSU pulls PS_ON# high internally. This removable link requests
            automatic start whenever AC is present (Intel ATX section 3.3.3). */}
        <A_0402WGF0000TCE
          name="R_PSU_ON"
          pcbStyle={{silkscreenTextVisibility: "hidden"}}
          schSectionName="ATX_START"
          schX={-1.7} schY={-1.6}
          schOrientation="vertical"
          connections={{pin2: "net.GND"}}
        />
        <trace name="PSU_START" from=".ATX > .pin16" to=".R_PSU_ON > .pin1"/>
        <netlabel inline net="GND" connection="R_PSU_ON.pin2"/>
        <BuckInputs/>
        <BuckEnable/>
        <PsuControl/>
        <PsuOkLed/>
      </schematicsheet>
    </board>
  ) as ReactElement;
}
