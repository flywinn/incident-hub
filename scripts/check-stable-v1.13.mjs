import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] || ".");
const ui = readFileSync(resolve(root, "app/incident-hub.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
const layout = readFileSync(resolve(root, "app/layout.tsx"), "utf8");
const requiredScripts = [
  "scripts/Start-Stable-Production.ps1",
  "scripts/Install-Stable-Production.ps1",
  "scripts/Configure-Production-Auth.ps1",
  "scripts/Configure-Prtg-Telegram.ps1",
  "scripts/Stabilize-Dev-Prod-Git.ps1",
  "scripts/Validate-Stable-Production.ps1",
  "scripts/Backup-Stable-Production.ps1",
  "scripts/stable-backup-db.mjs",
];

const checks = [
  [ui.includes('theme: "dark"'), "default theme is dark"],
  [ui.includes('elk-app-preferences-v4'), "preference migration v4 is present"],
  [layout.includes('data-theme="dark"') && layout.includes('elk-app-preferences-v4'), "dark theme is applied before hydration"],
  [css.includes("v17 Stable Dark Release"), "stable dark CSS marker is present"],
  [css.includes("status-row-reopened") && css.includes("19%"), "reopened row has stronger dark tint"],
  [css.includes("status-row-closed") && css.includes("8%"), "closed row stays muted but distinguishable"],
  [requiredScripts.every((path) => existsSync(resolve(root, path))), "stable production scripts are present"],
];

let failed = false;
for (const [ok, label] of checks) {
  console.log(`${ok ? "[OK]" : "[FAIL]"} ${label}`);
  if (!ok) failed = true;
}
process.exitCode = failed ? 1 : 0;
