import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {test} from "node:test";
import {patchFileLoading} from "../scripts/prepare-preview-runtime.mjs";

const source = readFileSync(createRequire(import.meta.url).resolve("tscircuit/browser"), "utf8");

function getFileLoader(bundle, fileList, readFile) {
  const start = bundle.indexOf("async function BWo(){");
  const end = bundle.indexOf("const bWo=", start);
  assert.ok(start >= 0 && end > start, "locate the installed viewer's file loader");
  return new Function("fetch", "g2", "tRe", "eRe", `${bundle.slice(start, end)};return BWo;`)(
    async () => ({json: async () => ({file_list: fileList})}), "/api", readFile,
    path => /\.(tsx?|jsx?|json)$/.test(path),
  );
}

test("preview startup loads files concurrently, preserves contents and order, and bounds requests", async () => {
  const paths = ["index.circuit.tsx", "models/part.glb",
    ...Array.from({length: 40}, (_, i) => `lib/part${i}.ts`)];
  const files = paths.map(file_path => ({file_path}));
  for (const [bundle, expectedConcurrency] of [[source, 1], [patchFileLoading(source), 16]]) {
    let active = 0, maximum = 0;
    const reads = [];
    const load = getFileLoader(bundle, files, async path => {
      reads.push(path);
      maximum = Math.max(maximum, ++active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      return {text_content: `contents of ${path}`};
    });
    const loaded = await load();
    assert.equal(maximum, expectedConcurrency);
    assert.deepEqual([...loaded.keys()], paths);
    assert.equal(loaded.get("models/part.glb"), "__STATIC_ASSET__");
    assert.equal(reads.length, paths.length - 1);
    for (const path of reads) assert.equal(loaded.get(path), `contents of ${path}`);
  }
});

test("preview file loading handles empty projects and reports failed downloads", async () => {
  const patched = patchFileLoading(source);
  const fail = async () => { throw new Error("download failed"); };
  assert.equal((await getFileLoader(patched, [], fail)()).size, 0);
  await assert.rejects(getFileLoader(patched, [{file_path: "index.circuit.tsx"}], fail)(), /download failed/);
  assert.equal(patchFileLoading(patched), patched);
  assert.throws(() => patchFileLoading("unknown viewer"), /runtime changed/);
});
