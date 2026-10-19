import {Fragment} from "react";
import {A_0201WMF2203TEE} from "imports/A_0201WMF2203TEE";
import {GRM033R61E334KE15D} from "imports/GRM033R61E334KE15D";
import {GRM033R61E224KE01D} from "imports/GRM033R61E224KE01D";
import {ESD150B1W0201E6327XTSA1} from "imports/ESD150B1W0201E6327XTSA1";
import {usb4Placement} from "lib/usb4-placement";

// ASMedia ASM2464PDX_TI_R03, sheet 3: preserve polarity and map pair 1 to lane 0.
export const usb4Signals = [
  {name: "TX1_P", bridgePin: "UTXP0", direction: "TX"},
  {name: "TX1_N", bridgePin: "UTXN0", direction: "TX"},
  {name: "TX2_P", bridgePin: "UTXP1", direction: "TX"},
  {name: "TX2_N", bridgePin: "UTXN1", direction: "TX"},
  {name: "RX1_P", bridgePin: "URXP0", direction: "RX"},
  {name: "RX1_N", bridgePin: "URXN0", direction: "RX"},
  {name: "RX2_P", bridgePin: "URXP1", direction: "RX"},
  {name: "RX2_N", bridgePin: "URXN1", direction: "RX"},
] as const;

export function Usb4Lanes() {
  return (
    <group name="USB4_LANES">
      <schematicsection name="USB4_LANES" displayName="USB4 Lanes" sectionTitleFontSize={0.18}/>
      {usb4Signals.map((signal, index) => {
        const Capacitor = signal.direction === "TX" ? GRM033R61E224KE01D : GRM033R61E334KE15D;
        const connectorNet = `net.USB_${signal.name}`;
        const bridgeNet = `net.ASM_${signal.bridgePin}`;
        const y = 8 - index * 2.2;
        return (
          <Fragment key={signal.name}>
            <Capacitor
              name={`C_USB_${signal.name}`}
              schSectionName="USB4_LANES"
              schX={7}
              schY={y}
              schOrientation="vertical"
              {...usb4Placement(signal.name, "capacitor")}
              connections={{pin1: connectorNet, pin2: bridgeNet}}
            />
            {/* One bidirectional clamp per conductor, on the PHY side of the capacitor.
                The +/-3.3 V working range does not support connector-side VBUS shorts. */}
            <ESD150B1W0201E6327XTSA1
              name={`D_USB_${signal.name}`}
              schSectionName="USB4_LANES"
              schX={9}
              schY={y - 0.8}
              {...usb4Placement(signal.name, "clamp")}
              connections={{pin1: bridgeNet, pin2: "net.GND"}}
            />
            {/* Connector-side discharge paths match R66-R73 in the ASMedia reference. */}
            <A_0201WMF2203TEE
              name={`R_USB_${signal.name}`}
              schSectionName="USB4_LANES"
              schX={5}
              schY={y - 0.8}
              schOrientation="vertical"
              {...usb4Placement(signal.name, "discharge")}
              connections={{pin1: connectorNet, pin2: "net.GND"}}
            />
          </Fragment>
        );
      })}
      <schematictext
        text="TX: 220 nF / 25 V; RX: 330 nF / 25 V."
        schX={4.5} schY={10} fontSize={0.18} anchor="left"
      />
      <schematictext
        text="Separate PHY-side ESD clamps; 220k connector-side discharge resistors."
        schX={4.5} schY={9.6} fontSize={0.18} anchor="left"
      />
    </group>
  );
}
