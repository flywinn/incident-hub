import Database from "better-sqlite3";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve(process.env.DB_PATH || "");
const imagesSource = resolve(process.env.INCIDENT_IMAGES_DIR || "");
const backupDir = resolve(process.env.BACKUP_DIR || "D:/IncidentHub/Backups/Prod");
const configuredRetention = Number(process.env.BACKUP_RETENTION_COUNT ?? 14);
const retention = Number.isFinite(configuredRetention) ? Math.min(90, Math.max(3, Math.trunc(configuredRetention))) : 14;
if (!source || !existsSync(source)) throw new Error(`Database not found: ${source}`);
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dbTarget = resolve(backupDir, `incident-hub-${stamp}.sqlite`);
const db = new Database(source, { readonly: true, fileMustExist: true });
try { await db.backup(dbTarget); } finally { db.close(); }
let imagesTarget = null;
if (imagesSource && existsSync(imagesSource)) {
  imagesTarget = resolve(backupDir, `incident-images-${stamp}`);
  cpSync(imagesSource, imagesTarget, { recursive: true, force: false, errorOnExist: true });
}
for (const item of readdirSync(backupDir).filter((x) => /^incident-hub-.*\.sqlite$/i.test(x)).map((name) => ({ name, path: resolve(backupDir, name), mtime: statSync(resolve(backupDir, name)).mtimeMs })).sort((a,b) => b.mtime-a.mtime).slice(retention)) unlinkSync(item.path);
for (const item of readdirSync(backupDir).filter((x) => /^incident-images-/.test(x)).map((name) => ({ name, path: resolve(backupDir, name), stat: statSync(resolve(backupDir, name)) })).filter((x) => x.stat.isDirectory()).sort((a,b) => b.stat.mtimeMs-a.stat.mtimeMs).slice(retention)) rmSync(item.path, { recursive: true, force: true });
console.log(JSON.stringify({ databaseBackup: dbTarget, imagesBackup: imagesTarget, retention }, null, 2));
