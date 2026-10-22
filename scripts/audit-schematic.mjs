import {readFile, mkdir, writeFile} from "node:fs/promises";
import {auditCircuit, electricalMargins} from "../tests/audits/schematic-audit.mjs";
import {auditDatasheets} from "../tests/audits/datasheet-audit.mjs";
const path = process.argv[2] ?? "dist/board.circuit.json";
const json = JSON.parse(await readFile(path, "utf8"));
const errors = json.filter(e => e.type.startsWith("source_") && e.type.endsWith("_error"));
if (errors.length) throw new Error(`The input circuit contains ${errors.length} errors.`);
const report = auditCircuit(json);
await mkdir("dist/schematic-review", {recursive: true});
await writeFile("dist/schematic-review/connectivity.json", JSON.stringify(report, null, 2) + "\n");
const margins = electricalMargins(json);
await writeFile("dist/schematic-review/margins.json", JSON.stringify(margins, null, 2) + "\n");
const dnp = new Set(json.filter(e => e.type === "pcb_component" && e.do_not_place).map(e => e.source_component_id));
const bom = new Map();
for (const c of json.filter(e => e.type === "source_component" && !dnp.has(e.source_component_id))) {
  const key = c.manufacturer_part_number ?? `UNSELECTED:${c.name}`;
  if (!bom.has(key)) bom.set(key, {manufacturerPartNumber: key, supplierPartNumbers: c.supplier_part_numbers ?? {}, quantity: 0, references: []});
  bom.get(key).quantity++;
  bom.get(key).references.push(c.name);
}
await writeFile("dist/schematic-review/bom.json", JSON.stringify([...bom.values()], null, 2) + "\n");
const sources = JSON.parse(await readFile("datasheets/sources.json", "utf8"));
const datasheets = await auditDatasheets([...bom.values()], sources);
await writeFile("dist/schematic-review/datasheet-check.json", JSON.stringify(datasheets, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
console.log(`Datasheets: ${datasheets.checkedPDFs} hashes, ${datasheets.partGroupsChecked} BOM groups checked.`);
const buckScreeningPass = margins.converter.every(c => c.staticVoltageRangePass && c.datasheetLcSelectionPass
  && c.inductorPeakAtLoadEnvelopeA < c.minimumBuckPeakCurrentLimitA
  && c.inductorPeakAtLoadEnvelopeA < c.inductor10PercentDropCurrentA
  && c.inductorRmsAtLoadEnvelopeA < c.inductorIrmsRatingA);
console.log(`Buck static-voltage and filter screening: ${buckScreeningPass ? "PASS" : "FAIL"}. Hardware qualification remains open.`);
if (report.findings.some(f => f.severity === "error") || datasheets.errors.length || datasheets.missingBOMSourceEntries.length || !buckScreeningPass) process.exitCode = 1;
