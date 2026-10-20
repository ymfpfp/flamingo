import {spawnSync} from "node:child_process";

const json = process.argv[2] ?? "dist/pcie-tx-routing/board.circuit.json";
const run = (command, args) => {
  const result = spawnSync(command, args, {stdio: "inherit"});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(process.execPath, ["scripts/check-pcie-tx-routing.mjs", ...(process.argv[2] ? [json] : [])]);
run(process.execPath, ["scripts/check-pcie-rx-routing.mjs", json]);
// Use the same Shapely environment as the existing PCB SI review.
const python = process.env.PCIE_SI_PYTHON ?? "python3";
run(python, ["simulations/pcie-tx/check_asmedia_spacing.py", json, "--self-test"]);
run(python, ["simulations/pcie-tx/check_reference_planes.py", json]);
