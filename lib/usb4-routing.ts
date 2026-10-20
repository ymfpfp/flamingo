import type {AutoroutingPhase, Board, Port} from "tscircuit";
import type {FanoutTracePath} from "@tscircuit/props";
import {applyToPoint, compose, inverse, translate} from "transformation-matrix";
import {usb4Rules as rules} from "./high-speed-rules";

type Point = {x: number; y: number};
type Route = FanoutTracePath["route"];
export const usb4Contacts = [
  {name: "TX1_P", ball: "T1", contact: "A2"},
  {name: "TX1_N", ball: "T2", contact: "A3"},
  {name: "TX2_P", ball: "V2", contact: "B2"},
  {name: "TX2_N", ball: "V1", contact: "B3"},
  {name: "RX1_P", ball: "P1", contact: "B11"},
  {name: "RX1_N", ball: "P2", contact: "B10"},
  {name: "RX2_P", ball: "Y2", contact: "A11"},
  {name: "RX2_N", ball: "Y1", contact: "A10"},
] as const;

export const usb4BgaJoinX = 35.1;
export const usb4TopEscapePairs = new Set(["TX2", "RX1"]);
export const getUsb4BgaJoinX = (pair: string) => usb4TopEscapePairs.has(pair) ? usb4BgaJoinX : 35.4;

// TX1/RX2 escape on L6; TX2/RX1 stay on L1 at the BGA and reserve
// their two signal vias for the far USB-C connector row. All parts stay on top.
export const usb4RoutedContacts = usb4Contacts;
export const usb4PendingPairs: {name: string; reason: string}[] = [];

// Authored bottom-layer centerlines, all with horizontal ends. Equal left/right
// turns preserve the lengths of the two constant-offset paths. No path search.
function bridgeCenterline(pair: string, ballY: number, clampX: number, centerY: number): Point[] {
  const start = {x: getUsb4BgaJoinX(pair), y: ballY}, end = {x: clampX - (pair === "TX1" ? 0.35 : 0.8) - (0.3 - (rules.width + rules.gap)/2), y: centerY};
  if (pair === "RX1") return [start, {x:35.3,y:ballY}, {x:38.7,y:ballY-3.4},
    {x:38.7,y:centerY+0.5}, {x:39.2,y:centerY}, end];
  if (pair === "TX1") return [start, {x:35.5,y:ballY},
    {x:35.5+ballY-centerY,y:centerY}, end];
  if (pair === "TX2") return [start, {x:35.4,y:ballY},
    {x:35.4+ballY-centerY,y:centerY}, end];
  return [start, {x:35.5,y:ballY}, {x:35.5+centerY-ballY,y:centerY}, end];
}

// Draft two constant-offset polylines around an explicitly authored centerline.
// This only constructs the copper geometry; it does no path search or routing.
function offsetPolyline(points: Point[], offset: number): Point[] {
  const normals = points.slice(1).map((p,i) => {
    const dx=p.x-points[i].x, dy=p.y-points[i].y, length=Math.hypot(dx,dy);
    return {x:-dy/length,y:dx/length};
  });
  return points.map((p,i) => {
    const a=normals[Math.max(0,i-1)], b=normals[Math.min(i,normals.length-1)];
    const scale=offset/(1+a.x*b.x+a.y*b.y);
    return {x:p.x+(a.x+b.x)*scale,y:p.y+(a.y+b.y)*scale};
  });
}

const wire = (p: Point, layer: "top" | "bottom" = "top", width: number = rules.width) =>
  ({route_type: "wire" as const, ...p, width, layer});
const via = (p: Point, from: "top" | "bottom", to: "top" | "bottom", bga = false) =>
  ({route_type: "via" as const, ...p, from_layer: from, to_layer: to,
    via_diameter: bga ? rules.bgaViaDiameter : rules.viaDiameter,
    via_hole_diameter: bga ? rules.bgaViaHole : rules.viaHole});
const reverse = (route: Route): Route => [...route].reverse().map(p => p.route_type === "via"
  ? {...p, from_layer: p.to_layer, to_layer: p.from_layer} : p);

// Run after the project's bottom-left group placement hook. Native saved phases
// use the pre-layout group frame plus each source port's layout displacement.
// Convert our board-coordinate paths to that frame; native core emits the copper.
export function prepareUsb4Routing(board: Board, phase: AutoroutingPhase) {
  const port = (selector: string) => {
    const p = board.selectOne(selector, {type: "port"}) as Port | null;
    if (!p) throw new Error(`USB4 routing port missing: ${selector}`);
    return p;
  };
  const position = (selector: string) => port(selector)._getGlobalPcbPositionAfterLayout();
  const paths: FanoutTracePath[] = [];
  const add = (connection: string, route: Route) => {
    const p = port(connection);
    const before = p._getGlobalPcbPositionBeforeLayout();
    const after = p._getGlobalPcbPositionAfterLayout();
    const transform = inverse(compose(translate(after.x - before.x, after.y - before.y),
      phase.getGroup()!._computePcbGlobalTransformBeforeLayout()));
    paths.push({connection, route: route.map(point => ({...point,
      ...applyToPoint(transform, {x: Number(point.x), y: Number(point.y)})}))});
  };
  for (const {name, ball, contact} of usb4RoutedContacts) {
    const start = `ASM2464PDX.${ball}`, clamp = `D_USB_${name}.pin1`;
    const cap = `C_USB_${name}`, resistor = `R_USB_${name}.pin1`, connector = `USBC.${contact}`;
    const b = position(start), d = position(clamp), c = position(`${cap}.pin2`);
    const pair = name.slice(0, 3), inner = ball.endsWith("2");
    const mate = usb4RoutedContacts.find(c => c.name === `${pair}_${name.endsWith("_P") ? "N" : "P"}`)!;
    const mateBall = position(`ASM2464PDX.${mate.ball}`);
    const mateD = position(`D_USB_${mate.name}.pin1`);
    const centerY = (d.y + mateD.y) / 2;
    const sign = inner ? 1 : -1, halfPitch = (rules.width + rules.gap) / 2;
    if (usb4TopEscapePairs.has(pair)) {
      // Both necks have equal 3 mil copper length. The inner launch goes NE
      // between the original lands; the outer launch goes around their east
      // edge. Two chamfers balance the outer vertical leg without a meander.
      const pitch = Math.abs(b.x-mateBall.x), chamfer = 0.1, rise = 0.23;
      const h = pitch+rise*(Math.SQRT2-1)+2*chamfer*(2-Math.SQRT2);
      const launchCenterY = b.y+(rise-h)/2;
      const gather = (rise+h)/2-halfPitch;
      const gatherX = usb4BgaJoinX-gather;
      const join = {x:usb4BgaJoinX,y:launchCenterY+sign*halfPitch};
      const neckLength = rise*Math.SQRT2+(34.4-(Math.min(b.x,mateBall.x)+rise));
      const outerThinVertical = neckLength-((34.5-Math.max(b.x,mateBall.x))+chamfer*Math.SQRT2);
      const thinEndY = b.y-chamfer-outerThinVertical;
      const escape: Route = inner ? [wire(b,"top",rules.neckWidth),
        wire({x:b.x+rise,y:b.y+rise},"top",rules.neckWidth),
        wire({x:34.4,y:b.y+rise},"top",rules.neckWidth),wire({x:34.5,y:b.y+rise}),
        wire({x:gatherX,y:b.y+rise}),wire(join)]
        : [wire(b,"top",rules.neckWidth),wire({x:34.5,y:b.y},"top",rules.neckWidth),
          wire({x:34.6,y:b.y-chamfer},"top",rules.neckWidth),
          wire({x:34.6,y:thinEndY},"top",rules.neckWidth),wire({x:34.6,y:thinEndY-0.1}),
          wire({x:34.6,y:b.y-h+chamfer}),wire({x:34.7,y:b.y-h}),
          wire({x:gatherX,y:b.y-h}),wire(join)];
      const line = pair === "TX2" ? [
        {x:usb4BgaJoinX,y:launchCenterY},{x:35.15,y:launchCenterY},
        {x:35.45,y:launchCenterY+0.3},{x:35.45,y:100.91175},
        {x:35.75,y:101.21175},{x:39.1,y:101.21175},{x:39.93175,y:centerY},{x:40,y:centerY},
      ] : [
        {x:usb4BgaJoinX,y:launchCenterY},{x:35.2,y:launchCenterY},
        {x:35.3,y:launchCenterY-0.1},{x:35.3,y:97.55},{x:36.02,y:96.83},
        {x:38.2,y:96.83},{x:39.2,y:95.83},{x:39.2,y:94.65},{x:39.8,y:centerY},{x:40,y:centerY},
      ];
      const paired = offsetPolyline(line,sign*halfPitch);
      const flare = {x:d.x-0.05-halfPitch,y:d.y};
      add(start,[...escape,...paired.slice(1).map(p=>wire(p)),wire(flare),wire(d)]);
    } else {
      const join = {x:getUsb4BgaJoinX(pair), y:b.y + sign * halfPitch};
      const chamfer = 0.1;
      const h = (Math.abs(b.x - mateBall.x) + 2 * halfPitch * (Math.SQRT2 - 1)
        + chamfer * (2 - Math.SQRT2)) / Math.SQRT2;
      const v = {x:35, y:b.y-h};
      const escape: Route = inner ? [wire(b), via(b,"top","bottom",true), wire(b,"bottom"),
        wire({x:b.x+halfPitch,y:b.y+halfPitch},"bottom"), wire(join,"bottom")]
        : [wire(b), wire({x:v.x-chamfer,y:b.y}), wire({x:v.x,y:b.y-chamfer}), wire(v),
          via(v,"top","bottom",true), wire(v,"bottom"),
          wire({x:v.x+h-halfPitch,y:join.y},"bottom"), wire(join,"bottom")];
      const paired = offsetPolyline(bridgeCenterline(pair,b.y,d.x,centerY), sign * halfPitch);
      const returnVia = {x:d.x-(pair === "TX1" ? 0.35 : 0.8),y:centerY+sign*0.3};
      const topFlare = {x:returnVia.x+Math.abs(d.y-returnVia.y),y:d.y};
      add(start,[...escape,...paired.slice(1).map(p=>wire(p,"bottom")),wire(returnVia,"bottom"),
        via(returnVia,"bottom","top"),wire(returnVia),wire(topFlare),wire(d)]);
    }
    add(`${cap}.pin2`,[wire(c),wire({x:c.x-Math.abs(c.y-d.y),y:d.y}),wire(d)]);
    const a = position(`${cap}.pin1`), r = position(resistor), end = position(connector);
    add(`${cap}.pin1`,[wire(a),wire(r)]);
    const mateEnd = position(`USBC.${mate.contact}`);
    const connectorCenterY = (end.y + mateEnd.y) / 2;
    const connectorSign = end.y > connectorCenterY ? 1 : -1;
    const mateR = position(`R_USB_${mate.name}.pin1`);
    const resistorCenterY = (r.y + mateR.y) / 2;
    const viaHalfPitch = 0.3, gather = viaHalfPitch - halfPitch;
    if (pair === "RX2") {
      // Stay on L1 from the top bank to the near connector row. TX2's launch
      // vias sit farther left so this coupled corridor passes beside them.
      const contactHalfPitch = Math.abs(end.y-mateEnd.y)/2;
      const topLine = [{x:r.x+0.55-halfPitch,y:resistorCenterY},
        {x:44,y:resistorCenterY},{x:44.1,y:resistorCenterY-0.1},
        {x:44.1,y:connectorCenterY+0.25},{x:44.35,y:connectorCenterY},
        {x:end.x-contactHalfPitch+halfPitch,y:connectorCenterY}];
      add(connector,reverse([wire(r),...offsetPolyline(topLine,connectorSign*halfPitch).map(p=>wire(p)),wire(end)]));
    } else if (contact.startsWith("B")) {
      const v1 = {x:pair === "RX1" ? 43.65 : 43.45,y:resistorCenterY+connectorSign*viaHalfPitch};
      const v2 = {x:45.95,y:connectorCenterY+connectorSign*viaHalfPitch};
      const centerline = pair === "RX1" ? [
        {x:v1.x+gather,y:resistorCenterY},{x:43.95,y:resistorCenterY},
        {x:44.1,y:resistorCenterY+0.15},{x:44.1,y:connectorCenterY-1},
        {x:45.1,y:connectorCenterY},{x:v2.x-gather,y:connectorCenterY},
      ] : [{x:v1.x+gather,y:resistorCenterY},{x:v2.x-gather,y:connectorCenterY}];
      const bottom = [v1,...offsetPolyline(centerline,connectorSign*halfPitch),v2];
      const gatherTop = Math.abs(r.y-v1.y);
      add(connector,reverse([wire(r),wire({x:v1.x-gatherTop,y:r.y}),wire(v1),via(v1,"top","bottom"),
        ...bottom.map(p=>wire(p,"bottom")),via(v2,"bottom","top"),wire(v2),
        wire({x:v2.x+Math.abs(end.y-v2.y),y:end.y}),wire(end)]));
    } else {
      const gatherX = 43.8, gatherLength = Math.abs(end.y-r.y);
      add(connector,reverse([wire(r),wire({x:gatherX,y:r.y}),
        wire({x:gatherX+gatherLength,y:end.y}),wire(end)]));
    }
  }
  phase._parsedProps.pcbTracePaths = paths as typeof phase._parsedProps.pcbTracePaths;
}
