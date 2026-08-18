import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("follow-up workspace exposes queue scopes, critical state, and detail drawer", async () => {
  const source = await read("app/incident-hub.tsx");
  assert.match(source, /queueScope/);
  assert.match(source, /followup-segment/);
  assert.match(source, /مورد در این نما/);
  assert.match(source, /overdueHours/);
  assert.match(source, /عقب‌افتاده بحرانی/);
  assert.match(source, /followup-detail-drawer/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /مشاهده جزئیات/);
});

test("follow-up UI keeps existing write actions instead of replacing workflow behavior", async () => {
  const source = await read("app/incident-hub.tsx");
  assert.match(source, /action: "COMPLETE"/);
  assert.match(source, /action: "RESCHEDULE"/);
  assert.match(source, /action: "CANCEL"/);
  assert.match(source, /setAction\(\{ mode: "COMPLETE", item/);
  assert.match(source, /setAction\(\{ mode: "RESCHEDULE", item/);
});

test("follow-up v1.15 styles are responsive and respect reduced motion", async () => {
  const css = await read("app/v115.css");
  assert.match(css, /v1\.15 follow-up workspace — didban reference/);
  assert.match(css, /\.followup-segment/);
  assert.match(css, /\.followup-card-pro\.critical/);
  assert.match(css, /\.followup-detail-drawer/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
