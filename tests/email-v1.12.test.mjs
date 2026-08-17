import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function loadEngine() {
  const source = await read("lib/email-intelligence.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
  const commonJsModule = { exports: {} };
  const context = vm.createContext({ module: commonJsModule, exports: commonJsModule.exports, Intl, Date, console });
  new vm.Script(output.outputText).runInContext(context);
  return commonJsModule.exports;
}

test("technical incidents are informational and preserve useful NOC context", async () => {
  const engine = await loadEngine();
  const bug = {
    bug_code: "FLT-260804-01",
    title: "AllPassengerETicket خطای 503",
    description: "در سرویس AllPassengerETicket از سمت چری خطای 503 مشاهده شده است.\n/api/V1/Flight/AllPassengerETicket\nLB-FL-C1\nbk_TravelIranianApi\nAPI1AF",
    technicalContext: {
      errorCount: 174,
      errorRate: 0.53,
      requestCount: 11119,
    },
    service_label: "ELK > AllPassengerETicket",
    status: "NEW",
    priority: "P2",
    occurrence_count: 1,
    first_seen_at: "2026-08-04T09:40:00.000Z",
    last_seen_at: "2026-08-04T09:40:00.000Z",
  };
  const recommended = engine.recommendedSmartEmailTemplate(bug, { historyCount: 0 });
  assert.equal(recommended, "TECHNICAL_INCIDENT");
  const draft = engine.buildSmartEmailDraft(bug, ["owner@flytoday.ir"], recommended, [], null, {
    historyCount: 0,
    defaultCc: "noc@flytoday.ir",
  });
  assert.match(draft.subject, /FLT-260804-01/);
  assert.match(draft.subject, /503/);
  assert.match(draft.body, /جهت اطلاع/);
  assert.match(draft.body, /از سمت چری/);
  assert.match(draft.body, /\/api\/V1\/Flight\/AllPassengerETicket/);
  assert.match(draft.body, /LB: LB-FL-C1/);
  assert.match(draft.body, /Backend: bk_TravelIranianApi/);
  assert.match(draft.body, /Server: API1AF/);
  assert.match(draft.body, /تعداد خطا: 174/);
  assert.match(draft.body, /نرخ خطا: 0.53%/);
  assert.match(draft.body, /تعداد درخواست: 11,119/);
  assert.equal(draft.to, "owner@flytoday.ir");
  assert.equal(draft.cc, "noc@flytoday.ir");
  assert.doesNotMatch(draft.body, /خواهشمند است/);
  assert.doesNotMatch(draft.body, /علت فنی/);
  assert.doesNotMatch(draft.body, /RCA/i);
});

test("noise endpoints such as favicon and pwa manifest are excluded", async () => {
  const engine = await loadEngine();
  const bug = {
    bug_code: "IMG-260805-01",
    title: "سرویس image خطای 500",
    description: "خطای 500 مشاهده شده است\n/favicon.ico\n/pwa-manifest.webmanifest",
    service_label: "image",
    status: "NEW",
  };
  assert.deepEqual([...engine.extractUsefulEndpoints(bug)], []);
  const draft = engine.buildSmartEmailDraft(bug, [], "TECHNICAL_INCIDENT", [], null, { historyCount: 0 });
  assert.doesNotMatch(draft.body, /favicon\.ico/);
  assert.doesNotMatch(draft.body, /pwa-manifest/);
});

test("functional password-change issue uses concise informational style", async () => {
  const engine = await loadEngine();
  const bug = {
    bug_code: "USERM-260803-01",
    title: "مشکل تغییر رمز عبور",
    description: "در فرآیند تغییر رمز عبور حساب کاربری، پس از ثبت رمز جدید و تأیید آن، سامانه پیام «متأسفانه خطایی رخ داد» را نمایش داده و عملیات تغییر رمز تکمیل نمی‌شود.",
    service_label: "User_main",
    status: "NEW",
  };
  const recommended = engine.recommendedSmartEmailTemplate(bug, { historyCount: 0 });
  assert.equal(recommended, "FUNCTIONAL_ISSUE");
  const draft = engine.buildSmartEmailDraft(bug, [], recommended, [], null, { historyCount: 0, defaultCc: "noc@flytoday.ir" });
  assert.match(draft.body, /^با سلام،/);
  assert.match(draft.body, /جهت اطلاع/);
  assert.match(draft.body, /فرآیند تغییر رمز عبور/);
  assert.match(draft.body, /USERM-260803-01/);
  assert.equal(draft.cc, "noc@flytoday.ir");
  assert.doesNotMatch(draft.body, /علت فنی|خواهشمند است/);
});

test("internal service-stability notice remains concise", async () => {
  const engine = await loadEngine();
  const bug = {
    bug_code: "PAY-260805-01",
    title: "ناپایداری سرویس خرید رفاهی بانک ملت",
    description: "سرویس از پایداری لازم برخوردار نیست و ممکن است مشتریان با اختلال مواجه شوند. در صورت تماس مشتریان اطلاع‌رسانی شود. تیم در حال پیگیری موضوع است.",
    service_label: "خرید رفاهی بانک ملت",
    status: "IN_PROGRESS",
  };
  const recommended = engine.recommendedSmartEmailTemplate(bug, { historyCount: 0 });
  assert.equal(recommended, "INTERNAL_NOTICE");
  const draft = engine.buildSmartEmailDraft(bug, [], recommended, [], null, { historyCount: 0 });
  assert.match(draft.body, /در صورت تماس مشتریان/);
  assert.match(draft.body, /تیم مربوطه در حال پیگیری موضوع است/);
  assert.doesNotMatch(draft.body, /دستور فرمایید|علت فنی/);
});

test("follow-up reports current state without asking why it is unresolved", async () => {
  const engine = await loadEngine();
  const bug = {
    bug_code: "HTL-260805-01",
    title: "خطای 503 هتل",
    description: "/v1/Hotel/Recommendation/Prices\nLB-FL-C1",
    service_label: "Hotel",
    status: "IN_PROGRESS",
    occurrence_count: 3,
    first_seen_at: "2026-08-05T08:00:00.000Z",
    last_seen_at: "2026-08-05T10:00:00.000Z",
  };
  const recommended = engine.recommendedSmartEmailTemplate(bug, { historyCount: 1 });
  assert.equal(recommended, "FOLLOW_UP");
  const draft = engine.buildSmartEmailDraft(bug, [], recommended, [], null, {
    historyCount: 1,
    lastEmailAt: "2026-08-05T09:00:00.000Z",
  });
  assert.match(draft.body, /پیرو اطلاع‌رسانی قبلی/);
  assert.match(draft.body, /در آخرین بررسی نیز مشاهده شده/);
  assert.match(draft.body, /Recommendation\/Prices/);
  assert.match(draft.body, /LB: LB-FL-C1/);
  assert.doesNotMatch(draft.body, /چرا|علت عدم رفع|دستور فرمایید|پیگیری‌های لازم/);
});

test("resolution email announces recovery without default RCA request", async () => {
  const engine = await loadEngine();
  const bug = {
    bug_code: "FLT-260805-03",
    title: "خطای 502 Flight",
    description: "/api/V1/Flight/Search",
    service_label: "Flight",
    status: "RESOLVED",
  };
  const recommended = engine.recommendedSmartEmailTemplate(bug, { historyCount: 2 });
  assert.equal(recommended, "RESOLUTION_RCA");
  const draft = engine.buildSmartEmailDraft(bug, [], recommended, [], null, { historyCount: 2 });
  assert.match(draft.body, /رفع شده است/);
  assert.doesNotMatch(draft.body, /RCA|علت ریشه‌ای|خواهشمند است/);
});

test("EML generator supports real attachments plus optional inline images", async () => {
  const eml = await read("app/api/bugs/[id]/emails/eml/route.ts");
  assert.match(eml, /multipart\/mixed/);
  assert.match(eml, /multipart\/related/);
  assert.match(eml, /Content-Disposition: \$\{disposition === "INLINE" \? "inline" : "attachment"\}/);
  assert.match(eml, /imageSelections/);
  assert.match(eml, /mode: "ATTACH" as const/);
});
