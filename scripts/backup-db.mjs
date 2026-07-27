import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve(process.env.DB_PATH || "./data/incident-hub.sqlite");
const backupDir = resolve(process.env.BACKUP_DIR || "./backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = resolve(backupDir, `incident-hub-${stamp}.sqlite`);
const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(destination);
db.close();
console.log(destination);

