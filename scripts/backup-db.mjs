import Database from "better-sqlite3";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve(process.env.DB_PATH || "./data/incident-hub.sqlite");
const backupDir = resolve(process.env.BACKUP_DIR || "./backups");
const configuredRetention = Number(process.env.BACKUP_RETENTION_COUNT ?? 14);
const retentionCount = Number.isFinite(configuredRetention)
  ? Math.min(365, Math.max(3, Math.trunc(configuredRetention)))
  : 14;

mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = resolve(backupDir, `incident-hub-${stamp}.sqlite`);
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
} finally {
  db.close();
}

const backups = readdirSync(backupDir)
  .filter((name) => /^incident-hub-.*\.sqlite$/i.test(name))
  .map((name) => ({ name, path: resolve(backupDir, name), modified: statSync(resolve(backupDir, name)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified);

for (const backup of backups.slice(retentionCount)) {
  unlinkSync(backup.path);
}

console.log(JSON.stringify({
  backup: destination,
  source,
  sizeBytes: statSync(destination).size,
  retained: Math.min(backups.length, retentionCount),
  retentionCount,
  backupDirectory: dirname(destination),
}, null, 2));
