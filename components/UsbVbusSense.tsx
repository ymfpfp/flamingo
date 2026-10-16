import {A_0402WGF1002TCE} from "imports/A_0402WGF1002TCE";
import {CL05A105KA5NQNC} from "imports/CL05A105KA5NQNC";

/** ASMedia reference sheet 3: R57/R60 divider and C68 filter. */
export function UsbVbusSense() {
  return (
    <group name="USB_VBUS_SENSE" schX={-8}>
      <schematicsection name="USB_VBUS_SENSE" displayName="USB VBUS Sense"/>
      <resistor
        name="R_VBUS_TOP"
        resistance="4.7k"
        tolerance="1%"
        footprint="0402"
        manufacturerPartNumber="0402WGF4701TCE"
        supplierPartNumbers={{jlcpcb: ["C25900"]}}
        pinAttributes={{pin1: {isPassive: true}, pin2: {isPassive: true}}}
        schSectionName="USB_VBUS_SENSE"
        schX={0} schY={1.1}
        schOrientation="vertical"
        connections={{pin1: "net.USB_VBUS", pin2: "net.USB_VBUS_SENSE"}}
      />
      <A_0402WGF1002TCE
        name="R_VBUS_BOTTOM"
        schSectionName="USB_VBUS_SENSE"
        schX={0} schY={-1.1}
        schOrientation="vertical"
        connections={{pin1: "net.USB_VBUS_SENSE", pin2: "net.GND"}}
      />
      <CL05A105KA5NQNC
        name="C_VBUS_SENSE"
        maxVoltageRating="25V"
        schSectionName="USB_VBUS_SENSE"
        schX={3} schY={-1.1}
        schOrientation="vertical"
        connections={{pin1: "net.USB_VBUS_SENSE", pin2: "net.GND"}}
      />
      <trace name="VBUS_DIVIDER" from=".R_VBUS_TOP > .pin2" to=".R_VBUS_BOTTOM > .pin1"/>
      <trace name="VBUS_FILTER" from=".R_VBUS_TOP > .pin2" to=".C_VBUS_SENSE > .pin1"/>
      <netlabel net="USB_VBUS" connection="R_VBUS_TOP.pin1"
        schX={0} schY={2.1} anchorSide="bottom"/>
      <netlabel net="USB_VBUS_SENSE" connectsTo={["R_VBUS_TOP.pin2", "R_VBUS_BOTTOM.pin1"]}
        schX={0} schY={0} anchorSide="right"/>
      <netlabel net="USB_VBUS_SENSE" connection="C_VBUS_SENSE.pin1"
        schX={3} schY={0.1} anchorSide="left"/>
      <netlabel net="GND" connection="R_VBUS_BOTTOM.pin2"
        schX={0} schY={-2.1} anchorSide="top"/>
      <netlabel net="GND" connection="C_VBUS_SENSE.pin2"
        schX={3} schY={-2.1} anchorSide="top"/>
      <schematictext text="ASMedia R57/R60/C68: 4.7k / 10k + 1uF."
        schX={-1.5} schY={-3} fontSize={0.18} anchor="left"/>
      <schematictext text="5V cable input gives 3.40V nominal; RC = 3.20ms."
        schX={-1.5} schY={-3.4} fontSize={0.18} anchor="left"/>
    </group>
  );
}
