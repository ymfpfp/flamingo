import {cacheRuntime} from "../simulations/power-reset/engine.mjs";
await cacheRuntime();
console.log("Cached the pinned tscircuit ngspice runtime. Simulations can now run without network access.");
