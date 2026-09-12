import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const layout = fs.readFileSync("app/layout.tsx", "utf8");
const css = fs.readFileSync("app/v115-reference.css", "utf8");

test("loads the didban-reference follow-up stylesheet after v115.css", () => {
  const base = layout.indexOf('import "./v115.css";');
  const reference = layout.indexOf('import "./v115-reference.css";');
  assert.ok(base >= 0, "v115.css import must remain present");
  assert.ok(reference > base, "reference stylesheet must load after v115.css");
});

test("keeps the redesign scoped to the follow-up workspace", () => {
  assert.match(css, /\.followup-page\s*\{/);
  assert.match(css, /max-width:\s*1360px/);
  assert.match(css, /--fu-surface:\s*#121826/);
  assert.match(css, /--fu-brand:\s*#f0a93b/);
});

test("removes the legacy green next-action panel in dark follow-up cards", () => {
  assert.match(css, /html\[data-theme="dark"\] \.followup-page \.followup-next-action/);
  assert.match(css, /background:\s*var\(--fu-surface\) !important/);
  assert.match(css, /border-right-width:\s*1px !important/);
});

test("includes reference-style stats, queue cards, actions and drawer", () => {
  for (const marker of [
    ".followup-summary-card::before",
    ".followup-summary-card::after",
    ".followup-workspace",
    ".followup-card-pro",
    ".followup-view-action",
    ".followup-detail-drawer",
  ]) {
    assert.ok(css.includes(marker), `missing visual marker: ${marker}`);
  }
});

test("preserves responsive and reduced-motion behavior", () => {
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
