import {RootCircuit} from "tscircuit";
import Board from "../index.circuit";
import {reviewUsb4Routing} from "./review-usb4-routing.mjs";

const circuit = new RootCircuit({platform: {partsEngineDisabled: true}});
circuit.schematicDisabled = true;
circuit.add(Board());
await circuit.renderUntilSettled();
const {report, audit, usb2Audit} = await reviewUsb4Routing(circuit.getCircuitJson());
process.exitCode = report.passed && audit.passed && usb2Audit.passed ? 0 : 1;
