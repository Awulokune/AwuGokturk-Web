import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function readJson(rel) {
  return JSON.parse(readText(rel));
}

export function loadManifestForTest() {
  return readJson("runtime/model/manifest.json");
}
