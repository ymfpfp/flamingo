import type {Board, Trace} from "tscircuit";

const installedBoards = new WeakSet<Board>();

// Core detects decoupling capacitors during SourceRender, before its normal
// selector-cache phase. Reuse lookups only within that synchronous pass so an
// async footprint update or a later edit cannot reuse stale ports or failures.
export function cacheSourceConnectionLookups(board: Board) {
  if (installedBoards.has(board)) return;
  installedBoards.add(board);
  const renderChildren = board.runRenderPhaseForChildren;
  board.runRenderPhaseForChildren = function(phase) {
    if (phase !== "SourceRender") return renderChildren.call(this, phase);
    const components = [this, ...this.getDescendants()];
    const restore: Array<() => void> = [];
    try {
      for (const scope of components.filter(component => component.isSubcircuit)) {
        // Use core's own alias expansion, including each subcircuit's scope.
        // Separate maps prevent its later cache phase from appending duplicates.
        const selectAllCache = scope._cachedSelectAllQueries;
        const selectOneCache = scope._cachedSelectOneQueries;
        scope._cachedSelectAllQueries = new Map();
        scope._cachedSelectOneQueries = new Map();
        restore.push(() => {
          scope._cachedSelectAllQueries = selectAllCache;
          scope._cachedSelectOneQueries = selectOneCache;
        });
        scope.doInitialOptimizeSelectorCache();
      }
      for (const component of components) {
        if (component.lowercaseComponentName !== "trace") continue;
        const trace = component as Trace;
        const findPorts = trace._findConnectedPorts;
        const hadOwnMethod = Object.prototype.hasOwnProperty.call(trace, "_findConnectedPorts");
        let cached: {value: ReturnType<Trace["_findConnectedPorts"]>} | {error: unknown} | undefined;
        trace._findConnectedPorts = function() {
          if (cached) {
            if ("error" in cached) throw cached.error;
            return cached.value;
          }
          try {
            const value = findPorts.call(this);
            cached = {value};
            return value;
          } catch (error) {
            cached = {error};
            throw error;
          }
        };
        restore.push(() => {
          if (hadOwnMethod) trace._findConnectedPorts = findPorts;
          else Reflect.deleteProperty(trace, "_findConnectedPorts");
        });
      }
      return renderChildren.call(this, phase);
    } finally {
      for (const reset of restore.reverse()) reset();
    }
  };
}
