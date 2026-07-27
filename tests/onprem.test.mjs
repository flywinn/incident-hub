import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("uses local SQLite instead of Cloudflare D1", async () => {
  const db = await read("../db/index.ts");
  assert.match(db, /better-sqlite3/);
  assert.match(db, /journal_mode = WAL/);
  assert.match(db, /DB_PATH/);
  assert.doesNotMatch(db, /cloudflare:workers/);
});

test("supports temporary no-auth admin and keeps reverse-proxy auth available", async () => {
  const identity = await read("../lib/identity.ts");
  const auth = await read("../lib/auth.ts");
  assert.match(identity, /AUTH_PROXY_SECRET/);
  assert.match(identity, /x-authenticated-user/);
  assert.match(identity, /AUTH_EMAIL_DOMAIN/);
  assert.match(auth, /AUTH_DISABLED/);
  assert.match(auth, /getNoAuthAdmin/);
  assert.match(auth, /ADMIN.*OPERATOR.*VIEWER/);
  assert.doesNotMatch(auth, /troutlh38@outlook\.com/);
});

test("does not seed bundled operational data by default", async () => {
  const ensure = await read("../db/ensure.ts");
  assert.match(ensure, /SEED_DEMO_DATA === "true"/);
  assert.match(ensure, /IMPORT_BUNDLED_REPORT === "true"/);
});

test("provides health, backup and Windows deployment helpers", async () => {
  const [health, backup, task, iis, start] = await Promise.all([
    read("../app/api/health/route.ts"),
    read("../scripts/backup-db.mjs"),
    read("../scripts/install-windows-task.ps1"),
    read("../deploy/iis/web.config.template"),
    read("../scripts/start-server.mjs"),
  ]);
  assert.match(health, /SELECT 1 AS ok/);
  assert.match(backup, /\.backup\(/);
  assert.match(task, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(iis, /HTTP_X_AUTHENTICATED_USER/);
  assert.match(iis, /127\.0\.0\.1:3000/);
  assert.match(start, /\.env\.production/);
  assert.match(start, /HOSTNAME/);
  assert.match(start, /0\.0\.0\.0/);
});
