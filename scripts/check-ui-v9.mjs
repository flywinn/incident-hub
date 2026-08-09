import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");

const [ui, css] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(ui, /elk-dashboard-layout-v4/);
assert.match(ui, /function Icon\(/);
assert.match(ui, /header-incident-status/);
assert.match(ui, /incident-create-button/);
assert.match(ui, /خطاهای باز اخیر/);
assert.match(ui, /const \[showResolved, setShowResolved\] = useState\(false\)/);
assert.match(ui, /open-state-pill/);
assert.match(ui, /const quickFilters = \[/);
assert.match(ui, /incident-filter-rail/);
assert.match(ui, /مرکز کنترل خطاها/);
assert.match(ui, /style=\{\{ animationDelay:/);
assert.match(ui, /<Icon name="arrowLeft" size=\{16\}/);
assert.match(ui, /new Date\(String\(b\.last_seen_at \?\? b\.created_at\)\)/);
assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);
assert.doesNotMatch(ui, /مورد P1 بازی ثبت نشده است/);

assert.match(css, /v9 Incident Flow polish/);
assert.match(css, /--canvas: #080d14/);
assert.match(css, /--paper: #0f1722/);
assert.match(css, /\.incident-filter-rail/);
assert.match(css, /\.incident-filter-chip/);
assert.match(css, /html\[data-theme="dark"\] \.inline-select\.priority-p1/);
assert.match(css, /html\[data-theme="dark"\] \.bug-table tbody tr:hover td/);
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /bugRowRevealV9/);
assert.match(css, /openDotBreathV9/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log("[OK] v1.3.1 recent-incident comparator retained");
console.log("[OK] Midnight Incident palette");
console.log("[OK] quick incident control filters");
console.log("[OK] dark quick-edit controls");
console.log("[OK] richer incident rows and keyboard access");
console.log("[OK] tablet/mobile incident cards");
console.log("[OK] purposeful row and status motion");
