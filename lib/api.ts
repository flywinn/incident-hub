import { randomUUID } from "node:crypto";

export function cleanText(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === "string" && options.includes(value as T);
}

type ErrorShape = {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
};

type CodedError = Error & {
  code?: string;
  errno?: number;
};

export function requestIdFor(request?: Request) {
  const supplied = request?.headers.get("x-request-id")?.trim() ?? "";
  if (/^[A-Za-z0-9._:-]{8,100}$/.test(supplied)) return supplied;
  return randomUUID();
}

function normalizeError(error: unknown): ErrorShape {
  const coded = error instanceof Error ? error as CodedError : null;
  const code = coded?.code?.toUpperCase() ?? "";
  const message = coded?.message ?? "";

  if (error instanceof SyntaxError) {
    return {
      status: 400,
      code: "INVALID_JSON",
      message: "ساختار اطلاعات ارسالی معتبر نیست.",
      retryable: false,
    };
  }

  if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED" || message.includes("database is locked")) {
    return {
      status: 503,
      code: "DATABASE_BUSY",
      message: "پایگاه داده موقتاً درگیر است. چند لحظه بعد دوباره تلاش کنید.",
      retryable: true,
      retryAfterSeconds: 2,
    };
  }

  if (code === "SQLITE_FULL" || message.includes("database or disk is full") || code === "ENOSPC") {
    return {
      status: 507,
      code: "DISK_FULL",
      message: "فضای دیسک برای ثبت اطلاعات کافی نیست. با مدیر سرور تماس بگیرید.",
      retryable: false,
    };
  }

  if (["SQLITE_CORRUPT", "SQLITE_NOTADB"].includes(code)) {
    return {
      status: 503,
      code: "DATABASE_INTEGRITY_ERROR",
      message: "سلامت پایگاه داده تأیید نشد. عملیات متوقف شد و نیاز به بررسی مدیر سامانه دارد.",
      retryable: false,
    };
  }

  if (["SQLITE_IOERR", "SQLITE_CANTOPEN", "SQLITE_READONLY", "EACCES", "EPERM", "ENOENT"].includes(code)) {
    return {
      status: 503,
      code: "STORAGE_UNAVAILABLE",
      message: "دسترسی به فضای ذخیره‌سازی یا پایگاه داده ممکن نیست.",
      retryable: true,
      retryAfterSeconds: 5,
    };
  }

  if (code === "SQLITE_CONSTRAINT_FOREIGNKEY" || message.includes("FOREIGN KEY constraint failed")) {
    return {
      status: 409,
      code: "RELATED_RECORD_CONFLICT",
      message: "این عملیات به‌دلیل وجود اطلاعات وابسته قابل انجام نیست.",
      retryable: false,
    };
  }

  if (code.startsWith("SQLITE_CONSTRAINT") || message.includes("UNIQUE constraint failed")) {
    return {
      status: 409,
      code: "DUPLICATE_RECORD",
      message: "رکوردی با همین شناسه یا ایمیل قبلاً ثبت شده است.",
      retryable: false,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "درخواست انجام نشد. دوباره تلاش کنید و در صورت تکرار، کد پیگیری را برای مدیر سامانه ارسال کنید.",
    retryable: true,
  };
}

export function apiError(
  error: unknown,
  request?: Request,
  context: Record<string, unknown> = {},
) {
  const requestId = requestIdFor(request);
  const normalized = normalizeError(error);
  const coded = error instanceof Error ? error as CodedError : null;

  console.error(JSON.stringify({
    level: "error",
    event: "api_request_failed",
    timestamp: new Date().toISOString(),
    requestId,
    method: request?.method,
    path: request ? new URL(request.url).pathname : undefined,
    status: normalized.status,
    errorCode: normalized.code,
    nativeCode: coded?.code,
    message: coded?.message ?? String(error),
    stack: process.env.NODE_ENV === "production" ? undefined : coded?.stack,
    ...context,
  }));

  const headers = new Headers({
    "cache-control": "no-store",
    "x-request-id": requestId,
  });
  if (normalized.retryAfterSeconds) {
    headers.set("retry-after", String(normalized.retryAfterSeconds));
  }

  return Response.json(
    {
      error: normalized.message,
      code: normalized.code,
      requestId,
      retryable: normalized.retryable,
    },
    { status: normalized.status, headers },
  );
}
