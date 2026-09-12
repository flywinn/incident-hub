import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function loadSettings() {
  const source = await read("lib/settings.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  const commonJsModule = { exports: {} };
  const context = vm.createContext({ module: commonJsModule, exports: commonJsModule.exports, Intl, console });
  new vm.Script(output.outputText).runInContext(context);
  return commonJsModule.exports;
}

test("default follow-up is same-day and default CC is NOC", async () => {
  const settings = await loadSettings();
  assert.equal(settings.DEFAULT_APP_SETTINGS.followups.defaultDelayHours, 0);
  assert.equal(settings.DEFAULT_APP_SETTINGS.followups.defaultType, "پیگیری امروز");
  assert.equal(settings.DEFAULT_APP_SETTINGS.email.defaultCc, "noc@flytoday.ir");
});

test("legacy 24-hour follow-up defaults migrate to same-day workflow without touching custom settings", async () => {
  const settings = await loadSettings();
  const legacy = settings.normalizeAppSettings({
    followups: {
      types: ["بررسی فنی", "پیگیری با تیم سرویس", "درخواست نتیجه", "درخواست RCA", "تأیید رفع", "پیگیری مجدد"],
      defaultType: "بررسی فنی",
      defaultDelayHours: 24,
      nextDelayHours: 24,
      staleAfterHours: 48,
      requireResult: true,
    },
  });
  assert.equal(legacy.followups.defaultDelayHours, 0);
  assert.equal(legacy.followups.defaultType, "پیگیری امروز");
  assert.ok(legacy.followups.types.includes("پیگیری امروز"));
  assert.ok(!legacy.followups.types.includes("درخواست RCA"));

  const custom = settings.normalizeAppSettings({
    followups: {
      types: ["پیگیری اختصاصی"],
      defaultType: "پیگیری اختصاصی",
      defaultDelayHours: 6,
      nextDelayHours: 12,
      staleAfterHours: 36,
      requireResult: false,
    },
  });
  assert.equal(custom.followups.defaultDelayHours, 6);
  assert.equal(custom.followups.defaultType, "پیگیری اختصاصی");
});

test("email route builds defaults from assignees and removes To/CC duplicates", async () => {
  const route = await read("app/api/bugs/[id]/emails/route.ts");
  assert.match(route, /assigneeEmails/);
  assert.match(route, /settings\.email\.defaultCc/);
  assert.match(route, /filter\(\(email\) => !toSet\.has\(email\)\)/);
  assert.match(route, /lastEmailAt: history\[0\]\?\.created_at/);
});

test("compact assignee picker stays inside the drawer and uses compact rows", async () => {
  const css = await read("app/v115.css");
  const layout = await read("app/layout.tsx");
  assert.match(css, /\.assignee-options > button/);
  assert.match(css, /height: 38px/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /overflow-x: hidden/);
  assert.match(css, /text-overflow: ellipsis/);
  assert.match(css, /\.selected-assignees > button/);
  assert.match(layout, /import "\.\/v115\.css"/);
});
