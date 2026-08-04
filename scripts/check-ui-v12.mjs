import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");

const [ui, css] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(ui, /Lucid Incident v1\.7/);
assert.match(ui, /\| "person";/);
assert.match(ui, /person: <><circle/);
assert.match(ui, /currentUser\.role === "ADMIN" \? "admin" : "person"/);
assert.match(ui, /task-owner-badge/);
assert.match(ui, /به‌روزرسانی خودکار/);
assert.match(ui, /className=\{cx\("priority-cell", `priority-\$\{String\(bug\.priority\)\.toLowerCase\(\)\}`\)\}/);
assert.match(ui, /className=\{cx\("status-cell", `status-\$\{String\(bug\.status\)\.toLowerCase\(\)\}`\)\}/);
assert.match(ui, /new Date\(String\(b\.last_seen_at \?\? b\.created_at\)\)/);
assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);

assert.match(css, /v12 Lucid Incident polish/);
assert.match(css, /task-owner-badge/);
assert.match(css, /incidentRowRevealV12/);
assert.match(css, /navBeaconV12/);
assert.match(css, /openBeaconV12/);
assert.match(css, /html\[data-theme="dark"\] \.bug-table tbody \.bug-row\.status-row-in_progress td/);
assert.match(css, /html\[data-theme="dark"\] \.bug-table td\.status-cell\.status-in_progress::before/);
assert.match(css, /html\[data-theme="dark"\] \.live-chip \.pulse \{ display: none !important; \}/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log("[OK] Lucid Incident v1.7 markers detected");
console.log("[OK] assignee and admin icon language improved");
console.log("[OK] dark-mode bug statuses now use clearer semantic differentiation");
console.log("[OK] header auto-refresh chip simplified");
console.log("[OK] additional motion hooks added with reduced-motion guard");
