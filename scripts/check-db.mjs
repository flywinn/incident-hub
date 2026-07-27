import Database from "better-sqlite3";
import { resolve } from "node:path";

const source = resolve(process.env.DB_PATH || "./data/incident-hub.sqlite");
const db = new Database(source, { readonly: true, fileMustExist: true });
const integrity = db.pragma("integrity_check", { simple: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(JSON.stringify({ database: source, integrity, tables: tables.map((row) => row.name) }, null, 2));
db.close();
