import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const cache = new Map();

export function loadConfig(directory) {
  const key = basename(directory);
  if (!cache.has(key)) {
    cache.set(key, JSON.parse(readFileSync(join(directory, "config.json"), "utf8")));
  }
  return cache.get(key);
}

export function clearConfigCache() {
  cache.clear();
}
