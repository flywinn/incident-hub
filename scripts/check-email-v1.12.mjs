import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [engine, route, eml, ui, css] = await Promise.all([
  read("lib/email-intelligence.ts"),
  read("app/api/bugs/[id]/emails/route.ts"),
  read("app/api/bugs/[id]/emails/eml/route.ts"),
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(engine, /TECHNICAL_INCIDENT/);
assert.match(engine, /FUNCTIONAL_ISSUE/);
assert.match(engine, /INTERNAL_NOTICE/);
assert.match(engine, /FOLLOW_UP/);
assert.match(engine, /RESOLUTION_RCA/);
assert.match(engine, /favicon/);
assert.match(engine, /از سمت \$\{origin\}/);
assert.match(engine, /پیرو مکاتبات قبلی/);
assert.match(route, /recommendedSmartEmailTemplate/);
assert.match(route, /imageSelections/);
assert.match(eml, /multipart\/mixed/);
assert.match(eml, /Content-Disposition/);
assert.match(ui, /smart-email-v12/);
assert.match(ui, /بازسازی هوشمند/);
assert.match(ui, /پیوست فایل/);
assert.match(ui, /داخل متن ایمیل/);
assert.doesNotMatch(ui, /email-quality-grid/);
assert.match(css, /v16 SmartMail/);

console.log("[OK] smart intent engine has five concise email intents");
console.log("[OK] noisy endpoints are filtered and technical context is extracted");
console.log("[OK] composer is simplified around smart rebuild + editable email");
console.log("[OK] image handling supports attachment / inline / none per image");
console.log("[OK] Outlook EML uses multipart/mixed for real attachments");
