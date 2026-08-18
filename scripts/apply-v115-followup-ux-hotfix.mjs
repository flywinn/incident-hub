import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const file = path.join(root, "app", "incident-hub.tsx");
let source = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");

const before = "Math.max(0, (Date.now() - scheduledAt) / 3_600_000)";
const after = "Math.max(0, (pageLoadedAt - scheduledAt) / 3_600_000)";

if (source.includes(after)) {
  console.log("[OK] Follow-up overdue calculation already uses the stable page timestamp.");
  process.exit(0);
}

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`[FAIL] Expected one generated Date.now overdue calculation, found ${count}.`);
}

source = source.replace(before, after);
await writeFile(file, source, "utf8");
console.log("[OK] Follow-up overdue calculation uses pageLoadedAt; React render stays pure.");
