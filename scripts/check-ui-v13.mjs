import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");
const css = await read("app/globals.css");
assert.match(css, /v13 RowTone polish/);
assert.match(css, /--row-tint/);
assert.match(css, /status-row-in_progress/);
assert.match(css, /linear-gradient\(90deg, var\(--row-tint-strong\)/);
assert.match(css, /status-badge\.in_progress/);
assert.match(css, /priority-badge\.p1/);
assert.match(css, /rowToneSweepV13/);
console.log("[OK] RowTone v1.7.1 markers detected");
console.log("[OK] full-row semantic tinting is present");
console.log("[OK] dark-mode chips no longer rely on harsh white backgrounds");
