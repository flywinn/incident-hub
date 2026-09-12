import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const migrationRunner = resolve("scripts/migrate-db.mjs");

function runMigration(root, database) {
  return spawnSync(process.execPath, [migrationRunner], {
    cwd: root,
    env: { ...process.env, DB_PATH: database },
    encoding: "utf8",
  });
}

test("migration checksums accept LF/CRLF conversion but reject real edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "incidenthub-migration-"));
  const migrations = join(root, "db", "migrations");
  const database = join(root, "data", "test.sqlite");
  const migration = join(migrations, "001_baseline.sql");
  const lf = "-- baseline\nSELECT 1;\n";

  try {
    await mkdir(migrations, { recursive: true });
    await writeFile(migration, lf, "utf8");
    const first = runMigration(root, database);
    assert.equal(first.status, 0, first.stderr || first.stdout);

    await writeFile(migration, lf.replace(/\n/g, "\r\n"), "utf8");
    const lineEndingOnly = runMigration(root, database);
    assert.equal(lineEndingOnly.status, 0, lineEndingOnly.stderr || lineEndingOnly.stdout);
    assert.match(lineEndingOnly.stdout, /"skipped":\s*\[\s*"001_baseline\.sql"/);

    await writeFile(migration, "-- changed migration\nSELECT 2;\n", "utf8");
    const modified = runMigration(root, database);
    assert.notEqual(modified.status, 0);
    assert.match(modified.stderr, /Applied migration was modified: 001_baseline\.sql/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
