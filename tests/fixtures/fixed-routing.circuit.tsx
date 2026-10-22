import type {FanoutTracePath} from "@tscircuit/props";

// Local coordinates relative to SAVED_ESCAPE, including two intentional vias.
export const savedEscape: FanoutTracePath[] = [{
  connection: "R5.pin2",
  route: [
    {route_type: "wire", x: 0.51, y: 0, width: 0.2, layer: "top"},
    {route_type: "wire", x: 2, y: 0, width: 0.2, layer: "top"},
    {route_type: "via", x: 2, y: 0, from_layer: "top", to_layer: "inner2", via_diameter: 0.6, via_hole_diameter: 0.3},
    {route_type: "wire", x: 2, y: 0, width: 0.2, layer: "inner2"},
    {route_type: "wire", x: 4, y: 0, width: 0.2, layer: "inner2"},
    {route_type: "via", x: 4, y: 0, from_layer: "inner2", to_layer: "top", via_diameter: 0.6, via_hole_diameter: 0.3},
    {route_type: "wire", x: 4, y: 0, width: 0.2, layer: "top"},
    {route_type: "wire", x: 5, y: 0, width: 0.2, layer: "top"},
  ],
}];

export default function FixedRoutingExample({routeRemaining = true, manualVias = false} = {}) {
  return (
    <board width={24} height={18} layers={6} routeRemaining={routeRemaining}
      autorouter={{preset: "auto_local"}} minTraceWidth={0.2}
      pcbStyle={{viaHoleDiameter: 0.3, viaPadDiameter: 0.6}}>
      <resistor name="R1" resistance="1k" footprint="0402" pcbX={-8} pcbY={0}/>
      <resistor name="R2" resistance="1k" footprint="0402" pcbX={8} pcbY={0}/>
      {/* Deliberate detour: a router would normally straighten this connection. */}
      <trace name="FIXED" from="R1.pin2" to="R2.pin1" thickness={0.3}
        pcbPath={[
          {x: 0.51, y: 2},
          ...(manualVias ? [
            {x: 2, y: 2},
            {x: 2, y: 2, via: true, fromLayer: "top" as const, toLayer: "inner2" as const},
            {x: 2, y: 2},
            {x: 13, y: 2},
            {x: 13, y: 2, via: true, fromLayer: "inner2" as const, toLayer: "top" as const},
            {x: 13, y: 2},
          ] : []),
          {x: 15.49, y: 2},
        ]}/>
      {/* Its direct path crosses FIXED, so fixed copper must also be an obstacle. */}
      <resistor name="R3" resistance="1k" footprint="0402" pcbX={0} pcbY={-6} pcbRotation={90}/>
      <resistor name="R4" resistance="1k" footprint="0402" pcbX={0} pcbY={6} pcbRotation={90}/>
      <trace name="AUTO_CROSSING" from="R3.pin2" to="R4.pin1" thickness={0.2}/>
      <fanout name="SAVED_ESCAPE" pcbX={-8} pcbY={-4} pcbTracePaths={savedEscape}>
        <resistor name="R5" resistance="1k" footprint="0402" pcbX={0} pcbY={0}/>
      </fanout>
      <resistor name="R6" resistance="1k" footprint="0402" pcbX={8} pcbY={-4}/>
      <trace name="AUTO_CONTINUATION" from="R5.pin2" to="R6.pin1" thickness={0.2}/>
    </board>
  );
}
