import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";

export async function auditDatasheets(bom, index) {
  const records = [];
  function visit(value) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      records.push(value);
      Object.values(value).forEach(visit);
    }
  }
  visit(index);
  const errors = [], checked = new Set();
  for (const record of records) {
    if (typeof record.file !== "string" || !record.file.endsWith(".pdf") || !record.sha256) continue;
    const file = `datasheets/${record.file}`;
    if (checked.has(file)) continue;
    let data;
    try { data = await readFile(file); }
    catch {
      if (record.retained_locally !== false) errors.push(`Missing ${file}`);
      continue;
    }
    checked.add(file);
    if (createHash("sha256").update(data).digest("hex") !== record.sha256) errors.push(`Hash mismatch: ${file}`);
  }
  const missingBOMSourceEntries = bom.filter(b => !records.some(r => r.manufacturer_part_number === b.manufacturerPartNumber)).map(b => b.manufacturerPartNumber);
  return {checkedPDFs: checked.size, partGroupsChecked: bom.length, errors, missingBOMSourceEntries,
    limitation: "A source-index entry or matching file hash establishes document traceability, not electrical suitability."};
}
