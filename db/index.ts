import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type D1Result<T = unknown> = {
  results?: T[];
  success: boolean;
  meta?: Record<string, unknown>;
};

class LocalPreparedStatement {
  constructor(
    private readonly database: Database.Database,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new LocalPreparedStatement(this.database, this.sql, values);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const statement = this.database.prepare(this.sql);
    if (!statement.reader) {
      statement.run(...this.params);
      return null;
    }
    return (statement.get(...this.params) as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }> {
    const statement = this.database.prepare(this.sql);
    if (!statement.reader) {
      statement.run(...this.params);
      return { results: [], success: true };
    }
    return { results: statement.all(...this.params) as T[], success: true };
  }

  async run(): Promise<D1Result> {
    const statement = this.database.prepare(this.sql);
    if (statement.reader) {
      const results = statement.all(...this.params);
      return { results, success: true };
    }
    const info = statement.run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }

  executeForBatch(): D1Result {
    const statement = this.database.prepare(this.sql);
    if (statement.reader) {
      return { results: statement.all(...this.params), success: true };
    }
    const info = statement.run(...this.params);
    return {
      success: true,
      meta: {
        changes: info.changes,
        last_row_id: Number(info.lastInsertRowid),
      },
    };
  }
}

export class LocalD1Database {
  constructor(private readonly database: Database.Database) {}

  prepare(sql: string) {
    return new LocalPreparedStatement(this.database, sql);
  }

  async batch(statements: LocalPreparedStatement[]): Promise<D1Result[]> {
    return this.database.transaction(() => statements.map((statement) => statement.executeForBatch()))();
  }

  async backup(destination: string) {
    mkdirSync(dirname(destination), { recursive: true });
    return this.database.backup(destination);
  }

  close() {
    this.database.close();
  }
}

let singleton: LocalD1Database | null = null;

export function databasePath() {
  return resolve(process.env.DB_PATH || "./data/incident-hub.sqlite");
}

export function getRawDb(): LocalD1Database {
  if (singleton) return singleton;

  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  singleton = new LocalD1Database(sqlite);
  return singleton;
}
