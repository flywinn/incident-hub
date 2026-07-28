import { existsSync, readFileSync, statfsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

function log(level, event, details = {}) {
  console.error(JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    ...details,
  }));
}

const root = resolve(".");
const envPath = resolve(root, ".env.production");
if (!existsSync(envPath)) throw new Error(`Production environment file not found: ${envPath}`);
loadEnv(envPath);
process.env.NODE_ENV = "production";
process.env.HOSTNAME ??= "0.0.0.0";
process.env.PORT ??= "3000";

const dbPath = process.env.DB_PATH?.trim() ?? "";
if (!dbPath || !isAbsolute(dbPath)) {
  throw new Error("DB_PATH must be an absolute path in .env.production.");
}
if (/ElkIncidentHubDev/i.test(dbPath)) {
  throw new Error("Production cannot start with the development database path.");
}

const minimumMb = Math.max(256, Number(process.env.STARTUP_MIN_FREE_DISK_MB ?? 512));
const disk = statfsSync(dirname(dbPath));
const freeMb = Math.floor((Number(disk.bavail) * Number(disk.bsize)) / 1024 / 1024);
if (freeMb < minimumMb) {
  throw new Error(`Insufficient free disk space: ${freeMb} MB available; ${minimumMb} MB required.`);
}

const entry = resolve(root, ".next/standalone/server.js");
if (!existsSync(entry)) {
  throw new Error("Build output not found. Run npm run build first.");
}

process.on("uncaughtExceptionMonitor", (error, origin) => {
  log("fatal", "uncaught_exception", {
    origin,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});
process.on("warning", (warning) => {
  log("warn", "node_warning", { name: warning.name, message: warning.message, stack: warning.stack });
});
process.on("SIGTERM", () => log("info", "process_sigterm"));
process.on("SIGINT", () => log("info", "process_sigint"));

log("info", "server_starting", {
  hostname: process.env.HOSTNAME,
  port: process.env.PORT,
  database: dbPath,
  freeDiskMb: freeMb,
  node: process.version,
});

await import(pathToFileURL(entry).href);
log("info", "server_module_loaded", { port: process.env.PORT });
