import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const file = path.join(root, "lib", "email-intelligence.ts");
let source = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
let changed = false;

const hostBefore = String.raw`/\bHost[A-Za-z0-9_.-]*\b/gi,`;
const hostAfter = String.raw`/\bHost[A-Za-z0-9_.-]+\b/gi,`;

if (source.includes(hostBefore)) {
  const count = source.split(hostBefore).length - 1;
  if (count !== 1) {
    throw new Error(`[FAIL] Expected exactly one Host server regex, found ${count}.`);
  }
  source = source.replace(hostBefore, hostAfter);
  changed = true;
  console.log("[OK] HostW extraction fix applied.");
} else if (source.includes(hostAfter)) {
  console.log("[OK] HostW extraction fix already present.");
} else {
  throw new Error("[FAIL] Host server extraction regex was not found.");
}

const followupBefore = `if (historyCount > 0 && ["IN_PROGRESS", "WAITING", "REOPENED", "NEW"].includes(status)) return "FOLLOW_UP";`;
const followupAfter = `if (historyCount > 0 && ["IN_PROGRESS", "WAITING", "REOPENED"].includes(status)) return "FOLLOW_UP";`;

if (source.includes(followupBefore)) {
  source = source.replace(followupBefore, followupAfter);
  changed = true;
  console.log("[OK] NEW incidents no longer auto-switch to follow-up merely because email history exists.");
} else if (source.includes(followupAfter)) {
  console.log("[OK] New-incident SmartMail recommendation is already refined.");
} else {
  throw new Error("[FAIL] SmartMail follow-up recommendation condition was not found.");
}

if (changed) {
  await writeFile(file, source, "utf8");
  console.log(`[OK] Updated: ${file}`);
} else {
  console.log("[OK] No engine changes were required.");
}
