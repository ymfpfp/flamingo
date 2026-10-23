import type {Board, PrimitiveComponent} from "tscircuit";

type RoutingScope = Pick<Board, "selectAll" | "getSubcircuit">;
const scopedGroups = new WeakSet<RoutingScope>();

// The preview's prebuilt core does not include the node_modules phase-scope
// patch. Keep a child's saved phases out of its parent's routing plans there too.
export function scopeAutoroutingPhases(group: RoutingScope) {
  if (scopedGroups.has(group)) return;
  scopedGroups.add(group);
  const selectAll = group.selectAll;
  group.selectAll = function<T extends PrimitiveComponent>(selector: string) {
    const matches = selectAll.call(this, selector) as T[];
    return selector === "autoroutingphase"
      ? matches.filter(phase => phase.getSubcircuit() === this.getSubcircuit())
      : matches;
  };
}
