import Database from "better-sqlite3";
import { existsSync, rmSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sourcePath = process.env.DB_PATH?.trim() ?? "";
const preflightPath = process.env.PREFLIGHT_DB_PATH?.trim() ?? "";

if (!sourcePath || !isAbsolute(sourcePath) || !existsSync(sourcePath)) {
  throw new Error(`Production database is unavailable for migration preflight: ${sourcePath}`);
}
if (!preflightPath || !isAbsolute(preflightPath) || resolve(preflightPath) === resolve(sourcePath)) {
  throw new Error("PREFLIGHT_DB_PATH must be an absolute path different from DB_PATH.");
}

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${preflightPath}${suffix}`, { force: true });
}

const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
try {
  await source.backup(preflightPath);
} finally {
  source.close();
}

const migrationRunner = resolve("scripts/migrate-db.mjs");
const migration = spawnSync(process.execPath, [migrationRunner], {
  cwd: resolve("."),
  env: { ...process.env, DB_PATH: preflightPath },
  encoding: "utf8",
});
if (migration.stdout) process.stdout.write(migration.stdout);
if (migration.stderr) process.stderr.write(migration.stderr);
if (migration.status !== 0) {
  throw new Error(`Migration preflight failed with exit code ${migration.status ?? "unknown"}.`);
}

const candidate = new Database(preflightPath, { readonly: true, fileMustExist: true });
try {
  const integrity = candidate.pragma("quick_check", { simple: true });
  if (integrity !== "ok") throw new Error(`Migration preflight integrity check failed: ${integrity}`);
  console.log(JSON.stringify({ status: "ok", source: sourcePath, candidate: preflightPath, integrity }, null, 2));
} finally {
  candidate.close();
}
