import {readFileSync, writeFileSync} from "node:fs";

// Keep the browser-compatible text bundle in sync with the editable SVG files.
const artwork = new URL("../assets/artwork/", import.meta.url);
// tscircuit's SVG reader requires each path's d attribute on one line.
const readSvg = file => readFileSync(new URL(file, artwork), "utf8")
  .replace(/\bd="([^"]*)"/g, (_match, path) => `d="${path.trim().replace(/\s+/g, " ")}"`);
const bundle = {
  flamingo: readSvg("flamingo.svg"),
  badge: readSvg("ts-mark.svg"),
};
writeFileSync(new URL("silkscreen.json", artwork), `${JSON.stringify(bundle, null, 2)}\n`);
