import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

const root = resolve(".");
loadEnv(resolve(root, ".env.production"));
loadEnv(resolve(root, ".env.local"));

const dbPath = process.env.DB_PATH?.trim() ?? "";
if (!dbPath || !isAbsolute(dbPath)) {
  throw new Error("DB_PATH must be an absolute path before running migrations.");
}

const migrationsDir = resolve(root, "db/migrations");
if (!existsSync(migrationsDir)) {
  console.log(JSON.stringify({ status: "no-migrations-directory", database: dbPath }, null, 2));
  process.exit(0);
}

mkdirSync(dirname(dbPath), { recursive: true });
const database = new Database(dbPath);

function checksum(value) {
  return createHash("sha256").update(value).digest("hex");
}

function migrationChecksums(sql) {
  // Git/ZIP/PowerShell can convert LF migrations to CRLF on Windows. Treat only
  // BOM and line-ending differences as equivalent while still rejecting any
  // real modification to an already-applied migration.
  const canonicalSql = sql.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const accepted = new Set([
    checksum(sql),
    checksum(canonicalSql),
    checksum(canonicalSql.replace(/\n/g, "\r\n")),
  ]);
  return { accepted, canonical: checksum(canonicalSql) };
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid migration identifier: ${value}`);
  }
  return `"${value}"`;
}

function ensureDeclaredColumns(sql) {
  const declaration = /^\s*--\s*@ensure-column\s+([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/gmi;
  for (const match of sql.matchAll(declaration)) {
    const [, tableName, columnName, definition] = match;
    const table = quoteIdentifier(tableName);
    const column = quoteIdentifier(columnName);
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((item) => String(item.name) === columnName)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition.trim()}`);
    }
  }
}

try {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 30000");

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name TEXT PRIMARY KEY,
      checksum_sha256 TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));

  const applied = [];
  const skipped = [];
  for (const name of files) {
    const fullPath = resolve(migrationsDir, name);
    const sql = readFileSync(fullPath, "utf8");
    const checksums = migrationChecksums(sql);
    const existing = database.prepare(
      "SELECT migration_name, checksum_sha256 FROM schema_migrations WHERE migration_name = ?",
    ).get(name);

    if (existing) {
      if (!checksums.accepted.has(existing.checksum_sha256)) {
        throw new Error(`Applied migration was modified: ${name}`);
      }
      skipped.push(name);
      continue;
    }

    const applyMigration = database.transaction(() => {
      ensureDeclaredColumns(sql);
      database.exec(sql);
      database.prepare(
        "INSERT INTO schema_migrations (migration_name, checksum_sha256) VALUES (?, ?)",
      ).run(name, checksums.canonical);
    });
    applyMigration();
    applied.push(name);
  }

  const integrity = database.pragma("quick_check", { simple: true });
  if (integrity !== "ok") {
    throw new Error(`Database quick_check failed after migrations: ${integrity}`);
  }

  console.log(JSON.stringify({
    status: "ok",
    database: dbPath,
    applied,
    skipped,
    migrationCount: files.length,
    integrity,
  }, null, 2));
} finally {
  database.close();
}
