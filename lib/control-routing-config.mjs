// Routing policy only. Geometry search is delegated to tscircuit's solvers.
// No pad, via, component, existing trace, or pour is moved by this module.
export const controlProfiles = {
  rext: {widthMm: .254, clearanceMm: .1778, maxLengthMm: 10, reference: 'GND', source: 'ASMedia PCB guide p3, UREXT 10:7 mil; ASAP', lengthSource: 'Project ceiling; the guide says ASAP'},
  spi: {widthMm: .127, clearanceMm: .254, maxLengthMm: 254, impedanceOhms: 50, impedanceTolerancePercent: 15, reference: 'GND', source: 'ASMedia PCB guide p7, SPI 5:10 mil, <10 inches'},
  cc: {widthMm: .2032, clearanceMm: .381, maxLengthMm: 254, reference: 'GND', source: 'ASMedia PCB guide p7, CC1/CC2 8:15 mil, <10 inches'},
  gpio: {widthMm: .127, clearanceMm: .2032, maxLengthMm: 254, impedanceOhms: 50, impedanceTolerancePercent: 15, reference: 'GND', source: 'ASMedia PCB guide p8, GPIO/strapping/UART 5:8 mil, <10 inches'},
  sbu: {widthMm: .127, clearanceMm: .254, maxLengthMm: 254, reference: 'GND', source: 'Project target using SPI clearance; the supplied ASMedia layout guide has no separate SBU routing table', vendorRuleVerified: false},
};

// All terminals are real assembled ports. The source netlist must agree before
// the native router receives any job. A branch is explicit, never auto-joined
// through a resistor, capacitor, switch or MOSFET.
export const controlNets = [
  {name: 'REXT', profile: 'rext', terminals: ['ASM2464PDX.REXT', 'R_RST_N.pin1']},
  {name: 'TEST_EN', profile: 'gpio', terminals: ['ASM2464PDX.TEST_EN', 'R_TEST_EN.pin1']},
  {name: 'ASM_RST_N', profile: 'gpio', terminals: ['ASM2464PDX.RST', 'C_RST.pin1', 'R_RST.pin2', 'SW_RESET.pin1', 'SPI.RST_N']},
  {name: 'ASM_SPI_CLK', profile: 'spi', terminals: ['ASM2464PDX.SPI_CLK', 'W25Q32JVSSIQ.CLK', 'SPI.CLK']},
  {name: 'ASM_SPI_MOSI', profile: 'spi', terminals: ['ASM2464PDX.SPI_DO', 'W25Q32JVSSIQ.MOSI', 'SPI.MOSI']},
  {name: 'ASM_SPI_MISO', profile: 'spi', terminals: ['ASM2464PDX.SPI_DI', 'W25Q32JVSSIQ.MISO', 'SPI.MISO']},
  {name: 'ASM_SPI_CS_N', profile: 'spi', terminals: ['ASM2464PDX.SPI_CS', 'W25Q32JVSSIQ.N_CS', 'R_SPI_CS.pin2', 'SPI.CS_N']},
  {name: 'FLASH_WP', profile: 'gpio', terminals: ['W25Q32JVSSIQ.WP', 'R_SPI_WP.pin2']},
  {name: 'FLASH_HOLD', profile: 'gpio', terminals: ['W25Q32JVSSIQ.HOLD', 'R_SPI_HOLD.pin2']},
  {name: 'ASM_CC1', profile: 'cc', terminals: ['ASM2464PDX.CC1', 'USBC.A5']},
  {name: 'ASM_CC2', profile: 'cc', terminals: ['ASM2464PDX.CC2', 'USBC.B5']},
  {name: 'ASM_SBU1', profile: 'sbu', terminals: ['ASM2464PDX.SBU1', 'USBC.A8']},
  {name: 'ASM_SBU2', profile: 'sbu', terminals: ['ASM2464PDX.SBU2', 'USBC.B8']},
  {name: 'ASM_PERST0_N', profile: 'gpio', terminals: ['ASM2464PDX.PERST0', 'R_PCIE_PERST.pin1']},
  {name: 'PCIE_PERST_N', profile: 'gpio', terminals: ['R_PCIE_PERST.pin2', 'PCIe.PERST_N']},
  {name: 'ASM_CLKREQ_N', profile: 'gpio', terminals: ['ASM2464PDX.GPIO8', 'R_PCIE_CLKREQ.pin1']},
  {name: 'PCIE_CLKREQ_N', profile: 'gpio', terminals: ['R_PCIE_CLKREQ.pin2', 'PCIe.CLKREQ_N', 'R_PCIE_CLKREQ_PU.pin2']},
  {name: 'ASM_WAKE_N', profile: 'gpio', terminals: ['ASM2464PDX.GPIO22', 'PCIe.WAKE_N']},
  {name: 'ASM_PRESENT_N', profile: 'gpio', terminals: ['ASM2464PDX.GPIO2', 'R_PCIE_PRESENT.pin1']},
  {name: 'PCIE_PRESENT_N', profile: 'gpio', terminals: ['R_PCIE_PRESENT.pin2', 'R_PCIE_PRESENT_PU.pin2', 'PCIe.PRSNT2_X1_N', 'PCIe.PRSNT2_X4_N', 'PCIe.PRSNT2_X8_N', 'PCIe.PRSNT2_X16_N']},
  {name: 'ASM_UART_TX', profile: 'gpio', terminals: ['ASM2464PDX.UART_TX', 'UART.TX', 'R_UART_TX.pin2']},
  {name: 'ASM_UART_RX', profile: 'gpio', terminals: ['ASM2464PDX.UART_RX', 'UART.RX']},
];

export const controlRoutingPolicy = {
  allowedSignalLayers: ['top', 'bottom'],
  // SBU2 is a low-speed sideband with no impedance target in the supplied
  // guide. Its authored L4 bypass uses L5 GND and a native power-pour moat.
  // The general autorouter still searches the two outer signal surfaces.
  authoredSignalLayersByNet: {
    ASM_SBU2: ['top', 'inner3', 'bottom'],
    ASM_CC1: ['top', 'inner2', 'inner3', 'bottom'],
    ASM_CC2: ['top', 'inner2', 'inner3', 'bottom'],
  },
  fixedPadLaunchPolicies: {
    ASM_CC1: {policy: 'cc-launch-policy', maximumDistanceFromTerminalMm: 1},
    ASM_CC2: {policy: 'cc-launch-policy', maximumDistanceFromTerminalMm: 1},
  },
  groundReferenceLayers: {top: 'inner1', bottom: 'inner4'},
  reservedGroundLayers: ['inner1', 'inner4'],
  reservedPowerLayers: ['inner2', 'inner3'],
  componentLayer: 'top',
  allowComponentMovement: false,
  allowExistingRouteChanges: false,
  allowExistingViaMovement: false,
  preserveExistingPourOutlines: true,
  allowNewViaAntipads: true,
  requireExistingPourContinuity: true,
  allowLaunchClearanceExceptions: false,
  allowBlindAndBuriedVias: false,
  viaDiameterMm: .3,
  viaHoleDiameterMm: .2,
  bgaViaDiameterMm: .25,
  bgaViaHoleDiameterMm: .15,
  router: 'tscircuit SOLVERS.AutoroutingPipelineSolver9_PreloadedTraceGraph',
  automaticFanoutAndVias: true,
  nativeObstacleMarginPolicy: 'profile-clearance',
  allowViaInPad: true,
  freezeExistingCopperAsObstacles: true,
  preserveRoundedTraceCaps: true,
  fixedPadsUseGlobalObstacleTopology: true,
  prohibitForeignCopperAssignment: true,
  conservativeEmittedPadBounds: true,
  highSpeedIsolationFromExistingAuditScopes: true,
  routingSurfaceModelLayers: 2,
  physicalBoardLayers: 6,
  requireFullStackViaDrc: true,
  requirePhysicalConnectivity: true,
  requireReferencePlaneCheck: true,
  requireImpedanceScreen: true,
  // Never publish a partial or unqualified individual net. Fully connected,
  // independently checked nets can be saved while other nets remain open.
  publishPartialResults: false,
};
