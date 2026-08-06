import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const files = [
  "app/incident-hub.tsx",
  "app/login/page.tsx",
  "app/page.tsx",
  "app/api/auth/login/route.ts",
  "app/api/auth/logout/route.ts",
  "app/api/users/route.ts",
  "app/api/users/[id]/route.ts",
  "app/api/users/[id]/password/route.ts",
  "lib/auth.ts",
  "lib/local-auth.ts",
];
let failed = false;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    failed = true;
    console.error(`[FAIL] ${file}`);
    for (const error of errors) console.error(ts.flattenDiagnosticMessageText(error.messageText, "\n"));
  } else {
    console.log(`[OK] TS syntax: ${file}`);
  }
}
if (failed) process.exit(1);
