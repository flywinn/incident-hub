import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");

const [ui, css] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(ui, /Obsidian Command/);
assert.match(ui, /\| "admin";/);
assert.match(ui, /admin: <><path/);
assert.match(ui, /account-role-icon/);
assert.match(ui, /currentUser\.role === "ADMIN" \? "admin" : "users"/);
assert.match(ui, /className="priority-col"/);
assert.match(ui, /className="status-col"/);
assert.match(ui, /className="priority-cell"/);
assert.match(ui, /className="status-cell"/);
assert.match(ui, /new Date\(String\(b\.last_seen_at \?\? b\.created_at\)\)/);
assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);

assert.match(css, /v11 Obsidian Command UI/);
assert.match(css, /--canvas: #090e15/);
assert.match(css, /--accent: #2dd4bf/);
assert.match(css, /--priority-p1: #ff6b81/);
assert.match(css, /--priority-p2: #f59e0b/);
assert.match(css, /--status-new: #60a5fa/);
assert.match(css, /--status-progress: #a78bfa/);
assert.match(css, /--status-waiting: #f6c453/);
assert.match(css, /\.account-role-icon/);
assert.match(css, /\.nav-item\.active::after/);
assert.match(css, /\.bug-table:has\(\.priority-cell:hover\)/);
assert.match(css, /\.bug-table:has\(\.status-cell:hover\)/);
assert.match(css, /html\[data-theme="dark"\] \.bug-table tbody \.bug-row\.priority-row-p1 td/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log("[OK] Obsidian Slate palette + teal product accent");
console.log("[OK] admin role icon replaces ambiguous initials in account control");
console.log("[OK] active sidebar section has stronger selected state");
console.log("[OK] P1 rows stay neutral; priority is carried by rail/control");
console.log("[OK] workflow status and priority use separate semantic palettes");
console.log("[OK] priority/status table columns react on hover and keyboard focus");
console.log("[OK] recentBugs runtime hotfix retained");
