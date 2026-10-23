import mosfetLimits from "../../simulations/slot-power/mosfet-limits.json";

/** Conservative on-state RC envelope: do not extrapolate the 10 mA Rds test
 * to the larger initial current demand. This is not a transistor/card model.
 */
function gateNetworkTimeMs(supplyV, targetV, seriesOhm, pullupOhm, gateCapF) {
  const steps = 20000, dv = targetV / steps;
  let seconds = 0;
  for (let i = 0; i < steps; i++) {
    const gateV = (i + 0.5) * dv;
    const sinkA = Math.min(0.01, (supplyV - gateV) / (seriesOhm + 2.8));
    const capacitorA = sinkA - gateV / pullupOhm;
    if (capacitorA <= 0) return null;
    seconds += gateCapF * dv / capacitorA;
  }
  return seconds * 1000;
}

/** Screen the selected P-channel switches using the actual compiled BOM.
 * These calculations do not model a MOSFET transfer curve or establish startup SOA.
 */
export function qualifySlotPower(g, {extraCardCapacitanceUF = 1000} = {}) {
  if (!Number.isFinite(extraCardCapacitanceUF) || extraCardCapacitanceUF < 0) throw new Error("Invalid card capacitance.");
  const r = name => g.component(name).resistance;
  const c = name => g.component(name).capacitance;
  const lowVoltageDriver = ["12V", "3V3"].every(suffix => g.component(`Q_SLOT_DRV_${suffix}`).manufacturer_part_number === "NX3008NBK,215");
  const configurations = [
    {suffix: "12V", supplyV: 12, currentA: 5.5, bulk: ["C134"], ceramics: ["C132", "C133"]},
    {suffix: "3V3", supplyV: 3.3, currentA: 3, bulk: ["C135", "C136"], ceramics: ["C131"]},
  ].map(p => {
    const part = g.component(`Q_SLOT_${p.suffix}`).manufacturer_part_number;
    if (!mosfetLimits[part]) throw new Error(`No slot MOSFET limits recorded for ${part}`);
    return {...p, ...mosfetLimits[part]};
  });
  const rails = configurations.map(p => {
    const series = r(`R_SLOT_GATE_${p.suffix}`), pullup = r(`R_SLOT_OFF_${p.suffix}`);
    const gateC = c(`C_SLOT_GATE_${p.suffix}`), bleeder = r(`R_SLOT_DISCHARGE_${p.suffix}`);
    const bulkC = p.bulk.reduce((sum, name) => sum + c(name), 0);
    const localC = bulkC + p.ceramics.reduce((sum, name) => sum + c(name), 0);
    // Explicit tolerance/temperature sensitivity; added card capacitance is effective.
    const maxC = bulkC * 1.2 * 1.2 + p.ceramics.reduce((sum, name) => sum + c(name), 0) * 1.1 * 1.15
      + extraCardCapacitanceUF * 1e-6;
    const maxV = p.supplyV * 1.05;
    // Ideal fully-on driver: these are optimistic gate-drive timing references.
    const finalGateV = p.supplyV * pullup / (series + pullup);
    const minimumGateV = p.supplyV * 0.95 * (pullup * 0.99) / (series * 1.01 + pullup * 0.99);
    const onTau = series * pullup / (series + pullup) * gateC;
    const offTau = pullup * gateC;
    const timeToGateV = v => finalGateV > v ? -onTau * Math.log(1 - v / finalGateV) * 1000 : null;
    const loss25W = p.currentA ** 2 * p.rds25Ohm;
    return {...p, mosfet: g.component(`Q_SLOT_${p.suffix}`).manufacturer_part_number,
      nominalLocalCapacitanceUF: localC * 1e6, maximumEffectiveCapacitanceUF: maxC * 1e6,
      idealDriverFinalGateMagnitudeV: finalGateV, idealDriverMinimumGateMagnitudeV: minimumGateV,
      idealDriverReachesRdsTestVoltage: minimumGateV >= p.rdsTestGateV,
      dcVoltageRatingsPass: maxV < p.vdsRatingV && maxV < p.vgsRatingV,
      fetLossAt25CMaxRdsW: loss25W, fetDropAt25CMaxRdsV: p.currentA * p.rds25Ohm,
      hotRdsSensitivityMultiplier: 2, fetLossAtTwiceRdsW: 2 * loss25W,
      junctionAt50CAmbientReferenceBoardTwiceRdsC: 50 + 2 * loss25W * p.thermalReferenceCPerW,
      gateCapacitanceUF: gateC * 1e6, idealDriverGateOnTimeConstantMs: onTau * 1000,
      gateOffTimeConstantMs: offTau * 1000,
      idealDriverTimeToThresholdMs: p.thresholdV.map(timeToGateV),
      idealDriverTimeToRdsTestGateMs: timeToGateV(p.rdsTestGateV),
      driverGateNetworkTimeToRdsTest25CMs: lowVoltageDriver
        ? gateNetworkTimeMs(p.supplyV * 0.95, p.rdsTestGateV, series * 1.01, pullup * 0.99, gateC * 1.1) : null,
      initialGateSinkCurrentMaxA: maxV / (series * 0.99),
      initialGateResistorPulseW: maxV ** 2 / (series * 0.99), gateResistorContinuousRatingW: 0.0625,
      gateResistorShortTimeOverloadTestV: 2.5 * Math.sqrt(0.0625 * series * 0.99),
      initialPulseBelowOverloadTestVoltage: maxV < 2.5 * Math.sqrt(0.0625 * series * 0.99),
      bleederWorstLossW: maxV ** 2 / (bleeder * 0.99), bleederRatedPowerW: 0.25,
      nominalLocalBleederTimeConstantS: bleeder * localC,
      capacitorOnlyStartupEnergyJ: 0.5 * maxC * maxV ** 2,
      // Hypothetical linear output ramps: stress demands, not predictions.
      rampStress: [0.1, 1, 10].map(rampMs => {
        const chargingA = maxC * maxV / (rampMs / 1000);
        const totalA = p.currentA + maxV / (bleeder * 0.99) + chargingA;
        return {rampMs, capacitiveCurrentA: chargingA, loadPlusCapacitiveCurrentA: totalA,
          approximateInitialFetPowerW: maxV * totalA,
          approximateFetEnergyJ: 0.5 * maxC * maxV ** 2 + 0.5 * maxV * p.currentA * rampMs / 1000};
      }),
      startupSoaQualified: false, hardwareValidated: false};
  });
  const driver = {part: g.component("Q_SLOT_DRV_12V").manufacturer_part_number,
    bridgeGuaranteedHighV: 2.4, lowestRdsSpecifiedGateV: lowVoltageDriver ? 1.8 : 5,
    maximumRdsAtSpecifiedGateOhm: lowVoltageDriver ? 2.8 : 3,
    rdsSpecificationTemperatureC: 25,
    guaranteedAtBridgeMinimumHigh: lowVoltageDriver,
    gateHighVoltageHeadroomV: lowVoltageDriver ? 2.4 - 1.8 : null,
    drainVoltageRatingV: lowVoltageDriver ? 30 : 60, maximumOffDrainV: 12.6,
    gateVoltageRatingV: lowVoltageDriver ? 8 : 20, maximumControlV: 3.6,
    guaranteedRdsTestCurrentA: lowVoltageDriver ? 0.01 : 0.05,
    gateNetworkCheckSinkCeilingA: lowVoltageDriver ? 0.01 : null,
    gateNetworkTimingCheck25CPass: lowVoltageDriver && rails.every(p =>
      p.driverGateNetworkTimeToRdsTest25CMs !== null && p.driverGateNetworkTimeToRdsTest25CMs < 100),
    maximumInitialGateSinkDemandA: Math.max(...rails.map(p => p.initialGateSinkCurrentMaxA)),
    maximumBridgeOutputCurrentA: 0.012,
    worstControlPulldownAndGateLeakageA: 2.4 / (r("R_HDDPC_PD") * 0.99) + (lowVoltageDriver ? 2e-6 : 20e-6),
    requiredSteadyOperatingPoints: rails.map(p => {
      const sinkA = p.rdsTestGateV / r(`R_SLOT_OFF_${p.suffix}`);
      return {rail: p.suffix, requiredSinkA: sinkA,
        maximumDriverDrainVAtMinimumSupply: p.supplyV * 0.95 - p.rdsTestGateV - sinkA * r(`R_SLOT_GATE_${p.suffix}`)};
    })};
  return {topology: "original-discrete-p-channel", status: lowVoltageDriver ? "startup-review-required" : "startup-and-driver-review-required",
    envelope: {combinedSteadyCardBudgetW: 75, extraCardCapacitanceMaxPerRailUF: extraCardCapacitanceUF,
      rail12ContinuousA: 5.5, rail3V3ContinuousA: 3, ambientSensitivityC: 50, coldPlugOnly: true},
    rail12: rails[0], rail3V3: rails[1], driver,
    activeCurrentLimiting: false, activePowerLimiting: false, faultLatch: false,
    limits: [
      "Steady losses assume a fully-on gate driver. Twice-Rds and reference-board temperatures are sensitivity estimates, not guaranteed thermal bounds.",
      "Gate RC times do not predict output ramp time. MOSFET transfer curves, Miller charge, effective gate capacitance, card loading and PSU impedance matter.",
      "Ramp stress tables do not establish startup SOA. Check measured VDS/current trajectories against single-pulse SOA with temperature and repetition allowances.",
      lowVoltageDriver
        ? "NX3008NBK has a 2.8 ohm maximum at 1.8 V/10 mA/25 C, below the 2.4 V control minimum. Gate-network screening limits sink current to 10 mA rather than extrapolating Rds to the initial ideal demand. This on-state envelope assumes monotonic MOSFET conduction; temperature and low-state behavior remain separate checks."
        : "2N7002K has no guaranteed on-resistance at the bridge's 2.4 V minimum high. Threshold voltage is not a full-on specification.",
      "The single gate-resistor pulse fits the datasheet overload test voltage. Repetition, slow shutdown, cable transients and actual PERST# timing require checks.",
      "No local short-circuit cutoff or combined 75 W limiter exists. PSU protection alone does not qualify switch survival.",
    ]};
}
