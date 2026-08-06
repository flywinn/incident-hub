import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { ensureDatabase } from "../db/ensure";

const scrypt = promisify(scryptCallback);

export const LOCAL_AUTH_COOKIE = "incidenthub_session";
const PASSWORD_PREFIX = "scrypt-v1";
const DEFAULT_SESSION_HOURS = 12;
const MIN_PASSWORD_LENGTH = 8;
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;

let localAuthReadyPromise: Promise<void> | null = null;

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET باید حداقل ۳۲ کاراکتر باشد.");
  }
  return secret;
}

function sessionHours() {
  const configured = Number(process.env.AUTH_SESSION_HOURS ?? DEFAULT_SESSION_HOURS);
  return Number.isFinite(configured)
    ? Math.min(168, Math.max(1, Math.trunc(configured)))
    : DEFAULT_SESSION_HOURS;
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function safeEqualText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function validateLocalPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`رمز عبور باید حداقل ${MIN_PASSWORD_LENGTH.toLocaleString("fa-IR")} کاراکتر باشد.`);
  }
  if (password.length > 200) {
    throw new Error("رمز عبور بیش از حد طولانی است.");
  }
}

export function normalizeLocalUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/^@+/, "");
}

export function validateLocalUsername(value: unknown) {
  const username = normalizeLocalUsername(value);
  if (username.length < MIN_USERNAME_LENGTH || username.length > MAX_USERNAME_LENGTH) {
    throw new Error(`نام کاربری باید بین ${MIN_USERNAME_LENGTH.toLocaleString("fa-IR")} تا ${MAX_USERNAME_LENGTH.toLocaleString("fa-IR")} کاراکتر باشد.`);
  }
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(username)) {
    throw new Error("نام کاربری فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.");
  }
  return username;
}

export async function ensureLocalAuthReady() {
  if (localAuthReadyPromise) return localAuthReadyPromise;
  localAuthReadyPromise = (async () => {
    const d1 = await ensureDatabase();
    await d1.prepare(`CREATE TABLE IF NOT EXISTS user_credentials (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();

    const columns = (await d1.prepare("PRAGMA table_info(users)").all<Record<string, unknown>>()).results;
    if (!columns.some((column) => String(column.name) === "username")) {
      await d1.prepare("ALTER TABLE users ADD COLUMN username TEXT").run();
    }
    await d1.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
      ON users(username COLLATE NOCASE)
      WHERE username IS NOT NULL AND username <> ''`).run();

  })();

  try {
    await localAuthReadyPromise;
  } catch (error) {
    localAuthReadyPromise = null;
    throw error;
  }
}

export async function hashLocalPassword(password: string) {
  validateLocalPassword(password);
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyLocalPassword(password: string, encoded: string) {
  const [prefix, saltEncoded, hashEncoded] = encoded.split("$");
  if (prefix !== PASSWORD_PREFIX || !saltEncoded || !hashEncoded) return false;
  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(hashEncoded, "base64url");
    const actual = await scrypt(password, salt, expected.length) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export async function getUserPasswordHash(userId: number) {
  await ensureLocalAuthReady();
  const d1 = await ensureDatabase();
  const row = await d1.prepare("SELECT password_hash FROM user_credentials WHERE user_id = ?")
    .bind(userId).first<{ password_hash: string }>();
  return row?.password_hash ?? "";
}

export async function verifyUserPassword(userId: number, password: string) {
  const encoded = await getUserPasswordHash(userId);
  return Boolean(encoded) && verifyLocalPassword(password, encoded);
}

export async function setUserPassword(userId: number, password: string) {
  const passwordHash = await hashLocalPassword(password);
  await ensureLocalAuthReady();
  const d1 = await ensureDatabase();
  await d1.prepare(`INSERT INTO user_credentials (user_id, password_hash, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = CURRENT_TIMESTAMP`)
    .bind(userId, passwordHash).run();
}

export async function tryBootstrapPassword(user: { id: number; email: string; role: string }, password: string) {
  const bootstrapEmail = process.env.LOCAL_AUTH_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? "";
  const bootstrapPassword = process.env.LOCAL_AUTH_BOOTSTRAP_PASSWORD ?? "";
  if (!bootstrapEmail || !bootstrapPassword) return false;
  if (!["SUPER_ADMIN", "ADMIN"].includes(user.role) || user.email.toLowerCase() !== bootstrapEmail) return false;
  if (!safeEqualText(password, bootstrapPassword)) return false;
  validateLocalPassword(bootstrapPassword);
  await setUserPassword(user.id, bootstrapPassword);
  return true;
}

type SessionPayload = {
  uid: number;
  exp: number;
};

export function createLocalSessionToken(userId: number) {
  const payload: SessionPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + sessionHours() * 3600,
  };
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function localSessionUserId(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCAL_AUTH_COOKIE}=`));
  if (!cookie) return null;
  const token = decodeURIComponent(cookie.slice(LOCAL_AUTH_COOKIE.length + 1));
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = createHmac("sha256", sessionSecret()).update(encodedPayload).digest("base64url");
  if (!safeEqualText(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as SessionPayload;
    if (!Number.isInteger(payload.uid) || payload.uid <= 0) return null;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

function cookieSecure(requestUrl?: string) {
  const configured = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return requestUrl ? new URL(requestUrl).protocol === "https:" : false;
}

export function localSessionCookie(token: string, requestUrl?: string) {
  const maxAge = sessionHours() * 3600;
  return [
    `${LOCAL_AUTH_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
    cookieSecure(requestUrl) ? "Secure" : "",
  ].filter(Boolean).join("; ");
}

export function clearLocalSessionCookie(requestUrl?: string) {
  return [
    `${LOCAL_AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    cookieSecure(requestUrl) ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
