import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {RootCircuit} from "tscircuit";
import Board from "../index.circuit";

export async function loadBoard(file, {omitControlNets=[]} = {}) {
  if (file) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return raw.circuitJson ?? raw;
  }
  // Keep source and placement diagnostics. The validator checks routed copper.
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDrcChecksDisabled: true}});
  circuit.add(Board({omitControlNets}));
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}
export function saveBoard(json, file = "dist/board.circuit.json") {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, JSON.stringify(json));
  return file;
}
if (import.meta.main) {
  const omit=process.argv.find(a=>a.startsWith('--omit-control-nets='))?.split('=')[1];
  saveBoard(await loadBoard(undefined,{omitControlNets:omit?.split(',')??[]}),process.argv[2]);
}
