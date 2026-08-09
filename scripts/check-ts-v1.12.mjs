import { readFile } from "node:fs/promises";
import ts from "typescript";

const files = [
  "app/incident-hub.tsx",
  "app/api/bugs/[id]/emails/route.ts",
  "app/api/bugs/[id]/emails/eml/route.ts",
  "lib/email-intelligence.ts",
];

let failed = false;
for (const path of files) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: path,
    reportDiagnostics: true,
    transformers: undefined,
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    failed = true;
    console.error(`[FAIL] TS syntax: ${path}`);
    for (const error of errors) console.error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  } else {
    console.log(`[OK] TS syntax: ${path}`);
  }
}
if (failed) process.exit(1);
