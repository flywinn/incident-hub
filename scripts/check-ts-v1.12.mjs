import { readFile } from "node:fs/promises";
import ts from "typescript";

const files = [
  ["app/incident-hub.tsx", ts.ScriptKind.TSX],
  ["app/api/bugs/[id]/emails/route.ts", ts.ScriptKind.TS],
  ["app/api/bugs/[id]/emails/eml/route.ts", ts.ScriptKind.TS],
  ["lib/email-intelligence.ts", ts.ScriptKind.TS],
];

let failed = false;
for (const [path, scriptKind] of files) {
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
