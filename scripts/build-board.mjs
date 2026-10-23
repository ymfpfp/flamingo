import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {RootCircuit} from "tscircuit";
import Board from "../index.circuit";

export async function loadBoard(file, {omitControlNets=[],pcbOnly=false} = {}) {
  if (file) {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return raw.circuitJson ?? raw;
  }
  // Keep source and placement diagnostics. The validator checks routed copper.
  const circuit = new RootCircuit({platform: {partsEngineDisabled: true, routingDrcChecksDisabled: true}});
  circuit.schematicDisabled=pcbOnly;
  circuit.add(Board({omitControlNets,preview:false}));
  const progress=process.env.BOARD_BUILD_PROGRESS==='1';
  if(progress)circuit.on('solver:started',({solverName,componentName})=>console.log('Native solver:',solverName,componentName));
  const timer=progress?setInterval(()=>console.log('Pending render:',JSON.stringify(circuit.getRunningAsyncEffects().map(e=>({phase:e.phase,component:e.componentDisplayName,name:e.effectName})))) ,10000):undefined;
  try{await circuit.renderUntilSettled();}finally{if(timer)clearInterval(timer);}
  return circuit.getCircuitJson();
}
export function saveBoard(json, file = "dist/board.circuit.json") {
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, JSON.stringify(json));
  return file;
}
if (import.meta.main) {
  const omit=process.argv.find(a=>a.startsWith('--omit-control-nets='))?.split('=')[1];
  saveBoard(await loadBoard(undefined,{omitControlNets:omit?.split(',')??[],pcbOnly:process.argv.includes('--pcb-only')}),process.argv[2]);
}
