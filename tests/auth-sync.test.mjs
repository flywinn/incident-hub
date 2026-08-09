import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

function createDatabase(path) {
  const database = new Database(path);
  database.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      username TEXT,
      role TEXT NOT NULL,
      team TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX users_username_unique_idx ON users(username COLLATE NOCASE)
      WHERE username IS NOT NULL AND username <> '';
    CREATE TABLE user_credentials (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE bugs (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER REFERENCES users(id),
      owner_name TEXT NOT NULL
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      before_value TEXT,
      after_value TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return database;
}

test("Dev authentication is mirrored without replacing Production incidents or user references", () => {
  const directory = mkdtempSync(join(tmpdir(), "incidenthub-auth-sync-"));
  const devPath = join(directory, "dev.sqlite");
  const productionPath = join(directory, "production.sqlite");
  const dev = createDatabase(devPath);
  const production = createDatabase(productionPath);
  try {
    dev.prepare("INSERT INTO users (id, full_name, email, username, role, team, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(1, "Dev Owner", "owner@example.test", "owner", "SUPER_ADMIN", "Ops", 1);
    dev.prepare("INSERT INTO users (id, full_name, email, username, role, team, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(2, "New Operator", "operator@example.test", "operator", "OPERATOR", "NOC", 1);
    dev.prepare("INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)").run(1, "scrypt-v1$owner$hash");
    dev.prepare("INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)").run(2, "scrypt-v1$operator$hash");

    production.prepare("INSERT INTO users (id, full_name, email, username, role, team, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(9, "Old Owner Name", "owner@example.test", "legacy-owner", "ADMIN", "Old", 1);
    production.prepare("INSERT INTO users (id, full_name, email, username, role, team, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(10, "Production History", "history@example.test", "history", "VIEWER", "Old", 1);
    production.prepare("INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)").run(9, "old-owner-hash");
    production.prepare("INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)").run(10, "old-history-hash");
    production.prepare("INSERT INTO bugs (id, owner_id, owner_name) VALUES (1, 10, 'Production History')").run();
  } finally {
    dev.close();
    production.close();
  }

  try {
    const script = fileURLToPath(new URL("../scripts/sync-dev-auth-to-production.mjs", import.meta.url));
    const output = execFileSync(process.execPath, [script], {
      env: { ...process.env, DEV_DB_PATH: devPath, PROD_DB_PATH: productionPath },
      encoding: "utf8",
    });
    const report = JSON.parse(output);
    assert.equal(report.status, "ok");
    assert.equal(report.updated, 1);
    assert.equal(report.inserted, 1);
    assert.equal(report.deactivated, 1);
    assert.doesNotMatch(output, /scrypt-v1/);

    const result = new Database(productionPath, { readonly: true });
    try {
      const owner = result.prepare("SELECT * FROM users WHERE lower(email) = 'owner@example.test'").get();
      assert.equal(owner.id, 9, "Production user id must be preserved for existing references");
      assert.equal(owner.full_name, "Dev Owner");
      assert.equal(owner.username, "owner");
      assert.equal(owner.role, "SUPER_ADMIN");
      assert.equal(result.prepare("SELECT password_hash FROM user_credentials WHERE user_id = 9").get().password_hash, "scrypt-v1$owner$hash");

      const operator = result.prepare("SELECT * FROM users WHERE lower(email) = 'operator@example.test'").get();
      assert.equal(operator.username, "operator");
      assert.equal(result.prepare("SELECT password_hash FROM user_credentials WHERE user_id = ?").get(operator.id).password_hash, "scrypt-v1$operator$hash");

      const history = result.prepare("SELECT * FROM users WHERE id = 10").get();
      assert.equal(history.is_active, 0);
      assert.equal(history.username, null);
      assert.equal(result.prepare("SELECT COUNT(*) AS count FROM user_credentials WHERE user_id = 10").get().count, 0);
      assert.deepEqual(result.prepare("SELECT owner_id, owner_name FROM bugs WHERE id = 1").get(), { owner_id: 10, owner_name: "Production History" });
      assert.equal(result.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'SUPER_ADMIN' AND is_active = 1").get().count, 1);
      assert.equal(result.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'SYNC_DEV_AUTH_TO_PRODUCTION'").get().count, 1);
    } finally {
      result.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("merge mode preserves Production-only logins while adopting the Dev Super Admin", () => {
  const directory = mkdtempSync(join(tmpdir(), "incidenthub-auth-merge-"));
  const devPath = join(directory, "dev.sqlite");
  const productionPath = join(directory, "production.sqlite");
  const dev = createDatabase(devPath);
  const production = createDatabase(productionPath);
  try {
    dev.prepare("INSERT INTO users (full_name, email, username, role, team, is_active) VALUES (?, ?, ?, ?, ?, ?)")
      .run("Dev Owner", "owner@example.test", "owner", "SUPER_ADMIN", "Ops", 1);
    dev.prepare("INSERT INTO user_credentials (user_id, password_hash) VALUES (1, ?)").run("scrypt-v1$owner$hash");

    production.prepare("INSERT INTO users (full_name, email, username, role, team, is_active) VALUES (?, ?, ?, ?, ?, ?)")
      .run("Production Admin", "prod@example.test", "prod-admin", "SUPER_ADMIN", "Prod", 1);
    production.prepare("INSERT INTO user_credentials (user_id, password_hash) VALUES (1, ?)").run("scrypt-v1$prod$hash");
  } finally {
    dev.close();
    production.close();
  }

  try {
    const script = fileURLToPath(new URL("../scripts/sync-dev-auth-to-production.mjs", import.meta.url));
    const output = execFileSync(process.execPath, [script], {
      env: {
        ...process.env,
        DEV_DB_PATH: devPath,
        PROD_DB_PATH: productionPath,
        AUTH_SYNC_MODE: "MERGE",
      },
      encoding: "utf8",
    });
    const report = JSON.parse(output);
    assert.equal(report.status, "ok");
    assert.equal(report.mode, "MERGE");
    assert.equal(report.inserted, 1);
    assert.equal(report.preserved, 1);
    assert.equal(report.deactivated, 0);
    assert.equal(report.superAdminsDemoted, 1);

    const result = new Database(productionPath, { readonly: true });
    try {
      const productionOnly = result.prepare("SELECT * FROM users WHERE email = 'prod@example.test'").get();
      assert.equal(productionOnly.is_active, 1);
      assert.equal(productionOnly.username, "prod-admin");
      assert.equal(productionOnly.role, "ADMIN");
      assert.equal(result.prepare("SELECT password_hash FROM user_credentials WHERE user_id = ?").get(productionOnly.id).password_hash, "scrypt-v1$prod$hash");
      assert.equal(result.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'SUPER_ADMIN' AND is_active = 1").get().count, 1);
      assert.equal(result.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'MERGE_DEV_AUTH_TO_PRODUCTION'").get().count, 1);
    } finally {
      result.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
