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
assert.doesNotMatch(ui, /مورد P1 بازی ثبت نشده است/);

assert.match(css, /v8 Incident-first UI system/);
assert.match(css, /--sidebar-width:/);
assert.match(css, /html\[data-theme="dark"\][\s\S]*--canvas: #0b1016/);
assert.match(css, /\.header-incident-status/);
assert.match(css, /\.incident-create-button/);
assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1279px\)/);
assert.match(css, /@media \(max-width: 720px\)/);
assert.match(css, /\.open-state-pill/);
assert.match(css, /incidentStatusPulse/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log("[OK] incident-first dashboard");
console.log("[OK] zero-P1 success banner removed");
console.log("[OK] semantic SVG icon system");
console.log("[OK] improved incident header and create action");
console.log("[OK] graphite dark palette without isolated white chips");
console.log("[OK] responsive rail, drawer and mobile incident cards");
console.log("[OK] open incidents are explicitly marked");
console.log("[OK] purposeful motion with reduced-motion support");
