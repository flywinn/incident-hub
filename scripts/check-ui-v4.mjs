import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const sourceFiles = [
  "app/incident-hub.tsx",
  "app/api/bootstrap/route.ts",
  "app/api/settings/route.ts",
  "app/api/followups/[id]/route.ts",
  "db/ensure.ts",
  "db/schema.ts",
  "lib/settings.ts",
  "app/not-found.tsx",
];

let failed = false;
for (const file of sourceFiles) {
  const path = resolve(root, file);
  const source = readFileSync(path, "utf8");
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const diagnostics = result.diagnostics ?? [];
  if (diagnostics.length) {
    failed = true;
    console.error(`\n${file}`);
    for (const diagnostic of diagnostics) {
      console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    }
  } else {
    console.log(`OK  ${file}`);
  }
}

const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
if ((css.match(/{/g) ?? []).length !== (css.match(/}/g) ?? []).length) {
  failed = true;
  console.error("CSS braces are not balanced.");
} else {
  console.log("OK  app/globals.css");
}

const requiredMarkers = [
  ["app/incident-hub.tsx", "function HelpPage"],
  ["app/incident-hub.tsx", "followup-summary-grid"],
  ["app/incident-hub.tsx", "onSaveAppSettings"],
  ["app/api/settings/route.ts", "export async function PATCH"],
  ["db/ensure.ts", "CREATE TABLE IF NOT EXISTS app_settings"],
];
for (const [file, marker] of requiredMarkers) {
  if (!readFileSync(resolve(root, file), "utf8").includes(marker)) {
    failed = true;
    console.error(`Missing marker in ${file}: ${marker}`);
  }
}

if (failed) process.exit(1);
console.log("\nUI/configuration v4 static checks passed.");
