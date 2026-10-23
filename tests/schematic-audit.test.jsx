import assert from "node:assert/strict";
import {test} from "node:test";
import {boardFixture} from "./board-fixture.mjs";
import {auditCircuit, electricalMargins} from "./audits/schematic-audit.mjs";
import {circuitGraph} from "../lib/circuit-graph.mjs";
import bridgePins from "./fixtures/asm2464pdx-pin-map.json";

const json = boardFixture();
const g = circuitGraph(json, {zeroOhm: true});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test("the complete schematic has selected parts, no used-pin opens, no wired NCs, and isolated power domains", () => {
  assert.deepEqual(auditCircuit(json).findings, []);
});

test("every bridge power ball reaches its intended supply and every unused ball is explicitly NC", () => {
  const rails = {VCCH: g.net("ATX", "pin1"), VCCA33: g.net("ATX", "pin1"),
    VCCL: g.net("L_VCCL", "pin2"), VDD: g.net("L_VDD", "pin2"), GND: g.net("ATX", "pin3"), GNDA: g.net("ATX", "pin3")};
  for (const [ball, signal] of Object.entries(bridgePins.balls)) {
    if (signal in rails) assert.equal(g.net("ASM2464PDX", ball), rails[signal], `${ball}: ${signal}`);
    if (signal.startsWith("NC")) assert.equal(g.port("ASM2464PDX", ball).do_not_connect, true, ball);
  }
});

test("SPI flash physical pins, pull-ups, bypassing, and reset-capable programming access are correct", () => {
  const flash = "W25Q32JVSSIQ", bridge = "ASM2464PDX";
  for (const [flashPin, ball, headerPin] of [[1, "A2", 4], [2, "A4", 7], [5, "A3", 6], [6, "A5", 5]]) {
    assert.equal(g.net(flash, `pin${flashPin}`), g.net(bridge, ball));
    assert.equal(g.net("SPI", `pin${headerPin}`), g.net(bridge, ball));
  }
  const ground = g.net("ATX", "pin3"), supply = g.net("ATX", "pin1");
  assert.equal(g.net(flash, "pin4"), ground);
  assert.equal(g.net(flash, "pin8"), supply);
  assert.equal(g.net("SPI", "pin1"), g.net(bridge, "H1"));
  assert.equal(g.net("SPI", "pin2"), ground);
  assert.equal(g.net("SPI", "pin3"), supply);
  for (const [resistor, pin] of [["R_SPI_CS", 1], ["R_SPI_WP", 3], ["R_SPI_HOLD", 7]]) {
    assert.equal(g.component(resistor).resistance, 10000);
    assert.equal(g.net(resistor, "pin1"), supply);
    assert.equal(g.net(resistor, "pin2"), g.net(flash, `pin${pin}`));
  }
  assert.equal(g.net("C_SPI_VCC", "pin1"), supply);
  assert.equal(g.net("C_SPI_VCC", "pin2"), ground);
  near(g.component("C_SPI_VCC").capacitance, 100e-9);
  assert.equal(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(p => g.net(flash, `pin${p}`))).size, 8);
});

test("USB-C CC, SBU, USB2 duplicates and all shells reach the correct physical bridge balls", () => {
  const map = [["A5", "AA6"], ["B5", "Y6"], ["A8", "K1"], ["B8", "J1"],
    ["A6", "M1"], ["B6", "M1"], ["A7", "M2"], ["B7", "M2"]];
  for (const [contact, ball] of map) assert.equal(g.net("USBC", contact), g.net("ASM2464PDX", ball), `${contact} -> ${ball}`);
  assert.equal(new Set(map.map(([, ball]) => g.net("ASM2464PDX", ball))).size, 6);
  for (const shell of ["pin1", "pin2", "pin3", "pin4", "EP1_FRONT", "EP2_FRONT"]) assert.equal(g.net("USBC", shell), g.net("ATX", "pin3"));
});

test("the 25 MHz differential crystal and 10 pF bridge capacitor do not ground either oscillator node", () => {
  const ground = g.net("ATX", "pin3"), xi = g.net("ASM2464PDX", "AA4"), xo = g.net("ASM2464PDX", "Y4");
  assert.equal(new Set([ground, xi, xo]).size, 3);
  // The passive resonator and capacitor have interchangeable signal terminals.
  // Retain the two distinct oscillator nets and the grounded cover terminals.
  assert.deepEqual(new Set([g.net("XCLK", "pin1"), g.net("XCLK", "pin3")]), new Set([xi, xo]));
  for (const pin of ["pin2", "pin4"]) assert.equal(g.net("XCLK", pin), ground);
  assert.deepEqual(new Set([g.net("C1", "pin1"), g.net("C1", "pin2")]), new Set([xi, xo]));
  near(g.component("C1").capacitance, 10e-12);
  assert.equal(g.component("XCLK").frequency, 25e6);
});

test("REXT, memory-repair strap and test strap have the intended physical pin connections", () => {
  assert.equal(g.component("R_RST_N").resistance, 12100);
  assert.equal(g.net("R_RST_N", "pin1"), g.net("ASM2464PDX", "AA3"));
  assert.equal(g.net("R_RST_N", "pin2"), g.net("ATX", "pin3"));
  assert.equal(g.component("R_UART_TX").resistance, 4700);
  assert.equal(g.net("R_UART_TX", "pin1"), g.net("ATX", "pin1"));
  assert.equal(g.net("R_UART_TX", "pin2"), g.net("ASM2464PDX", "B21"));
  assert.equal(g.component("R_TEST_EN").resistance, 4700);
  assert.equal(g.net("R_TEST_EN", "pin1"), g.net("ASM2464PDX", "H21"));
  assert.equal(g.net("R_TEST_EN", "pin2"), g.net("ATX", "pin3"));
});

test("all 44 bridge capacitors have reference quantities and shunt the intended rails", () => {
  const banks = {VCCH: {count: 10, total: 29.68e-6, net: g.net("ATX", "pin1")},
    VCCA33: {count: 2, total: 22.22e-6, net: g.net("ATX", "pin1")},
    VCCL: {count: 14, total: 54.2e-6, net: g.net("L_VCCL", "pin2")},
    VDD: {count: 18, total: 55.08e-6, net: g.net("L_VDD", "pin2")}};
  for (const [rail, bank] of Object.entries(banks)) {
    const caps = g.components.filter(c => new RegExp(`^C_${rail}_\\d+$`).test(c.name));
    assert.equal(caps.length, bank.count, rail);
    near(caps.reduce((sum, c) => sum + c.capacitance, 0), bank.total);
    for (const c of caps) {
      assert.equal(g.net(c.name, "pin1"), bank.net, c.name);
      assert.equal(g.net(c.name, "pin2"), g.net("ATX", "pin3"), c.name);
    }
  }
});

test("the audit rejects a real signal short and a removed flash supply connection", () => {
  const shorted = structuredClone(json);
  shorted.push({type: "source_trace", source_trace_id: "audit_injected_short",
    connected_source_port_ids: [g.port("ATX", "pin4").source_port_id, g.port("ATX", "pin1").source_port_id], connected_source_net_ids: []});
  assert.ok(auditCircuit(shorted).findings.some(f => f.id === "shorted_rails"));
  const open = structuredClone(json);
  const flashPower = g.port("W25Q32JVSSIQ", "pin8").source_port_id;
  for (const t of open.filter(e => e.type === "source_trace")) t.connected_source_port_ids = t.connected_source_port_ids.filter(id => id !== flashPower);
  assert.ok(auditCircuit(open).findings.some(f => f.id === "isolated_used_pin" && f.refs.includes("W25Q32JVSSIQ")));
});

test("the audit checks TPS62903 voltage, current and other static margins", () => {
  const m = electricalMargins(json);
  for (const c of m.converter) {
    assert.ok(c.inductorPeakAtLoadEnvelopeA < c.inductorIsatA);
    assert.ok(c.inductorRmsAtLoadEnvelopeA < c.inductorIrmsRatingA);
    assert.ok(c.inductorPeakAtLoadEnvelopeA < c.minimumBuckPeakCurrentLimitA);
    assert.ok(c.inductorPeakAtLoadEnvelopeA < c.inductor10PercentDropCurrentA);
    assert.equal(c.staticVoltageRangePass, true);
    assert.ok(c.remainingLowerMarginMV > 10 && c.remainingUpperMarginMV > 10);
  }
  assert.ok(m.supervisor.maximumRisingV < m.supervisor.atx3V3MinimumV);
  for (const rail of [m.slot.rail12, m.slot.rail3V3]) {
    assert.ok(rail.dcVoltageRatingsPass);
    assert.ok(rail.idealDriverReachesRdsTestVoltage);
    assert.ok(rail.bleederWorstLossW < rail.bleederRatedPowerW);
    assert.ok(rail.initialPulseBelowOverloadTestVoltage);
  }
  assert.equal(m.slot.driver.guaranteedAtBridgeMinimumHigh, true);
  assert.equal(m.driver.fullOnBehaviorGuaranteedAtBridgeMinimumHigh, true);
  assert.ok(m.slot.driver.lowestRdsSpecifiedGateV < m.slot.driver.bridgeGuaranteedHighV);
  assert.equal(m.slot.driver.guaranteedRdsTestCurrentA, 0.01);
  assert.equal(m.slot.driver.gateNetworkCheckSinkCeilingA, 0.01);
  assert.equal(m.slot.driver.gateNetworkTimingCheck25CPass, true);
  assert.equal(m.slot.rail12.rdsTestGateV, 4.5);
  assert.equal(m.slot.rail12.rds25Ohm, 0.0046);
  assert.ok(Math.abs(m.slot.rail12.fetLossAt25CMaxRdsW - 0.13915) < 1e-9);
  assert.equal(m.slot.rail12.vgsRatingV, 20);
  assert.ok(m.slot.rail12.driverGateNetworkTimeToRdsTest25CMs < 100);
  assert.ok(m.slot.rail3V3.driverGateNetworkTimeToRdsTest25CMs < 10);
  for (const point of m.slot.driver.requiredSteadyOperatingPoints) {
    assert.ok(point.requiredSinkA < m.slot.driver.guaranteedRdsTestCurrentA);
    assert.ok(point.requiredSinkA * m.slot.driver.maximumRdsAtSpecifiedGateOhm < point.maximumDriverDrainVAtMinimumSupply);
  }
  assert.ok(m.slot.driver.worstControlPulldownAndGateLeakageA < m.slot.driver.maximumBridgeOutputCurrentA);
  const oldDrivers = structuredClone(json);
  for (const c of oldDrivers.filter(e => e.type === "source_component" && e.name.startsWith("Q_SLOT_DRV_"))) c.manufacturer_part_number = "2N7002K-7";
  assert.equal(electricalMargins(oldDrivers).slot.driver.guaranteedAtBridgeMinimumHigh, false);

  assert.ok(m.vbus.at4V75MinimumV > 2 && m.vbus.at5V25MaximumV < 3.6);
  assert.ok(m.driver.controlPulldownLoadAt2V4A < m.driver.maximumBridgeOutputCurrentA);
  assert.ok(m.driver.worstInternalPullupOffGateV < 1);
});


test("TPS62903 screening rejects an oversized output bank and the earlier 1 MHz filter", () => {
  const m = electricalMargins(json);
  for (const c of m.converter) {
    assert.equal(c.datasheetLcSelectionPass, true);
    assert.equal(c.fullLoopHardwareValidated, false);
    assert.ok(c.nominalCapacitanceUF > 74 && c.nominalCapacitanceUF < 76);
    assert.ok(c.minimumEffectiveCapacitanceSensitivityUF > 10 && c.maximumEffectiveCapacitanceUF < 100);
  }
  const bad = structuredClone(json);
  bad.find(e => e.type === "source_component" && e.name === "C_VDD_COUT").capacitance = 100e-6;
  assert.equal(electricalMargins(bad).converter.find(e => e.rail === "VDD").datasheetLcSelectionPass, false);
  const previousMode = structuredClone(json);
  previousMode.find(e => e.type === "source_component" && e.name === "R_VCCL_MODE").resistance = 21000;
  assert.equal(electricalMargins(previousMode).converter.find(e => e.rail === "VCCL").datasheetLcSelectionPass, false);
  const wrongDivider = structuredClone(json);
  wrongDivider.find(e => e.type === "source_component" && e.name === "R_VCCL_FBT").resistance = 33000;
  assert.equal(electricalMargins(wrongDivider).converter.find(e => e.rail === "VCCL").staticVoltageRangePass, false);
});

test("original-switch screening does not certify startup or invent active protection", () => {
  const q = electricalMargins(json).slot;
  assert.equal(q.topology, "original-discrete-p-channel");
  assert.equal(q.status, "startup-review-required");
  for (const rail of [q.rail12, q.rail3V3]) assert.equal(rail.startupSoaQualified, false);
  for (const key of ["activeCurrentLimiting", "activePowerLimiting", "faultLatch"]) assert.equal(q[key], false);
});

test("slot screening follows actual gate resistance and output capacitance", () => {
  const before = electricalMargins(json).slot.rail12;
  const changed = structuredClone(json);
  changed.find(e => e.type === "source_component" && e.name === "R_SLOT_GATE_12V").resistance = 1e6;
  changed.find(e => e.type === "source_component" && e.name === "C134").capacitance *= 2;
  const after = electricalMargins(changed).slot.rail12;
  assert.equal(after.idealDriverReachesRdsTestVoltage, false);
  assert.ok(after.idealDriverGateOnTimeConstantMs > before.idealDriverGateOnTimeConstantMs);
  assert.ok(after.capacitorOnlyStartupEnergyJ > before.capacitorOnlyStartupEnergyJ);
});
