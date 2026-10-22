import {readFileSync} from "node:fs";

// `bun run test` builds this artifact once before running the board assertions.
export function boardFixture(file = process.env.BOARD_TEST_FIXTURE ?? "dist/board.circuit.json") {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return raw.circuitJson ?? raw;
}
