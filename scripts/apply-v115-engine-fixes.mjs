import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const file = path.join(root, "lib", "email-intelligence.ts");
let source = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");

const before = String.raw`/\bHost[A-Za-z0-9_.-]*\b/gi,`;
const after = String.raw`/\bHost[A-Za-z0-9_.-]+\b/gi,`;

if (source.includes(after)) {
  console.log("[OK] Host server extraction fix already applied.");
  process.exit(0);
}

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`[FAIL] Expected exactly one Host server regex, found ${count}.`);
}

source = source.replace(before, after);
await writeFile(file, source, "utf8");
console.log("[OK] HostW remains detectable while the bare 'Host:' label is not emitted as a server.");
