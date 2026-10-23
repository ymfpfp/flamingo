import type {Board} from "tscircuit";

const configuredBoards = new WeakSet<Board>();

export function configurePreviewPlatform(board: Board) {
  if (configuredBoards.has(board)) return;
  configuredBoards.add(board);
  const renderChildren = board.runRenderPhaseForChildren;
  // Refs run before RootCircuit attaches the board. Configure the platform
  // before any child queues supplier requests or full copper checks.
  board.runRenderPhaseForChildren = function(phase) {
    const root = this.root!;
    root.platform ??= {};
    root.platform.partsEngineDisabled = true;
    // The check:board/check:drc commands validate the emitted copper separately.
    root.platform.routingDrcChecksDisabled = true;
    return renderChildren.call(this, phase);
  };
}
