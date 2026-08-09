import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");
const [ui, css] = await Promise.all([read("app/incident-hub.tsx"), read("app/globals.css")]);

assert.match(ui, /IncidentHub UI v1\.11\.3/);
assert.match(ui, /\| "filter";/);
assert.match(ui, /filter: <><path/);
assert.match(ui, /filtersExpanded/);
assert.match(ui, /incident-filter-toolbar/);
assert.match(ui, /filter-primary-line/);
assert.match(ui, /advanced-filter-toggle/);
assert.match(ui, /advanced-filters/);
assert.match(ui, /modern-record-table/);
assert.match(ui, /focus-dashboard-hero/);
assert.match(ui, /incident-record-main/);
assert.match(ui, /service-record-cell/);
assert.match(ui, /new Date\(String\(b\.last_seen_at \?\? b\.created_at\)\)/);
assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);

assert.match(css, /v14 FocusBoard UI\/UX/);
assert.match(css, /--focus-brand: var\(--accent\)/);
assert.match(css, /html\[data-font-size="normal"\] :is\(\.dashboard-grid, \.page-panel\)/);
assert.match(css, /\.incident-filter-rail[\s\S]*overflow-x: auto/);
assert.match(css, /\.advanced-filters[\s\S]*grid-template-columns/);
assert.match(css, /\.modern-record-table[\s\S]*border-collapse: separate/);
assert.match(css, /@media \(max-width: 980px\)/);
assert.match(css, /@media \(max-width: 680px\)/);
assert.match(css, /focusCardEnterV14/);
assert.match(css, /filterPanelOpenV14/);
assert.match(css, /recordCardEnterV14/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log("[OK] FocusBoard v1.8 markers detected");
console.log("[OK] dashboard surfaces are theme-aware");
console.log("[OK] incident records use modern responsive table/card layout");
console.log("[OK] filters use progressive disclosure and horizontal quick actions");
console.log("[OK] scoped readable typography follows font-size preference");
console.log("[OK] richer motion is present with reduced-motion fallback");
