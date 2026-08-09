import { ensureDatabase } from "../db/ensure";
import { identityFromHeaders, ownerEmailSet } from "./identity";
import {
  ensureLocalAuthReady,
  getUserPasswordHash,
  localSessionCredentialIsCurrent,
  localSessionIdentity,
  normalizeLocalUsername,
  setUserPassword,
  tryBootstrapPassword,
  verifyLocalPassword,
} from "./local-auth";

export type AppRole = "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "VIEWER";

export type AppUser = {
  id: number;
  fullName: string;
  email: string;
  username: string;
  role: AppRole;
  team: string;
  isActive: boolean;
};

type Identity = {
  email: string;
  displayName: string;
};

const roleSet = new Set<AppRole>(["SUPER_ADMIN", "ADMIN", "OPERATOR", "VIEWER"]);
const dummyPasswordHash = `scrypt-v1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;
let superAdminReadyPromise: Promise<void> | null = null;

export function authenticationMode() {
  return process.env.AUTH_MODE?.trim().toUpperCase() === "PROXY" ? "PROXY" : "LOCAL";
}

export function isAuthenticationDisabled() {
  const explicitMode = process.env.AUTH_MODE?.trim().toUpperCase();
  // Once LOCAL or PROXY is explicitly selected, a stale AUTH_DISABLED=true must not
  // silently bypass authentication. AUTH_DISABLED remains available only when no
  // explicit authentication mode has been configured.
  if (explicitMode === "LOCAL" || explicitMode === "PROXY") return false;
  return process.env.AUTH_DISABLED?.trim().toLowerCase() === "true";
}

function noAuthIdentity(): Identity {
  return {
    email: (process.env.NOAUTH_ADMIN_EMAIL || "local-admin@incident.local").trim().toLowerCase(),
    displayName: (process.env.NOAUTH_ADMIN_NAME || "مدیر موقت سامانه").trim(),
  };
}

function toAppUser(row: Record<string, unknown>): AppUser {
  const rawRole = String(row.role);
  return {
    id: Number(row.id),
    fullName: String(row.full_name),
    email: String(row.email).toLowerCase(),
    username: normalizeLocalUsername(row.username),
    role: roleSet.has(rawRole as AppRole) ? rawRole as AppRole : "VIEWER",
    team: String(row.team),
    isActive: Number(row.is_active) !== 0,
  };
}

function roleAllowed(role: AppRole, allowedRoles: readonly AppRole[]) {
  if (allowedRoles.includes(role)) return true;
  // SUPER_ADMIN inherits every endpoint that historically allowed ADMIN.
  return role === "SUPER_ADMIN" && allowedRoles.includes("ADMIN");
}

async function ensureLocalSuperAdmin() {
  if (superAdminReadyPromise) return superAdminReadyPromise;
  superAdminReadyPromise = (async () => {
    await ensureLocalAuthReady();
    const d1 = await ensureDatabase();
    const existing = await d1.prepare("SELECT id FROM users WHERE role = 'SUPER_ADMIN' AND is_active = 1 LIMIT 1")
      .first<Record<string, unknown>>();
    if (existing) return;

    const bootstrapEmail = process.env.LOCAL_AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? "";
    if (!bootstrapEmail) return;
    const bootstrap = await d1.prepare("SELECT * FROM users WHERE lower(email) = ? AND is_active = 1 LIMIT 1")
      .bind(bootstrapEmail).first<Record<string, unknown>>();
    if (!bootstrap) return;

    await d1.prepare("UPDATE users SET role = 'SUPER_ADMIN' WHERE id = ?")
      .bind(Number(bootstrap.id)).run();
    await d1.prepare(`INSERT INTO audit_logs (
      entity_type, entity_id, action, actor, before_value, after_value
    ) VALUES ('USER', ?, 'PROMOTE_SUPER_ADMIN', ?, ?, ?)`)
      .bind(
        String(bootstrap.id),
        String(bootstrap.full_name),
        JSON.stringify({ role: bootstrap.role }),
        JSON.stringify({ role: "SUPER_ADMIN", bootstrapEmail }),
      ).run();
  })();

  try {
    await superAdminReadyPromise;
  } catch (error) {
    superAdminReadyPromise = null;
    throw error;
  }
}

export async function getNoAuthAdmin(): Promise<AppUser> {
  const d1 = await ensureDatabase();
  const identity = noAuthIdentity();
  const existing = await d1
    .prepare("SELECT * FROM users WHERE lower(email) = ? LIMIT 1")
    .bind(identity.email)
    .first<Record<string, unknown>>();

  if (existing) {
    const updated = await d1.prepare(`UPDATE users
      SET full_name = ?, role = 'ADMIN', team = 'مدیریت سامانه', is_active = 1
      WHERE id = ? RETURNING *`)
      .bind(identity.displayName, Number(existing.id))
      .first<Record<string, unknown>>();
    if (!updated) throw new Error("Unable to enable the temporary administrator account.");
    return toAppUser(updated);
  }

  const created = await d1.prepare(`INSERT INTO users (
    full_name, email, role, team, is_active
  ) VALUES (?, ?, 'ADMIN', 'مدیریت سامانه', 1) RETURNING *`)
    .bind(identity.displayName, identity.email)
    .first<Record<string, unknown>>();
  if (!created) throw new Error("Unable to create the temporary administrator account.");
  return toAppUser(created);
}

export async function getLocalSessionUser(cookieHeader: string | null | undefined): Promise<AppUser | null> {
  await ensureLocalSuperAdmin();
  const session = localSessionIdentity(cookieHeader);
  if (!session) return null;
  if (!await localSessionCredentialIsCurrent(session.userId, session.credentialVersion)) return null;
  const d1 = await ensureDatabase();
  const row = await d1.prepare("SELECT * FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
    .bind(session.userId).first<Record<string, unknown>>();
  return row ? toAppUser(row) : null;
}

export async function authenticateLocalCredentials(identifierValue: string, password: string): Promise<AppUser | null> {
  await ensureLocalSuperAdmin();
  const identifier = normalizeLocalUsername(identifierValue.includes("@") ? identifierValue : identifierValue.replace(/^@+/, ""));
  const rawIdentifier = identifierValue.trim().toLowerCase().replace(/^@+/, "");
  if (!rawIdentifier || !password) return null;

  const d1 = await ensureDatabase();
  const row = await d1.prepare(`SELECT * FROM users
    WHERE is_active = 1 AND (lower(email) = ? OR lower(username) = ?)
    LIMIT 1`)
    .bind(rawIdentifier, identifier || rawIdentifier)
    .first<Record<string, unknown>>();
  if (!row) {
    await verifyLocalPassword(password, dummyPasswordHash);
    return null;
  }

  const user = toAppUser(row);
  let encoded = await getUserPasswordHash(user.id);
  if (!encoded) {
    const bootstrapped = await tryBootstrapPassword({ id: user.id, email: user.email, role: user.role }, password);
    if (!bootstrapped) return null;
    encoded = await getUserPasswordHash(user.id);
    await d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('USER', ?, 'LOCAL_AUTH_BOOTSTRAP', ?, ?)")
      .bind(String(user.id), user.fullName, JSON.stringify({ localAuthEnabled: true, username: user.username })).run();
  }

  return await verifyLocalPassword(password, encoded) ? user : null;
}

export async function setLocalUserPassword(userId: number, password: string, actor: AppUser) {
  const d1 = await ensureDatabase();
  const target = await d1.prepare("SELECT id, full_name, email, username FROM users WHERE id = ?")
    .bind(userId).first<Record<string, unknown>>();
  if (!target) throw new Error("کاربر پیدا نشد.");
  await setUserPassword(userId, password);
  await d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('USER', ?, 'PASSWORD_CHANGED', ?, ?)")
    .bind(String(userId), actor.fullName, JSON.stringify({ email: target.email, username: target.username, passwordChanged: true })).run();
}

export async function getOrProvisionAppUser(identity: Identity): Promise<AppUser | null> {
  const d1 = await ensureDatabase();
  const email = identity.email.trim().toLowerCase();
  const existing = await d1
    .prepare("SELECT * FROM users WHERE lower(email) = ? LIMIT 1")
    .bind(email)
    .first<Record<string, unknown>>();

  const isDashboardOwner = ownerEmailSet().has(email);
  if (existing && isDashboardOwner && (Number(existing.is_active) === 0 || !["SUPER_ADMIN", "ADMIN"].includes(String(existing.role)))) {
    const restored = await d1.prepare(`UPDATE users
      SET full_name = ?, role = 'ADMIN', team = 'مدیریت سامانه', is_active = 1
      WHERE id = ? RETURNING *`)
      .bind(identity.displayName || String(existing.full_name), Number(existing.id))
      .first<Record<string, unknown>>();
    if (!restored) return null;
    await d1.prepare(`INSERT INTO audit_logs (
      entity_type, entity_id, action, actor, before_value, after_value
    ) VALUES ('USER', ?, 'RESTORE_OWNER_ACCESS', ?, ?, ?)`)
      .bind(String(existing.id), email, JSON.stringify(existing), JSON.stringify(restored))
      .run();
    return toAppUser(restored);
  }
  if (existing) return Number(existing.is_active) === 0 ? null : toAppUser(existing);
  if (!isDashboardOwner) return null;

  const created = await d1.prepare(`INSERT INTO users (
    full_name, email, role, team, is_active
  ) VALUES (?, ?, 'ADMIN', 'مدیریت سامانه', 1) RETURNING *`)
    .bind(identity.displayName || email, email)
    .first<Record<string, unknown>>();

  if (!created) return null;
  await d1.prepare(`INSERT INTO audit_logs (
    entity_type, entity_id, action, actor, after_value
  ) VALUES ('USER', ?, 'PROVISION_ADMIN', ?, ?)`)
    .bind(String(created.id), email, JSON.stringify(created))
    .run();
  return toAppUser(created);
}

export async function authorizeRequest(
  request: Request,
  allowedRoles: readonly AppRole[],
): Promise<{ user: AppUser } | { response: Response }> {
  if (isAuthenticationDisabled()) {
    const user = await getNoAuthAdmin();
    if (!roleAllowed(user.role, allowedRoles)) {
      return { response: Response.json({ error: "سطح دسترسی مدیر موقت کافی نیست." }, { status: 403 }) };
    }
    return { user };
  }

  if (authenticationMode() === "LOCAL") {
    const user = await getLocalSessionUser(request.headers.get("cookie"));
    if (!user) {
      return { response: Response.json({ error: "نشست ورود معتبر نیست. دوباره وارد سامانه شوید." }, { status: 401 }) };
    }
    if (!roleAllowed(user.role, allowedRoles)) {
      return { response: Response.json({ error: "سطح دسترسی شما برای این عملیات کافی نیست." }, { status: 403 }) };
    }
    return { user };
  }

  const identity = identityFromHeaders(request.headers);
  if (!identity) {
    return {
      response: Response.json({ error: "هویت معتبر از Reverse Proxy دریافت نشد." }, { status: 401 }),
    };
  }

  const d1 = await ensureDatabase();
  const row = await d1
    .prepare("SELECT * FROM users WHERE lower(email) = ? AND is_active = 1 LIMIT 1")
    .bind(identity.email)
    .first<Record<string, unknown>>();
  if (!row) {
    return {
      response: Response.json({ error: "حساب شما در فهرست کاربران فعال نیست." }, { status: 403 }),
    };
  }

  const user = toAppUser(row);
  if (!roleAllowed(user.role, allowedRoles)) {
    return {
      response: Response.json({ error: "سطح دسترسی شما برای این تغییر کافی نیست." }, { status: 403 }),
    };
  }
  return { user };
}
