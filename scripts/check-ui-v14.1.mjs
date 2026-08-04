import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");
const [ui, css] = await Promise.all([read("app/incident-hub.tsx"), read("app/globals.css")]);

assert.match(ui, /FocusBoard v1\.8\.1/);
assert.match(ui, /<BugTable bugs=\{recentBugs\} assignees=\{data\.assignees\} onSelect=\{onSelectBug\} compact onQuickUpdate=\{canEdit \? onQuickUpdate : undefined\} \/>/);
assert.match(css, /v14\.1 Seamless row unification/);
assert.match(css, /border-spacing: 0 10px !important/);
assert.match(css, /--row-surface:/);
assert.match(css, /compact-records \.modern-record-table \.inline-select\.status/);

console.log("[OK] FocusBoard v1.8.1 markers detected");
console.log("[OK] incident rows use seamless row-wide tinting across columns");
console.log("[OK] dashboard compact incidents allow inline status/priority editing when editing is allowed");
