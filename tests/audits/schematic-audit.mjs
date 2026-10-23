import {qualifySlotPower} from "./power-qualification.mjs";
import {circuitGraph} from "../../lib/circuit-graph.mjs";

export function auditCircuit(json) {
  const g = circuitGraph(json, {zeroOhm: true});
  const wire = circuitGraph(json);
  const componentPorts = g.ports.filter(p => !p.source_component_id.startsWith("source_manually_placed_via_"));
  const findings = [];
  const add = (id, severity, message, refs = []) => findings.push({id, severity, message, refs});
  const dnp = new Set(json.filter(e => e.type === "pcb_component" && e.do_not_place).map(e => e.source_component_id));
  for (const name of ["UART", "SPI"]) dnp.add(g.component(name).source_component_id);
  for (const c of g.components) {
    if (!dnp.has(c.source_component_id) && !c.manufacturer_part_number) add("missing_orderable_part", "error", `${c.name} has no selected manufacturer part.`, [c.name]);
  }
  const names = g.components.map(c => c.name);
  if (new Set(names).size !== names.length) add("duplicate_designator", "error", "Component names are not unique.");
  for (const p of componentPorts) {
    const c = g.components.find(c => c.source_component_id === p.source_component_id);
    if (p.do_not_connect) {
      if (json.some(e => e.type === "source_trace" && e.connected_source_port_ids.includes(p.source_port_id))) {
        add("wired_nc_pin", "error", `${c.name}.${p.name} is marked NC but has a wire.`, [c.name]);
      }
    } else if (wire.byNet.get(wire.root(p.source_port_id)).length < 2 && !(c.name === "ATX" && p.port_hints.includes("pin9"))) {
      add("isolated_used_pin", "error", `${c.name}.${p.name} has no other component on its wire net.`, [c.name]);
    }
  }
  const railPins = {GND: ["ATX", "pin3"], VCCH: ["ATX", "pin1"], V5V: ["ATX", "pin4"], V5VSB: ["ATX", "pin9"],
    V12V: ["ATX", "pin10"], VCCL: ["L_VCCL", "pin2"], VDD: ["L_VDD", "pin2"], SLOT_3V3: ["PCIe", "A9"],
    SLOT_12V: ["PCIe", "A2"], USB_VBUS: ["USBC", "A4"], USB_VBUS_SENSE: ["R_VBUS_BOTTOM", "pin1"]};
  const rails = Object.fromEntries(Object.entries(railPins).map(([n, p]) => [n, g.net(...p)]));
  if (new Set(Object.values(rails)).size !== Object.keys(rails).length) add("shorted_rails", "error", "Independent power rails are joined.");
  const maxima = {VCCH: 3.465, V5V: 5.25, V12V: 12.6, VCCL: 1.95, VDD: 1.16, SLOT_3V3: 3.465, SLOT_12V: 12.6, USB_VBUS_SENSE: 3.6};
  const banks = {};
  for (const c of g.components.filter(c => c.ftype === "simple_capacitor")) {
    if (!c.max_voltage_rating) add("missing_capacitor_rating", "error", `${c.name} has no recorded voltage rating.`, [c.name]);
    const a = g.net(c.name, "pin1"), b = g.net(c.name, "pin2");
    if (a === b) add("bypassed_capacitor", "error", `${c.name} has both terminals on the same DC net.`, [c.name]);
    const other = a === rails.GND ? b : b === rails.GND ? a : null;
    for (const [name, id] of Object.entries(rails)) if (id === other) {
      banks[name] = (banks[name] ?? 0) + c.capacitance;
      if (maxima[name] && c.max_voltage_rating < maxima[name]) add("underrated_capacitor", "error", `${c.name} is rated below the ${name} operating envelope.`, [c.name]);
    }
  }
  const pcbPorts = json.filter(e => e.type === "pcb_port");
  if (pcbPorts.length) for (const p of componentPorts) {
    const matches = pcbPorts.filter(q => q.source_port_id === p.source_port_id);
    if (!matches.length || !matches.every(q => json.some(e => ["pcb_smtpad", "pcb_plated_hole"].includes(e.type) && e.pcb_port_id === q.pcb_port_id))) {
      const c = g.components.find(c => c.source_component_id === p.source_component_id);
      add("missing_physical_terminal", "error", `${c.name}.${p.name} has no matching copper terminal.`, [c.name]);
    }
  }
  return {scope: "Connectivity, part selection and capacitor ratings; complete electrical qualification is separate.",
    componentCount: g.components.length, populatedCount: g.components.length - dnp.size,
    sourcePortCount: g.ports.length, physicalTerminalsChecked: pcbPorts.length > 0,
    nominalShuntCapacitanceUF: Object.fromEntries(Object.entries(banks).map(([n, c]) => [n, c * 1e6])), findings};
}

/** Calculations use stated datasheet limits and explicit load assumptions. */
export function electricalMargins(json) {
  const g = circuitGraph(json, {zeroOhm: true});
  const value = (name, property) => g.component(name)[property];
  const resistor = name => value(name, "resistance");
  const capacitor = name => value(name, "capacitance");
  const converter = ["VCCL", "VDD"].map(rail => {
    const top = resistor(`R_${rail}_FBT`), bottom = resistor(`R_${rail}_FBB`);
    const resistorError = 0.001 + 25e-6 * 125;
    const nominalV = 0.6 * (1 + top / bottom);
    const part = g.component(`${rail}_BUCK`).manufacturer_part_number;
    const isTps62903 = part === "TPS62903RPJR";
    // TI section 6.5: external-FB accuracy +/-0.9%, FB leakage up to 70 nA.
    const minimumV = isTps62903 ? 0.6 * 0.991 * (1 + top * (1 - resistorError) / (bottom * (1 + resistorError))) - 70e-9 * top * (1 + resistorError) : null;
    const maximumV = isTps62903 ? 0.6 * 1.009 * (1 + top * (1 + resistorError) / (bottom * (1 - resistorError))) + 70e-9 * top * (1 + resistorError) : null;
    const ground = g.net("ATX", "pin3"), output = g.net(`L_${rail}`, "pin2");
    const bank = g.components.filter(c => c.ftype === "simple_capacitor" && (
      (g.net(c.name, "pin1") === output && g.net(c.name, "pin2") === ground)
      || (g.net(c.name, "pin2") === output && g.net(c.name, "pin1") === ground)));
    const capacitanceF = bank.reduce((sum, c) => sum + c.capacitance, 0);
    const knownCapacitorEnvelope = bank.every(c => ["CL05A225KO5NQNC", "CL21A106KAYNNNE", "CL05B224KO5NNNC"].includes(c.manufacturer_part_number));
    const minimumEffectiveCapacitanceSensitivityUF = capacitanceF * 1e6 * 0.9 * 0.85 * 0.5;
    const maximumEffectiveCapacitanceUF = capacitanceF * 1e6 * 1.1 * 1.15;
    const inductor = g.component(`L_${rail}`);
    const inductanceMatch = String(inductor.inductance).match(/^([\d.]+)\s*(nH|uH|mH|H)$/);
    const inductanceH = inductanceMatch ? Number(inductanceMatch[1]) * ({nH: 1e-9, uH: 1e-6, mH: 1e-3, H: 1}[inductanceMatch[2]]) : null;
    const selectedInductor = inductor.manufacturer_part_number === "XGL4020-102MEC";
    const modeOhm = resistor(`R_${rail}_MODE`);
    const nominalSwitchingFrequencyHz = isTps62903 && modeOhm === 8870 ? 2.5e6 : isTps62903 && modeOhm === 21000 ? 1e6 : null;
    const loadA = 3;
    // Frequency -10% and inductance -10% under bias are sensitivity assumptions.
    const frequencyHz = nominalSwitchingFrequencyHz === null ? null : nominalSwitchingFrequencyHz * 0.9;
    const rippleA = frequencyHz && inductanceH ? (maximumV ?? nominalV) * (1 - (maximumV ?? nominalV) / 5.25) / (inductanceH * 0.8 * 0.9 * frequencyHz) : null;
    const peakA = rippleA === null ? null : loadA + rippleA / 2;
    const rmsA = rippleA === null ? null : Math.sqrt(loadA ** 2 + rippleA ** 2 / 12);
    const [railMinimum, railMaximum] = rail === "VCCL" ? [1.85, 1.95] : [1.10, 1.16];
    return {rail, part, nominalV, minimumV, maximumV,
      staticVoltageRangePass: minimumV !== null && maximumV !== null && minimumV >= railMinimum && maximumV <= railMaximum,
      remainingLowerMarginMV: minimumV === null ? null : (minimumV - railMinimum) * 1000,
      remainingUpperMarginMV: maximumV === null ? null : (railMaximum - maximumV) * 1000,
      continuousLoadEnvelopeA: loadA, peakToPeakInductorRippleA: rippleA,
      nominalSwitchingFrequencyHz, modeResistanceOhm: modeOhm, nominalInductanceH: inductanceH,
      inductorPeakAtLoadEnvelopeA: peakA, inductorRmsAtLoadEnvelopeA: rmsA,
      inductorIsatA: selectedInductor ? 8.8 : null,
      inductor10PercentDropCurrentA: selectedInductor ? 3.8 : null,
      inductorIrmsRatingA: selectedInductor ? 12 : null,
      inductorCopperLossAtMaxDcrW: selectedInductor && rmsA !== null ? rmsA ** 2 * 0.009 * (1 + 0.00393 * 100) : null,
      minimumBuckPeakCurrentLimitA: isTps62903 ? 4 : null,
      nominalCapacitanceUF: capacitanceF * 1e6,
      minimumEffectiveCapacitanceSensitivityUF, maximumEffectiveCapacitanceUF,
      datasheetLcSelectionPass: isTps62903 && modeOhm === 8870 && selectedInductor && inductanceH === 1e-6
        && knownCapacitorEnvelope && minimumEffectiveCapacitanceSensitivityUF >= 10 && maximumEffectiveCapacitanceUF <= 100,
      fullLoopHardwareValidated: false,
      qualification: "TPS62903 static voltage and LC selection screening. Effective capacitance and switching-frequency corners include sensitivity assumptions. Startup, ripple, PCB drop and load-step response need measurements.",
    };
  });
  const top = resistor("R_BUCK_EN_TOP"), bottom = resistor("R_BUCK_EN_BOTTOM");
  const supervisor = {nominalRisingV: 1.157 * (1 + top / bottom),
    maximumRisingV: 1.157 * 1.01 * (1 + top * 1.001 / (bottom * 0.999)),
    atx3V3MinimumV: 3.135};
  const slot = qualifySlotPower(g);
  const vbusTop = resistor("R_VBUS_TOP"), vbusBottom = resistor("R_VBUS_BOTTOM");
  const vbus = {at5VNominalV: 5 * vbusBottom / (vbusTop + vbusBottom),
    at4V75MinimumV: 4.75 * vbusBottom * 0.99 / (vbusTop * 1.01 + vbusBottom * 0.99),
    at5V25MaximumV: 5.25 * vbusBottom * 1.01 / (vbusTop * 0.99 + vbusBottom * 1.01),
    at5V5SensitivityV: 5.5 * vbusBottom * 1.01 / (vbusTop * 0.99 + vbusBottom * 1.01),
    nominalFilterMs: capacitor("C_VBUS_SENSE") / (1 / vbusTop + 1 / vbusBottom) * 1000,
    pinExplicitlyDescribedAs5VTolerant: true, poweredOffBehaviorQualified: false};
  const driver = {bridgeGuaranteedOutputHighV: 2.4, lowestSpecifiedDriverGateV: slot.driver.lowestRdsSpecifiedGateV,
    maximumBridgeOutputCurrentA: 0.012, controlPulldownLoadAt2V4A: 2.4 / (resistor("R_HDDPC_PD") * 0.99),
    worstInternalPullupOffGateV: (3.6 / 57000 + 2e-6) / (1 / 57000 + 1 / (resistor("R_HDDPC_PD") * 1.01)),
    fullOnBehaviorGuaranteedAtBridgeMinimumHigh: slot.driver.guaranteedAtBridgeMinimumHigh};
  return {assumptions: ["Static rail errors include reference, feedback leakage, resistor tolerance and conservative TCR; ripple, PCB drop and load steps are separate.",
    "Inductor screening uses up to 3 A per converter, -20% initial inductance, another -10% bias sensitivity and nominal frequency minus 10%. The frequency reduction is not a guaranteed minimum. Copper loss includes a 100 C rise allowance.",
    "All selected output capacitors have +/-10% initial tolerance. The capacitance screening adds +/-15% temperature change and a -50% DC-bias sensitivity; this does not establish a guaranteed capacitance floor.",
    "The user selected a 75 W total slot budget. Individual rail stress checks use conservative limits of 3 A at 3.3 V and 5.5 A at 12 V; these are not a simultaneous load request.",
    "No card-specific surge or board thermal model is available."],
    combinedSlotBudgetW: 75,
    sources: ["datasheets/TPS62903RPJR.pdf sections 6.5, 7.3.4, 8.2.2.3 and 8.3.2", "datasheets/TPS389001DSET.pdf sections 7.5 and 7.6",
      "datasheets/XGL4020.pdf", "datasheets/ASM2464PDX_DataSheet_R0_3.pdf sections 5 and 6.3.6",
      slot.rail12.datasheet, slot.rail3V3.datasheet, "https://assets.nexperia.com/documents/data-sheet/NX3008NBK.pdf"],
    converter, supervisor, slot, vbus, driver};
}
