import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SAMPLE_PRTG_INPUT,
  formatTelegramReport,
  groupAndSortAlarms,
  parsePrtgRawOutput,
} from "../lib/prtgParser.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("PRTG sample is parsed, grouped and formatted", () => {
  const alarms = parsePrtgRawOutput(SAMPLE_PRTG_INPUT);
  assert.equal(alarms.length, 16);
  assert.equal(alarms[0].ip, "172.21.3.143");
  assert.equal(alarms[0].device, "FL-API-1");
  const report = formatTelegramReport(groupAndSortAlarms(alarms), { template: "grouped-standard" });
  assert.match(report, /Down Memory/);
  assert.match(report, /172\.21\.3\.143 - FL-API-1 - Memory/);
});

test("PRTG is connected to navigation, Local Auth and server-side Telegram delivery", async () => {
  const [ui, tool, route, settings] = await Promise.all([
    read("app/incident-hub.tsx"),
    read("app/prtg-tool.tsx"),
    read("app/api/integrations/prtg/route.ts"),
    read("lib/settings.ts"),
  ]);
  assert.match(ui, /key: "prtg", label: "ابزار PRTG"/);
  assert.match(ui, /page === "prtg"/);
  assert.match(tool, /fetch\('\/api\/integrations\/prtg'/);
  assert.doesNotMatch(tool, /fetch\(`https:\/\/api\.telegram\.org/);
  assert.match(route, /authorizeRequest/);
  assert.match(route, /PRTG_WEBHOOK_SECRET/);
  assert.match(route, /api\.telegram\.org/);
  assert.match(settings, /\| "prtg"/);
});
