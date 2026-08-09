import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import test from "node:test";

test("numbered migrations upgrade an existing pre-auth database idempotently", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const temporary = mkdtempSync(join(tmpdir(), "incidenthub-migration-"));
  const dbPath = join(temporary, "incident-hub.sqlite");
  const initial = new Database(dbPath);
  initial.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'OPERATOR',
    team TEXT NOT NULL DEFAULT 'عملیات',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  initial.close();

  try {
    const run = () => spawnSync(process.execPath, ["scripts/migrate-db.mjs"], {
      cwd: root,
      env: { ...process.env, DB_PATH: dbPath },
      encoding: "utf8",
    });

    const first = run();
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const firstResult = JSON.parse(first.stdout);
    assert.deepEqual(firstResult.applied, ["001_baseline.sql", "002_bug_attachments.sql", "003_local_auth.sql"]);

    const migrated = new Database(dbPath, { readonly: true });
    const columns = migrated.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
    const credentials = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_credentials'").get();
    const migrationCount = migrated.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get().count;
    migrated.close();
    assert.ok(columns.includes("username"));
    assert.equal(credentials.name, "user_credentials");
    assert.equal(migrationCount, 3);

    const second = run();
    assert.equal(second.status, 0, second.stderr || second.stdout);
    const secondResult = JSON.parse(second.stdout);
    assert.equal(secondResult.applied.length, 0);
    assert.equal(secondResult.skipped.length, 3);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("runtime schema and the local-auth migration stay aligned", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const runtimeSchema = readFileSync(join(root, "db/ensure.ts"), "utf8");
  const migration = readFileSync(join(root, "db/migrations/003_local_auth.sql"), "utf8");
  for (const marker of ["username TEXT", "user_credentials", "users_username_unique_idx"]) {
    assert.match(runtimeSchema, new RegExp(marker));
    assert.match(migration, new RegExp(marker));
  }
});
