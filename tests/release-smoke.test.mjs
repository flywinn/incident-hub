import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("release keeps Local Auth and the hardened Windows deployment path", async () => {
  const [auth, env, packageJson, installer, migrationPreflight, prtgConfiguration, gitStabilizer] = await Promise.all([
    read("lib/auth.ts"),
    read(".env.example"),
    read("package.json"),
    read("scripts/Install-Stable-Production.ps1"),
    read("scripts/preflight-production-migrations.mjs"),
    read("scripts/Configure-Prtg-Telegram.ps1"),
    read("scripts/Stabilize-Dev-Prod-Git.ps1"),
  ]);

  assert.match(auth, /return process\.env\.AUTH_MODE.*=== "PROXY" \? "PROXY" : "LOCAL"/);
  assert.match(env, /AUTH_MODE=LOCAL/);
  assert.match(env, /AUTH_DISABLED=false/);
  assert.match(packageJson, /next build --webpack/);
  assert.match(installer, /\[string\[\]\]\$Arguments/);
  assert.match(installer, /copyNodeModules/);
  assert.doesNotMatch(installer, /mklink \/J.*nodeModulesLink/);
  assert.match(installer, /preflight-production-migrations\.mjs/);
  assert.match(migrationPreflight, /source\.backup\(preflightPath\)/);
  assert.match(migrationPreflight, /quick_check/);
  assert.match(prtgConfiguration, /PRTG_WEBHOOK_SECRET/);
  assert.match(prtgConfiguration, /TELEGRAM_BOT_TOKEN/);
  assert.match(gitStabilizer, /git\.exe/);
  assert.match(gitStabilizer, /push", "--atomic"/);
  assert.match(gitStabilizer, /npmExe @\("run", "lint"\)/);
  assert.match(gitStabilizer, /--noEmit/);
  assert.match(gitStabilizer, /databaseSynchronization = "NOT_PERFORMED"/);
});
