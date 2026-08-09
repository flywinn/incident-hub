import { createHash } from "node:crypto";

type LoginBucket = {
  failures: number;
  windowStartedAt: number;
  blockedUntil: number;
  lastSeenAt: number;
};

type LoginLimit = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const buckets = new Map<string, LoginBucket>();
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOCK_MS = 15 * 60 * 1000;
const MAX_BUCKETS = 5000;

function boundedSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(parsed)))
    : fallback;
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function sourceFor(request: Request) {
  if (process.env.AUTH_TRUST_PROXY_HEADERS?.trim().toLowerCase() !== "true") return "direct";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = request.headers.get("x-real-ip")?.trim() ?? "";
  const candidate = (forwarded || realIp).slice(0, 64);
  return /^[A-Fa-f0-9:.]+$/.test(candidate) ? candidate : "proxy-unknown";
}

function bucketDefinitions(request: Request, identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase().replace(/^@+/, "").slice(0, 180) || "empty";
  return [
    {
      key: `identifier:${hashKey(normalizedIdentifier)}`,
      maximumFailures: boundedSetting("AUTH_LOGIN_MAX_FAILURES", 5, 3, 20),
    },
    {
      key: `source:${hashKey(sourceFor(request))}`,
      maximumFailures: boundedSetting("AUTH_LOGIN_SOURCE_MAX_FAILURES", 50, 10, 500),
    },
  ];
}

function policy() {
  return {
    windowMs: boundedSetting("AUTH_LOGIN_WINDOW_SECONDS", DEFAULT_WINDOW_MS / 1000, 60, 86400) * 1000,
    lockMs: boundedSetting("AUTH_LOGIN_LOCK_SECONDS", DEFAULT_LOCK_MS / 1000, 60, 86400) * 1000,
  };
}

function prune(now: number, retentionMs: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.blockedUntil <= now && now - bucket.lastSeenAt > retentionMs) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS - 2) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

function stateFor(key: string, now: number, windowMs: number) {
  const existing = buckets.get(key);
  if (!existing || now - existing.windowStartedAt >= windowMs) {
    const fresh = { failures: 0, windowStartedAt: now, blockedUntil: 0, lastSeenAt: now };
    buckets.set(key, fresh);
    return fresh;
  }
  existing.lastSeenAt = now;
  buckets.delete(key);
  buckets.set(key, existing);
  return existing;
}

function statusFor(request: Request, identifier: string, now = Date.now()): LoginLimit {
  const { windowMs } = policy();
  let retryAfterSeconds = 0;
  for (const { key } of bucketDefinitions(request, identifier)) {
    const bucket = stateFor(key, now, windowMs);
    retryAfterSeconds = Math.max(retryAfterSeconds, Math.ceil((bucket.blockedUntil - now) / 1000));
  }
  return { allowed: retryAfterSeconds <= 0, retryAfterSeconds: Math.max(0, retryAfterSeconds) };
}

export function checkLoginAttempt(request: Request, identifier: string): LoginLimit {
  return statusFor(request, identifier);
}

export function recordLoginFailure(request: Request, identifier: string): LoginLimit {
  const now = Date.now();
  const { windowMs, lockMs } = policy();
  prune(now, Math.max(windowMs, lockMs) * 2);
  for (const { key, maximumFailures } of bucketDefinitions(request, identifier)) {
    const bucket = stateFor(key, now, windowMs);
    bucket.failures += 1;
    if (bucket.failures >= maximumFailures) bucket.blockedUntil = Math.max(bucket.blockedUntil, now + lockMs);
  }
  return statusFor(request, identifier, now);
}

export function clearLoginFailures(identifier: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase().replace(/^@+/, "").slice(0, 180) || "empty";
  buckets.delete(`identifier:${hashKey(normalizedIdentifier)}`);
}
