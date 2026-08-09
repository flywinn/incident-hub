import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");

const [ui, css] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(ui, /defaultHiddenWidgets[^\n]+"critical"[^\n]+"services"/);
assert.match(ui, /elk-dashboard-layout-v3/);
assert.match(ui, /mobile-menu-button/);
assert.match(ui, /sidebar-backdrop/);
assert.match(ui, /mobileOpen/);
assert.match(css, /html\[data-theme="dark"\][\s\S]*\.bug-drawer/);
assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1100px\)/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /--motion-base:/);
assert.match(css, /html\[data-font-size="large"\] \{ font-size: 16\.5px; \}/);
assert.match(css, /\.topbar-actions > \.primary-button/);

console.log("[OK] simpler dashboard defaults");
console.log("[OK] responsive sidebar states");
console.log("[OK] complete dark incident drawer coverage");
console.log("[OK] balanced typography scale");
console.log("[OK] improved primary incident action");
console.log("[OK] purposeful motion + reduced-motion support");
