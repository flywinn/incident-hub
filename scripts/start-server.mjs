import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

const root = resolve(".");
loadEnv(resolve(root, ".env.production"));
process.env.NODE_ENV = "production";
process.env.HOSTNAME ??= "0.0.0.0";
process.env.PORT ??= "3000";

const entry = resolve(root, ".next/standalone/server.js");
if (!existsSync(entry)) {
  throw new Error("Build output not found. Run npm run build first.");
}
await import(pathToFileURL(entry).href);
