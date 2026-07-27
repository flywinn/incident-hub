import { ensureDatabase } from "../db/ensure";
import { identityFromHeaders, ownerEmailSet } from "./identity";

export type AppRole = "ADMIN" | "OPERATOR" | "VIEWER";

export type AppUser = {
  id: number;
  fullName: string;
  email: string;
  role: AppRole;
  team: string;
  isActive: boolean;
};

type Identity = {
  email: string;
  displayName: string;
};

const roleSet = new Set<AppRole>(["ADMIN", "OPERATOR", "VIEWER"]);

export function isAuthenticationDisabled() {
  return process.env.AUTH_DISABLED?.trim().toLowerCase() === "true";
}

function noAuthIdentity(): Identity {
  return {
    email: (process.env.NOAUTH_ADMIN_EMAIL || "local-admin@incident.local").trim().toLowerCase(),
    displayName: (process.env.NOAUTH_ADMIN_NAME || "مدیر موقت سامانه").trim(),
  };
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

function toAppUser(row: Record<string, unknown>): AppUser {
  const rawRole = String(row.role);
  return {
    id: Number(row.id),
    fullName: String(row.full_name),
    email: String(row.email).toLowerCase(),
    role: roleSet.has(rawRole as AppRole) ? rawRole as AppRole : "VIEWER",
    team: String(row.team),
    isActive: Number(row.is_active) !== 0,
  };
}

export async function getOrProvisionAppUser(identity: Identity): Promise<AppUser | null> {
  const d1 = await ensureDatabase();
  const email = identity.email.trim().toLowerCase();
  const existing = await d1
    .prepare("SELECT * FROM users WHERE lower(email) = ? LIMIT 1")
    .bind(email)
    .first<Record<string, unknown>>();

  const isDashboardOwner = ownerEmailSet().has(email);
  if (existing && isDashboardOwner && (Number(existing.is_active) === 0 || String(existing.role) !== "ADMIN")) {
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
    if (!allowedRoles.includes(user.role)) {
      return { response: Response.json({ error: "سطح دسترسی مدیر موقت کافی نیست." }, { status: 403 }) };
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
  if (!allowedRoles.includes(user.role)) {
    return {
      response: Response.json({ error: "سطح دسترسی شما برای این تغییر کافی نیست." }, { status: 403 }),
    };
  }
  return { user };
}
