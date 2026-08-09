import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function requireDatabasePath(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value || !isAbsolute(value)) fail(`${name} must be an absolute path.`);
  const path = resolve(value);
  if (!existsSync(path)) fail(`${name} database was not found: ${path}`);
  return path;
}

function tableExists(database, table) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

const devPath = requireDatabasePath("DEV_DB_PATH");
const productionPath = requireDatabasePath("PROD_DB_PATH");
if (devPath.toLowerCase() === productionPath.toLowerCase()) {
  fail("Development and Production database paths must be different.");
}

const dev = new Database(devPath, { readonly: true, fileMustExist: true });
const production = new Database(productionPath, { fileMustExist: true });

try {
  for (const [label, database] of [["Development", dev], ["Production", production]]) {
    for (const table of ["users", "user_credentials"]) {
      if (!tableExists(database, table)) fail(`${label} database is missing table '${table}'. Run migrations first.`);
    }
  }
  if (!tableExists(production, "audit_logs")) fail("Production database is missing table 'audit_logs'. Run migrations first.");

  const devUsers = dev.prepare(`SELECT
      u.id, u.full_name, u.email, u.username, u.role, u.team, u.is_active,
      c.password_hash, c.updated_at AS credential_updated_at
    FROM users u
    LEFT JOIN user_credentials c ON c.user_id = u.id
    ORDER BY u.id`).all();

  if (devUsers.length === 0) fail("Development database contains no users; refusing to change Production.");

  const emails = new Set();
  const usernames = new Set();
  const allowedRoles = new Set(["SUPER_ADMIN", "ADMIN", "OPERATOR", "VIEWER"]);
  for (const user of devUsers) {
    const email = String(user.email ?? "").trim().toLowerCase();
    const username = String(user.username ?? "").trim().toLowerCase();
    if (!email || !email.includes("@") || emails.has(email)) fail(`Development has an invalid or duplicate email: ${email || "(empty)"}`);
    if (username && usernames.has(username)) fail(`Development has a duplicate username: ${username}`);
    if (!allowedRoles.has(String(user.role))) fail(`Development user ${email} has an invalid role: ${user.role}`);
    if (Number(user.is_active) !== 0 && !user.password_hash) {
      fail(`Active Development user ${email} has no local password; refusing to create a Production login mismatch.`);
    }
    emails.add(email);
    if (username) usernames.add(username);
  }

  const activeSuperAdmins = devUsers.filter((user) => user.role === "SUPER_ADMIN" && Number(user.is_active) !== 0);
  if (activeSuperAdmins.length !== 1) {
    fail(`Development must contain exactly one active SUPER_ADMIN; found ${activeSuperAdmins.length}.`);
  }

  production.pragma("foreign_keys = ON");
  production.pragma("journal_mode = WAL");
  production.pragma("busy_timeout = 30000");

  const summary = production.transaction(() => {
    const existingUsers = production.prepare("SELECT * FROM users ORDER BY id").all();
    const existingByEmail = new Map(existingUsers.map((user) => [String(user.email).trim().toLowerCase(), user]));
    const sourceEmails = new Set(devUsers.map((user) => String(user.email).trim().toLowerCase()));

    // Release all Production usernames first so username swaps from Dev cannot
    // collide with the case-insensitive unique index during the transaction.
    production.prepare("UPDATE users SET username = NULL").run();

    const updateUser = production.prepare(`UPDATE users SET
      full_name = ?, email = ?, username = ?, role = ?, team = ?, is_active = ?
      WHERE id = ?`);
    const insertUser = production.prepare(`INSERT INTO users
      (full_name, email, username, role, team, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const upsertCredential = production.prepare(`INSERT INTO user_credentials (user_id, password_hash, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`);
    const deleteCredential = production.prepare("DELETE FROM user_credentials WHERE user_id = ?");
    const updateOwnerName = tableExists(production, "bugs")
      ? production.prepare("UPDATE bugs SET owner_name = ? WHERE owner_id = ?")
      : null;

    let updated = 0;
    let inserted = 0;
    let credentialsCopied = 0;
    let credentialsCleared = 0;
    const idMap = [];

    for (const source of devUsers) {
      const email = String(source.email).trim().toLowerCase();
      const username = String(source.username ?? "").trim().toLowerCase() || null;
      const existing = existingByEmail.get(email);
      let productionId;

      if (existing) {
        productionId = Number(existing.id);
        updateUser.run(
          String(source.full_name), email, username, String(source.role),
          String(source.team), Number(source.is_active) === 0 ? 0 : 1, productionId,
        );
        updateOwnerName?.run(String(source.full_name), productionId);
        updated += 1;
      } else {
        const result = insertUser.run(
          String(source.full_name), email, username, String(source.role), String(source.team),
          Number(source.is_active) === 0 ? 0 : 1, String(source.created_at ?? new Date().toISOString()),
        );
        productionId = Number(result.lastInsertRowid);
        inserted += 1;
      }

      if (source.password_hash) {
        upsertCredential.run(productionId, String(source.password_hash), String(source.credential_updated_at ?? new Date().toISOString()));
        credentialsCopied += 1;
      } else {
        credentialsCleared += deleteCredential.run(productionId).changes;
      }
      idMap.push({ devUserId: Number(source.id), productionUserId: productionId, email });
    }

    let deactivated = 0;
    for (const existing of existingUsers) {
      const email = String(existing.email).trim().toLowerCase();
      if (sourceEmails.has(email)) continue;
      production.prepare("UPDATE users SET username = NULL, is_active = 0 WHERE id = ?").run(Number(existing.id));
      credentialsCleared += deleteCredential.run(Number(existing.id)).changes;
      deactivated += 1;
    }

    production.prepare(`INSERT INTO audit_logs
      (entity_type, entity_id, action, actor, after_value)
      VALUES ('USER', 'ALL', 'SYNC_DEV_AUTH_TO_PRODUCTION', 'local-maintenance', ?)`)
      .run(JSON.stringify({
        sourceUserCount: devUsers.length,
        updated,
        inserted,
        deactivated,
        credentialsCopied,
        credentialsCleared,
        idMap,
      }));

    return { updated, inserted, deactivated, credentialsCopied, credentialsCleared };
  })();

  const integrity = production.pragma("quick_check", { simple: true });
  if (integrity !== "ok") fail(`Production quick_check failed after synchronization: ${integrity}`);

  const activeUsers = production.prepare("SELECT COUNT(*) AS count FROM users WHERE is_active = 1").get().count;
  const loginReadyUsers = production.prepare(`SELECT COUNT(*) AS count
    FROM users u JOIN user_credentials c ON c.user_id = u.id
    WHERE u.is_active = 1`).get().count;
  const superAdmin = activeSuperAdmins[0];

  console.log(JSON.stringify({
    status: "ok",
    developmentDatabase: devPath,
    productionDatabase: productionPath,
    sourceUsers: devUsers.length,
    activeUsers,
    loginReadyUsers,
    ...summary,
    superAdmin: {
      email: String(superAdmin.email).trim().toLowerCase(),
      username: String(superAdmin.username ?? "").trim().toLowerCase() || null,
    },
    integrity,
  }, null, 2));
} finally {
  production.close();
  dev.close();
}
