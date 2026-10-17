import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import createNgspice from "@tscircuit/ngspice-spice-engine";

// This is the exact runtime URL used by ngspice-spice-engine 0.0.20.
export const runtimeUrl = "https://jscdn.tscircuit.com/@tscircuit/eecircuit-engine/1.7.6/+esm";
export const runtimeHash = "f1c52ee7b16eead44675d7a1c3d4a9f868c19e58705d5c4b3b59f9c09a1c3dbd";
const cache = new URL("../../.tscircuit/spice/eecircuit-engine-1.7.6.mjs", import.meta.url);

function checkRuntime(source) {
  if (createHash("sha256").update(source).digest("hex") !== runtimeHash) {
    throw new Error("The SPICE runtime hash changed. Review the runtime before updating its recorded hash.");
  }
}

export async function cacheRuntime() {
  const response = await fetch(runtimeUrl);
  if (!response.ok) throw new Error(`SPICE runtime download failed: HTTP ${response.status}`);
  const source = await response.text();
  checkRuntime(source);
  await mkdir(fileURLToPath(new URL(".", cache)), {recursive: true});
  await writeFile(cache, source);
}

export async function createEngine() {
  let source;
  try { source = await readFile(cache, "utf8"); }
  catch { throw new Error("SPICE runtime is missing. Run `bun run sim:setup` once with network access."); }
  checkRuntime(source);
  const engine = await createNgspice();
  return {
    // The upstream adapter imports its runtime through fetch, even under Bun.
    // Supply only that exact request from the checked local cache. Runs are serial.
    async simulate(deck) {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input, options) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        return url === runtimeUrl
          ? Promise.resolve(new Response(source, {headers: {"Content-Type": "text/javascript"}}))
          : originalFetch(input, options);
      };
      try { return await engine.simulate(deck); }
      finally { globalThis.fetch = originalFetch; }
    },
  };
}
