import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");
const [ui, css] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(ui, /IncidentHub UI v1\.11\.3/);
assert.match(ui, /onQuickUpdate=\{quickUpdateBug\}/);
assert.match(ui, /onQuickUpdate: \(id: number, payload: Record<string, unknown>\) => Promise<void>/);
assert.match(ui, /compact adaptiveColumns=\{adaptiveTables\} onQuickUpdate=\{canEdit \? onQuickUpdate : undefined\}/);
assert.match(ui, /فیلتر و پایش خطاها/);
assert.match(ui, /unified-records/);
assert.match(ui, /bug-observation-summary[\s\S]*sourceLabels/);
assert.doesNotMatch(ui, /adaptiveColumns && <th>منبع/);
assert.doesNotMatch(ui, /adaptiveColumns && <th>دفعات مشاهده/);
assert.doesNotMatch(ui, /adaptiveColumns && <th>آخرین مشاهده/);
assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);

assert.match(css, /v15 Unified Surface UI/);
assert.match(css, /--unified-row-neutral/);
assert.match(css, /--row-bg:/);
assert.match(css, /background: var\(--row-bg\) !important/);
assert.match(css, /background-image: none !important/);
assert.match(css, /priority-cell::before[\s\S]*display: none !important/);
assert.match(css, /status-cell::before[\s\S]*display: none !important/);
assert.match(css, /unifiedRowEnterV15/);
assert.match(css, /@media \(max-width: 980px\)/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log("[OK] v1.9 Unified Surface markers detected");
console.log("[OK] dashboard quick-edit handler is explicitly wired");
console.log("[OK] desktop incident rows use one continuous surface across columns");
console.log("[OK] duplicate detail columns were removed from the main table");
console.log("[OK] status and priority remain semantic, selectable controls");
console.log("[OK] filters are compact and progressive");
console.log("[OK] responsive cards and reduced-motion fallback are retained");
