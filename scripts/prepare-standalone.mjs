import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const standalone = resolve(root, ".next/standalone");
if (!existsSync(resolve(standalone, "server.js"))) {
  throw new Error("Standalone server was not generated. Check next.config.ts and the build output.");
}

const publicSource = resolve(root, "public");
const publicTarget = resolve(standalone, "public");
if (existsSync(publicSource)) cpSync(publicSource, publicTarget, { recursive: true, force: true });

const staticSource = resolve(root, ".next/static");
const staticTarget = resolve(standalone, ".next/static");
mkdirSync(resolve(standalone, ".next"), { recursive: true });
if (existsSync(staticSource)) cpSync(staticSource, staticTarget, { recursive: true, force: true });

console.log("Standalone runtime prepared.");
