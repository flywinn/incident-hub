import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;
const PASSWORD_PREFIX = "scrypt-v1";

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase().replace(/^@+/, "");
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    fail(`Username must be ${MIN_USERNAME_LENGTH}-${MAX_USERNAME_LENGTH} characters.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    fail("Username may contain only English letters, numbers, dot, dash and underscore.");
  }
  return username;
}

function passwordHash(password) {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) {
    fail(`Password must be ${MIN_PASSWORD_LENGTH}-200 characters.`);
  }
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

const dbPath = resolve(process.env.DB_PATH || "./data/incident-hub.sqlite");
if (!isAbsolute(dbPath) || !existsSync(dbPath)) fail(`Database not found: ${dbPath}`);

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
try {
  const columns = db.prepare("PRAGMA table_info(users)").all();
  if (!columns.some((column) => String(column.name) === "username")) {
    db.prepare("ALTER TABLE users ADD COLUMN username TEXT").run();
  }
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
    ON users(username COLLATE NOCASE)
    WHERE username IS NOT NULL AND username <> ''`).run();
  db.prepare(`CREATE TABLE IF NOT EXISTS user_credentials (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  if (process.argv.includes("--list")) {
    const rows = db.prepare(`SELECT id, full_name, username, email, role, is_active
      FROM users ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, id`).all();
    console.table(rows);
    process.exit(0);
  }

  const targetId = Number(process.env.SUPER_ADMIN_TARGET_ID);
  const fullName = String(process.env.SUPER_ADMIN_FULL_NAME ?? "").trim();
  const email = String(process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const username = validateUsername(process.env.SUPER_ADMIN_USERNAME);
  const password = String(process.env.SUPER_ADMIN_PASSWORD ?? "");
  const encodedPassword = passwordHash(password);

  if (!Number.isInteger(targetId) || targetId <= 0) fail("SUPER_ADMIN_TARGET_ID is invalid.");
  if (!fullName) fail("SUPER_ADMIN_FULL_NAME is required.");
  if (!email.includes("@") || /\s/.test(email)) fail("SUPER_ADMIN_EMAIL is invalid.");

  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
  if (!target) fail(`User id ${targetId} was not found.`);

  const duplicate = db.prepare(`SELECT id, username, email FROM users
    WHERE id != ? AND (lower(email) = ? OR lower(username) = ?) LIMIT 1`).get(targetId, email, username);
  if (duplicate) {
    const sameUsername = String(duplicate.username ?? "").toLowerCase() === username;
    fail(sameUsername ? `Username '${username}' is already used by user ${duplicate.id}.` : `Email '${email}' is already used by user ${duplicate.id}.`);
  }

  const reset = db.transaction(() => {
    const previousSupers = db.prepare("SELECT id, full_name, email, username FROM users WHERE role = 'SUPER_ADMIN' AND id != ?").all(targetId);
    db.prepare("UPDATE users SET role = 'ADMIN' WHERE role = 'SUPER_ADMIN' AND id != ?").run(targetId);

    const updated = db.prepare(`UPDATE users SET
      full_name = ?, email = ?, username = ?, role = 'SUPER_ADMIN', is_active = 1
      WHERE id = ? RETURNING id, full_name, username, email, role, team, is_active`)
      .get(fullName, email, username, targetId);

    db.prepare(`INSERT INTO user_credentials (user_id, password_hash, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = CURRENT_TIMESTAMP`)
      .run(targetId, encodedPassword);

    db.prepare(`INSERT INTO audit_logs (
      entity_type, entity_id, action, actor, before_value, after_value
    ) VALUES ('USER', ?, 'RESET_SUPER_ADMIN', 'local-maintenance', ?, ?)`)
      .run(String(targetId), JSON.stringify({
        id: target.id,
        full_name: target.full_name,
        username: target.username,
        email: target.email,
        role: target.role,
        is_active: target.is_active,
        demotedSuperAdmins: previousSupers,
      }), JSON.stringify(updated));

    return { updated, demoted: previousSupers.length };
  })();

  console.log("[OK] Super admin reset completed.");
  console.log(`[OK] Demoted previous super admins: ${reset.demoted}`);
  console.table([reset.updated]);
} finally {
  db.close();
}
