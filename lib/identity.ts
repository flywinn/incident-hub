import { timingSafeEqual } from "node:crypto";

export type RequestIdentity = {
  email: string;
  displayName: string;
  rawUser: string;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeAuthenticatedUser(rawValue: string): string {
  const raw = rawValue.trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();

  const slashIndex = raw.lastIndexOf("\\");
  const userName = slashIndex >= 0 ? raw.slice(slashIndex + 1) : raw;
  const sourceDomain = slashIndex >= 0 ? raw.slice(0, slashIndex).toLowerCase() : "";
  const configuredDomain = (process.env.AUTH_EMAIL_DOMAIN || "").trim().toLowerCase();
  const domain = configuredDomain || (sourceDomain ? `${sourceDomain}.local` : "internal.local");
  return `${userName.toLowerCase()}@${domain}`;
}

export function identityFromHeaders(headers: Headers): RequestIdentity | null {
  const expectedSecret = process.env.AUTH_PROXY_SECRET?.trim();
  if (expectedSecret) {
    const receivedSecret = headers.get("x-auth-proxy-secret")?.trim() || "";
    if (!receivedSecret || !safeEqual(receivedSecret, expectedSecret)) return null;
  }

  const configuredHeader = (process.env.AUTH_USER_HEADER || "x-authenticated-user").toLowerCase();
  const rawUser = headers.get(configuredHeader)?.trim() || "";
  if (!rawUser) return null;

  const email = normalizeAuthenticatedUser(rawUser);
  if (!email) return null;

  const configuredNameHeader = (process.env.AUTH_NAME_HEADER || "x-authenticated-name").toLowerCase();
  const displayName = headers.get(configuredNameHeader)?.trim() || rawUser;
  return { email, displayName, rawUser };
}

export function ownerEmailSet() {
  return new Set(
    (process.env.DASHBOARD_OWNER_EMAILS || "")
      .split(/[;,\s]+/)
      .map((value) => normalizeAuthenticatedUser(value))
      .filter(Boolean),
  );
}
