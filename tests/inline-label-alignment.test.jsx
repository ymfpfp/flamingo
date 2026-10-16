import assert from "node:assert/strict";
import {test} from "node:test";
import {Circuit} from "tscircuit";

// Covers the renderer patch: minimum-length stubs must not center short text.
for (const [side, axis, direction] of [
  ["rightSide", "x", 1], ["leftSide", "x", -1],
  ["topSide", "y", 1], ["bottomSide", "y", -1],
]) {
  test(`short inline labels share the same pin padding on ${side}`, async () => {
    const circuit = new Circuit();
    circuit.pcbDisabled = true;
    circuit.add(
      <board routingDisabled>
        <chip name="U1" footprint="pinrow2_p2.54mm" schWidth={2} schHeight={2}
          pinLabels={{pin1: ["A"], pin2: ["B"]}}
          schPinArrangement={{[side]: {pins: [1, 2],
            direction: axis === "x" ? "top-to-bottom" : "left-to-right"}}}
          connections={{A: "net.VDD", B: "net.VCCL"}}/>
        <netlabel inline net="VDD" connection="U1.A"/>
        <netlabel inline net="VCCL" connection="U1.B"/>
      </board>,
    );
    await circuit.renderUntilSettled();
    const json = circuit.getCircuitJson();
    for (const [name, pin] of [["VDD", 1], ["VCCL", 2]]) {
      const port = json.find(e => e.type === "schematic_port" && e.pin_number === pin);
      const label = json.find(e => e.type === "schematic_text" && e.text === name);
      assert.ok(port && label, `${name}: port and inline label exist`);
      assert.equal(label.anchor, direction > 0 ? "left" : "right");
      const padding = direction * (label.position[axis] - port.center[axis]);
      assert.ok(Math.abs(padding - 0.1) < 1e-6, `${name}: ${padding} mm padding`);
    }
  });
}
