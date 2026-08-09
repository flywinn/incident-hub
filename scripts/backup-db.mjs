import Database from "better-sqlite3";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

const source = resolve(process.env.DB_PATH || "./data/incident-hub.sqlite");
const imagesSource = resolve(process.env.INCIDENT_IMAGES_DIR || "./data/incident-images");
const backupDir = resolve(process.env.BACKUP_DIR || "./backups");
const configuredRetention = Number(process.env.BACKUP_RETENTION_COUNT ?? 14);
const retentionCount = Number.isFinite(configuredRetention)
  ? Math.min(365, Math.max(3, Math.trunc(configuredRetention)))
  : 14;

mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = resolve(backupDir, `incident-hub-${stamp}.sqlite`);
const imagesDestination = resolve(backupDir, `incident-images-${stamp}`);
const db = new Database(source, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
} finally {
  db.close();
}

let imagesBackedUp = false;
if (existsSync(imagesSource)) {
  cpSync(imagesSource, imagesDestination, { recursive: true, errorOnExist: true, force: false });
  imagesBackedUp = true;
}

const dbBackups = readdirSync(backupDir)
  .filter((name) => /^incident-hub-.*\.sqlite$/i.test(name))
  .map((name) => ({ name, path: resolve(backupDir, name), modified: statSync(resolve(backupDir, name)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified);

for (const backup of dbBackups.slice(retentionCount)) {
  unlinkSync(backup.path);
}

const imageBackups = readdirSync(backupDir)
  .filter((name) => /^incident-images-/.test(name))
  .map((name) => ({ name, path: resolve(backupDir, name), modified: statSync(resolve(backupDir, name)).mtimeMs }))
  .filter((item) => statSync(item.path).isDirectory())
  .sort((a, b) => b.modified - a.modified);

for (const backup of imageBackups.slice(retentionCount)) {
  rmSync(backup.path, { recursive: true, force: true });
}

console.log(JSON.stringify({
  backup: destination,
  source,
  sizeBytes: statSync(destination).size,
  imagesSource,
  imagesBackup: imagesBackedUp ? imagesDestination : null,
  imagesBackedUp,
  retainedDatabaseBackups: Math.min(dbBackups.length, retentionCount),
  retainedImageBackups: Math.min(imageBackups.length, retentionCount),
  retentionCount,
  backupDirectory: dirname(destination),
}, null, 2));
