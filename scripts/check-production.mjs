import Database from "better-sqlite3";
import { existsSync, readFileSync, statfsSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

function loadEnv(path) {
  if (!existsSync(path)) return false;
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
    process.env[key] = value;
  }
  return true;
}

const root = resolve(".");
const errors = [];
const warnings = [];
const checks = {};
const envPath = resolve(root, ".env.production");
checks.environmentFile = loadEnv(envPath);
if (!checks.environmentFile) errors.push(`Missing ${envPath}`);

const nodeParts = process.versions.node.split(".").map(Number);
checks.node = process.version;
if (nodeParts[0] < 22 || (nodeParts[0] === 22 && nodeParts[1] < 13)) {
  errors.push("Node.js 22.13 or newer is required.");
}

const buildEntry = resolve(root, ".next/standalone/server.js");
checks.buildEntry = existsSync(buildEntry);
if (!checks.buildEntry) errors.push("Standalone build output is missing.");

const dbPath = process.env.DB_PATH?.trim() || "";
checks.databasePath = dbPath;
if (!dbPath || !isAbsolute(dbPath)) errors.push("DB_PATH must be an absolute path.");
if (/ElkIncidentHubDev/i.test(dbPath)) errors.push("DB_PATH points to the development database.");
if (dbPath && !existsSync(dbPath)) errors.push(`Production database does not exist: ${dbPath}`);

if (process.env.SEED_DEMO_DATA === "true") errors.push("SEED_DEMO_DATA must be false in production.");
if (process.env.IMPORT_BUNDLED_REPORT === "true") errors.push("IMPORT_BUNDLED_REPORT must be false after the import is complete.");
if (process.env.AUTH_DISABLED === "true") warnings.push("Authentication is disabled; every reachable user has administrative access.");
if ((process.env.ELK_WEBHOOK_SECRET?.trim().length ?? 0) < 24) errors.push("ELK_WEBHOOK_SECRET must contain at least 24 characters.");

if (dbPath && isAbsolute(dbPath)) {
  const disk = statfsSync(dirname(dbPath));
  const freeMb = Math.floor((Number(disk.bavail) * Number(disk.bsize)) / 1024 / 1024);
  const configuredMinimum = Number(process.env.PRODUCTION_MIN_FREE_DISK_MB ?? 4096);
  const minimumMb = Number.isFinite(configuredMinimum) ? Math.max(1024, Math.trunc(configuredMinimum)) : 4096;
  checks.disk = { freeMb, minimumMb };
  if (freeMb < minimumMb) errors.push(`Free disk space is ${freeMb} MB; at least ${minimumMb} MB is required for launch and rollback.`);
}

if (dbPath && existsSync(dbPath)) {
  let database;
  try {
    database = new Database(dbPath, { readonly: true, fileMustExist: true });
    const integrity = database.pragma("quick_check", { simple: true });
    const tableCount = database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count;
    const bugCount = database.prepare("SELECT COUNT(*) AS count FROM bugs").get().count;
    checks.database = {
      integrity,
      tableCount,
      bugCount,
      sizeBytes: statSync(dbPath).size,
    };
    if (integrity !== "ok") errors.push(`Database quick_check returned: ${integrity}`);
    if (tableCount < 8) errors.push("Database schema is incomplete.");
  } catch (error) {
    errors.push(`Database check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    database?.close();
  }
}

const report = {
  status: errors.length ? "failed" : "ready",
  timestamp: new Date().toISOString(),
  checks,
  warnings,
  errors,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = errors.length ? 1 : 0;
