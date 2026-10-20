import {spawnSync} from "node:child_process";
const run=(command,args)=>{const r=spawnSync(command,args,{stdio:"inherit"});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1)};
const file=process.argv[2]??"dist/usb4-routing/board.circuit.json";
run(process.execPath,[process.argv[2]?"scripts/review-usb4-routing.mjs":"scripts/build-usb4-routing.mjs",...(process.argv[2]?[file]:[])]);
const python=process.env.USB_SI_PYTHON??process.env.PCIE_SI_PYTHON??"python3";
run(python,["simulations/usb4/check_layout.py",file]);
run(python,["simulations/usb4/check_reference_planes.py",file]);
