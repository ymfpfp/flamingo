// Native pcbPaths use a port's coordinate frame. This existing board-level via
// supplies a fixed frame while the group-anchor workaround moves components.
const origin = {selector: "USB4_GND_RETURN_0.top", x: 42.65, y: 100.74475};

type Props = {name: string; from: string; to: string; width: number; points: number[][]; exactPadContacts?: boolean};
export function FixedTrace({name, from, to, width, points, exactPadContacts=false}: Props) {
  const path=points.map(([x,y])=>({x:x-origin.x,y:y-origin.y}));
  return <trace name={name} from={from} to={to} width={width} maxViaCount={0}
    pcbPathRelativeTo={origin.selector}
    pcbPaths={[exactPadContacts ? path : [from, ...path, to]]}/>;
}
