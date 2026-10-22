import {readFileSync, writeFileSync} from "node:fs";

// Keep the browser-compatible text bundle in sync with the editable SVG files.
const artwork = new URL("../assets/artwork/", import.meta.url);
const bundle = {
  flamingo: readFileSync(new URL("flamingo.svg", artwork), "utf8"),
  badge: readFileSync(new URL("ts-mark.svg", artwork), "utf8"),
};
writeFileSync(new URL("silkscreen.json", artwork), `${JSON.stringify(bundle, null, 2)}\n`);
