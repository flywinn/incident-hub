"use client";

/* eslint-disable @next/next/no-img-element -- Incident evidence uses authenticated/object URLs, and UI micro-illustrations are animated GIFs. */

/* IncidentHub UI v1.11.3 · Simple Login + Self-service Username */

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { DEFAULT_APP_SETTINGS, type AppSettings } from "../lib/settings";

type Row = Record<string, unknown>;

type Snapshot = {
  bugs: Row[];
  services: Row[];
  users: Row[];
  assignees: Row[];
  attachments: Row[];
  followUps: Row[];
  events: Row[];
  emails: Row[];
  imports: Row[];
  auditLogs: Row[];
  currentUser: CurrentUser | null;
  appSettings: AppSettings;
  integrations: {
    elk: { status: string; endpoint: string };
    email: { status: string };
  };
};

type PageKey =
  | "dashboard"
  | "bugs"
  | "followups"
  | "services"
  | "users"
  | "audit"
  | "automation"
  | "settings"
  | "help";

type WidgetKey = "kpis" | "critical" | "attention" | "overview" | "services" | "incidents" | "followups" | "quality" | "growth" | "activity";

type IconName =
  | "dashboard"
  | "incident"
  | "followup"
  | "service"
  | "users"
  | "audit"
  | "automation"
  | "settings"
  | "search"
  | "refresh"
  | "plus"
  | "alert"
  | "activity"
  | "waiting"
  | "check"
  | "clock"
  | "menu"
  | "close"
  | "arrowLeft"
  | "admin"
  | "person"
  | "filter";

type CurrentUser = {
  id: number;
  fullName: string;
  email: string;
  username: string;
  role: "SUPER_ADMIN" | "ADMIN" | "OPERATOR" | "VIEWER";
  team: string;
  isActive: boolean;
};

type AppPreferences = {
  theme: "forest" | "ocean" | "violet" | "amber" | "dark";
  fontSize: "normal" | "large" | "xlarge";
  autoRefresh: boolean;
  refreshSeconds: number;
  adaptiveTables: boolean;
  tableDensity: "comfortable" | "compact";
  contrast: "standard" | "high";
};

const defaultPreferences: AppPreferences = {
  theme: "dark",
  fontSize: "large",
  autoRefresh: true,
  refreshSeconds: 30,
  adaptiveTables: true,
  tableDensity: "comfortable",
  contrast: "standard",
};

const defaultWidgetOrder: WidgetKey[] = ["kpis", "incidents", "attention", "followups", "critical", "services", "overview", "quality", "growth", "activity"];
const defaultHiddenWidgets: WidgetKey[] = ["critical", "services", "overview", "quality", "growth", "activity"];

const widgetNames: Record<WidgetKey, string> = {
  kpis: "شاخص‌های کلیدی",
  critical: "هشدار بحرانی",
  attention: "صف نیازمند اقدام",
  overview: "ترکیب وضعیت‌ها",
  services: "سرویس‌های پرتکرار",
  incidents: "خطاهای باز اخیر",
  followups: "پیگیری‌های نزدیک",
  quality: "کیفیت داده",
  growth: "رشد داده",
  activity: "جریان فعالیت",
};

const statusLabels: Record<string, string> = {
  NEW: "جدید",
  IN_PROGRESS: "در حال پیگیری",
  WAITING: "منتظر پاسخ",
  RESOLVED: "رفع‌شده",
  CLOSED: "بسته‌شده",
  REOPENED: "بازگشایی",
};

const statusColors: Record<string, string> = {
  NEW: "#3b82c4",
  IN_PROGRESS: "#e58b2b",
  WAITING: "#d5b528",
  RESOLVED: "#35a46d",
  CLOSED: "#8a9690",
  REOPENED: "#dc514b",
};

const eventLabels: Record<string, string> = {
  BUG_CREATED: "ثبت خطا",
  STATUS_CHANGED: "تغییر وضعیت",
  PRIORITY_CHANGED: "تغییر اولویت",
  ASSIGNED: "تغییر مسئول",
  ALERT_REPEATED: "تکرار هشدار",
  FOLLOW_UP_SCHEDULED: "ثبت پیگیری",
  FOLLOW_UP_COMPLETED: "انجام پیگیری",
  SPREADSHEET_IMPORTED: "ورود از Excel",
  DETAILS_UPDATED: "ویرایش اطلاعات",
  EMAIL_DRAFTED: "ذخیره پیش‌نویس ایمیل",
  EMAIL_QUEUED: "ثبت ایمیل در صف",
  EMAIL_SENT: "ارسال ایمیل",
  ATTACHMENT_ADDED: "افزودن تصویر",
  ATTACHMENT_REMOVED: "حذف تصویر",
};

const sourceLabels: Record<string, string> = {
  MANUAL: "ثبت دستی",
  ELK: "هشدار ELK",
  SPREADSHEET: "Excel",
};

function roleLabel(role: CurrentUser["role"]) {
  return role === "SUPER_ADMIN" ? "سوپر ادمین" : role === "ADMIN" ? "مدیر سامانه" : role === "OPERATOR" ? "کارشناس" : "مشاهده‌گر";
}

const pageTitles: Record<PageKey, { title: string; kicker: string }> = {
  dashboard: { title: "وضعیت خطاها", kicker: "خلاصه آخرین اطلاعات ثبت‌شده" },
  bugs: { title: "خطاها", kicker: "ثبت و پیگیری موارد" },
  followups: { title: "پیگیری‌ها", kicker: "اقدام‌های باز و عقب‌افتاده" },
  services: { title: "سرویس‌ها", kicker: "مسیر مانیتورینگ و تیم مسئول" },
  users: { title: "کاربران", kicker: "نقش و سطح دسترسی" },
  audit: { title: "سوابق تغییرات", kicker: "چه کسی، چه چیزی را تغییر داده است" },
  automation: { title: "اتصال‌ها", kicker: "ELK و کانال ارسال ایمیل" },
  settings: { title: "تنظیمات", kicker: "نمایش و دریافت اطلاعات" },
  help: { title: "راهنما و مستندات", kicker: "روش استفاده روزمره از سامانه" },
};

const navItems: { key: PageKey; label: string; icon: IconName }[] = [
  { key: "dashboard", label: "داشبورد", icon: "dashboard" },
  { key: "bugs", label: "خطاها", icon: "incident" },
  { key: "followups", label: "پیگیری‌ها", icon: "followup" },
  { key: "services", label: "سرویس‌ها", icon: "service" },
  { key: "users", label: "کاربران", icon: "users" },
  { key: "audit", label: "سوابق تغییرات", icon: "audit" },
  { key: "automation", label: "اتصال‌ها", icon: "automation" },
  { key: "settings", label: "تنظیمات", icon: "settings" },
];

const emptySnapshot: Snapshot = {
  bugs: [],
  services: [],
  users: [],
  assignees: [],
  attachments: [],
  followUps: [],
  events: [],
  emails: [],
  imports: [],
  auditLogs: [],
  currentUser: null,
  appSettings: DEFAULT_APP_SETTINGS,
  integrations: {
    elk: { status: "READY", endpoint: "/api/integrations/elk/alerts" },
    email: { status: "NEEDS_CONFIGURATION" },
  },
};

const pageLoadedAt = Date.now();

function isPast(value: unknown) {
  return Boolean(value) && new Date(String(value)).getTime() < pageLoadedAt;
}

function formatDate(value: unknown, withTime = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatRelativeDate(value: unknown) {
  if (!value) return "بدون تاریخ";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "تاریخ نامعتبر";
  const today = new Date();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((day - base) / 86_400_000);
  if (diff === 0) return "امروز";
  if (diff === 1) return "فردا";
  if (diff === -1) return "دیروز";
  return new Intl.RelativeTimeFormat("fa-IR", { numeric: "always" }).format(diff, "day");
}

function bugAssignees(assignees: Row[], bugId: unknown) {
  return assignees.filter((item) => Number(item.bug_id) === Number(bugId));
}

function faNumber(value: unknown) {
  return new Intl.NumberFormat("fa-IR").format(Number(value ?? 0));
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function toDateTimeLocal(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

async function uploadIncidentImages(bugId: number, files: File[]) {
  if (!files.length) return;
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  const response = await fetch(`/api/bugs/${bugId}/attachments`, { method: "POST", body: form, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "آپلود تصاویر انجام نشد.");
}

function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };

  const paths: Record<IconName, ReactNode> = {
    dashboard: <><path d="M4 13.2 12 5l8 8.2" /><path d="M6.5 11.4V20h11v-8.6" /><path d="M9.5 20v-5.5h5V20" /></>,
    incident: <><path d="M8.2 3.8h7.6l4.4 4.4v7.6l-4.4 4.4H8.2l-4.4-4.4V8.2l4.4-4.4Z" /><path d="M6.9 12h2.4l1.3-3.1 2.7 6.2 1.4-3.1h2.4" /><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" /></>,
    followup: <><circle cx="12" cy="12" r="8.7" /><path d="m8.2 12.2 2.4 2.4 5.3-5.5" /></>,
    service: <><rect x="4" y="4" width="6" height="6" rx="1.4" /><rect x="14" y="14" width="6" height="6" rx="1.4" /><path d="M10 7h4.2a2 2 0 0 1 2 2v5" /><path d="m13.8 12.2 2.4 2.4 2.4-2.4" /></>,
    users: <><path d="M16 20v-1.4a4.2 4.2 0 0 0-4.2-4.2H7.7a4.2 4.2 0 0 0-4.2 4.2V20" /><circle cx="9.7" cy="7.4" r="3.3" /><path d="M16.2 4.5a3.2 3.2 0 0 1 0 6.1" /><path d="M18 14.6a4 4 0 0 1 2.5 3.7V20" /></>,
    audit: <><path d="M8 6h11" /><path d="M8 12h11" /><path d="M8 18h11" /><circle cx="4.5" cy="6" r=".8" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r=".8" fill="currentColor" stroke="none" /></>,
    automation: <><path d="M7.5 7.5A6.4 6.4 0 0 1 18 9" /><path d="m18 5 .2 4.2-4.2.2" /><path d="M16.5 16.5A6.4 6.4 0 0 1 6 15" /><path d="m6 19-.2-4.2 4.2-.2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.3 13.4a7.8 7.8 0 0 0 0-2.8l2-1.5-2-3.4-2.5 1a8.7 8.7 0 0 0-2.4-1.4L14 2.7h-4l-.4 2.6a8.7 8.7 0 0 0-2.4 1.4l-2.5-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2.8l-2 1.5 2 3.4 2.5-1a8.7 8.7 0 0 0 2.4 1.4l.4 2.6h4l.4-2.6a8.7 8.7 0 0 0 2.4-1.4l2.5 1 2-3.4-2-1.5Z" /></>,
    search: <><circle cx="10.7" cy="10.7" r="6.2" /><path d="m15.3 15.3 4.2 4.2" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M18.2 15.5A7.3 7.3 0 1 1 19.7 9" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    alert: <><path d="M12 3.3 2.9 19.2h18.2L12 3.3Z" /><path d="M12 9v4.4" /><path d="M12 16.8h.01" /></>,
    activity: <><path d="M3 12h4l2.2-5.3 4.1 10.6 2.2-5.3H21" /></>,
    waiting: <><circle cx="12" cy="12" r="8.7" /><path d="M12 7.5V12l3 2" /></>,
    check: <><circle cx="12" cy="12" r="8.7" /><path d="m8.2 12.2 2.4 2.4 5.3-5.5" /></>,
    clock: <><circle cx="12" cy="12" r="8.7" /><path d="M12 7.2V12l3.2 2" /></>,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
    close: <><path d="m7 7 10 10" /><path d="M17 7 7 17" /></>,
    arrowLeft: <><path d="M19 12H5" /><path d="m10 7-5 5 5 5" /></>,
    admin: <><path d="M12 2.9 19.2 6v5.7c0 4.7-3 8-7.2 9.6-4.2-1.6-7.2-4.9-7.2-9.6V6l7.2-3.1Z" /><path d="m12 7.1.8 1.7 1.9.3-1.4 1.4.3 1.9-1.6-.9-1.7.9.4-1.9-1.4-1.4 1.9-.3.8-1.7Z" /><path d="M8.4 16.6c1-1.4 2.2-2.1 3.6-2.1 1.5 0 2.7.7 3.6 2.1" /><path d="M9.8 14.1v-1.1" /><path d="M14.2 14.1v-1.1" /></>,
    person: <><circle cx="12" cy="8.5" r="3.1" /><path d="M6.2 19.1c.9-2.8 3-4.3 5.8-4.3 2.9 0 5 1.5 5.9 4.3" /><path d="M4.8 19.1h14.4" /></>,
    filter: <><path d="M4 6h16" /><path d="M7 12h10" /><path d="M10 18h4" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

type ApiErrorPayload = {
  error?: string;
  code?: string;
  requestId?: string;
  retryable?: boolean;
};

class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; code?: string; requestId?: string; retryable?: boolean } = {}) {
    const tracking = options.requestId ? ` کد پیگیری: ${options.requestId}` : "";
    super(`${message}${tracking}`);
    this.name = "ApiClientError";
    this.status = options.status ?? 0;
    this.code = options.code ?? "REQUEST_FAILED";
    this.requestId = options.requestId ?? "";
    this.retryable = options.retryable ?? false;
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const canRetry = method === "GET";
  const attempts = canRetry ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), canRetry ? 45_000 : 30_000);
    const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          ...(init?.headers ?? {}),
        },
      });
      const raw = await response.text();
      let payload: (T & ApiErrorPayload) | null = null;
      if (raw) {
        try {
          payload = JSON.parse(raw) as T & ApiErrorPayload;
        } catch {
          payload = null;
        }
      }

      if (!response.ok) {
        if (response.status === 401 && window.location.pathname !== "/login") {
          window.location.replace("/login");
        }
        const serverRequestId = payload?.requestId || response.headers.get("x-request-id") || requestId;
        const retryable = payload?.retryable === true || [502, 503, 504].includes(response.status);
        const error = new ApiClientError(
          payload?.error || (response.status >= 500 ? "سرویس موقتاً پاسخ‌گو نیست." : "درخواست پذیرفته نشد."),
          {
            status: response.status,
            code: payload?.code || `HTTP_${response.status}`,
            requestId: serverRequestId,
            retryable,
          },
        );
        if (attempt < attempts && retryable) {
          await delay(800 * attempt);
          continue;
        }
        throw error;
      }

      if (raw && payload === null) {
        throw new ApiClientError("پاسخ دریافتی از سرور قابل پردازش نیست.", {
          status: response.status,
          code: "INVALID_SERVER_RESPONSE",
          requestId: response.headers.get("x-request-id") || requestId,
          retryable: canRetry,
        });
      }
      return (payload ?? {}) as T;
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      const normalized = error instanceof ApiClientError
        ? error
        : new ApiClientError(
            isAbort
              ? "زمان پاسخ‌گویی سرور بیش از حد مجاز شد."
              : navigator.onLine
                ? "ارتباط با سرور برقرار نشد."
                : "اتصال شبکه این دستگاه قطع است.",
            { code: isAbort ? "REQUEST_TIMEOUT" : "NETWORK_ERROR", requestId, retryable: true },
          );
      if (attempt < attempts && normalized.retryable) {
        await delay(800 * attempt);
        continue;
      }
      throw normalized;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new ApiClientError("درخواست انجام نشد.");
}

export default function IncidentHub({
  currentUser,
  signOutPath,
  authMode,
}: {
  currentUser: CurrentUser;
  signOutPath: string;
  authMode: "LOCAL" | "PROXY" | "DISABLED";
}) {
  const [page, setPage] = useState<PageKey>("dashboard");
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedBugId, setSelectedBugId] = useState<number | null>(null);
  const [modal, setModal] = useState<"bug" | "service" | "user" | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(defaultPreferences);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<Row | null>(null);
  const [usernameOpen, setUsernameOpen] = useState(false);
  const canEdit = ["SUPER_ADMIN", "ADMIN", "OPERATOR"].includes(currentUser.role);
  const isAdmin = currentUser.role === "SUPER_ADMIN" || currentUser.role === "ADMIN";
  const isSuperAdmin = currentUser.role === "SUPER_ADMIN";

  const reload = useCallback(async () => {
    try {
      const snapshot = await api<Snapshot>("/api/bootstrap");
      setData(snapshot);
      setLastUpdatedAt(new Date().toISOString());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "دریافت اطلاعات ممکن نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api<Snapshot>("/api/bootstrap")
      .then((snapshot) => {
        if (!cancelled) {
          setData(snapshot);
          setLastUpdatedAt(new Date().toISOString());
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "دریافت اطلاعات ممکن نشد.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storageKey = "elk-app-preferences-v4";
      const legacyKey = "elk-app-preferences-v3";
      const saved = window.localStorage.getItem(storageKey);
      const legacy = saved ? null : window.localStorage.getItem(legacyKey);
      const raw = saved ?? legacy;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<AppPreferences>;
          // v1.13 intentionally moves existing installations to the dark baseline once.
          // After migration, any explicit user theme choice is persisted in v4.
          setPreferences({ ...defaultPreferences, ...parsed, theme: saved ? (parsed.theme ?? "dark") : "dark" });
          if (legacy) window.localStorage.removeItem(legacyKey);
        } catch {
          window.localStorage.removeItem(storageKey);
          window.localStorage.removeItem(legacyKey);
        }
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("elk-app-preferences-v4", JSON.stringify(preferences));
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.fontSize = preferences.fontSize;
    document.documentElement.dataset.tableDensity = preferences.tableDensity;
    document.documentElement.dataset.contrast = preferences.contrast;
  }, [preferences, preferencesReady]);

  useEffect(() => {
    if (!preferences.autoRefresh) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, Math.max(15, preferences.refreshSeconds) * 1000);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [preferences.autoRefresh, preferences.refreshSeconds, reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!(event.reason instanceof ApiClientError)) return;
      event.preventDefault();
      setError(event.reason.message);
    };
    const handleOnline = () => void reload();
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("online", handleOnline);
    };
  }, [reload]);

  const selectedBug = data.bugs.find((bug) => Number(bug.id) === selectedBugId) ?? null;
  const openBugs = data.bugs.filter((bug) => !["CLOSED", "RESOLVED"].includes(String(bug.status)));
  const p1OpenCount = openBugs.filter((bug) => String(bug.priority) === "P1").length;
  const waitingOpenCount = openBugs.filter((bug) => String(bug.status) === "WAITING").length;
  const overdueFollowups = data.followUps.filter((item) =>
    item.status === "SCHEDULED" && isPast(item.scheduled_at),
  );

  const filteredBugs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data.bugs;
    return data.bugs.filter((bug) =>
      [bug.bug_code, bug.title, bug.service_label, bug.owner_name, bug.status]
        .some((value) => String(value ?? "").toLowerCase().includes(needle)) ||
      bugAssignees(data.assignees, bug.id).some((item) => String(item.full_name ?? "").toLowerCase().includes(needle)),
    );
  }, [data.assignees, data.bugs, search]);

  const showNotice = (message: string) => setNotice(message);
  const activePageTitle = data.appSettings.pageTitles[page] ?? pageTitles[page];

  const saveAppSettings = async (settings: AppSettings, successMessage = "تنظیمات عمومی ذخیره شد.") => {
    const response = await api<{ settings: AppSettings }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    setData((current) => ({ ...current, appSettings: response.settings }));
    showNotice(successMessage);
  };

  const quickUpdateBug = async (id: number, payload: Record<string, unknown>) => {
    await api(`/api/bugs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    showNotice("تغییر سریع ذخیره شد.");
    await reload();
  };

  return (
    <div className="app-shell" dir="rtl" data-theme={preferences.theme}>
      <Sidebar
        active={page}
        onNavigate={setPage}
        openCount={openBugs.length}
        overdueCount={overdueFollowups.length}
        isAdmin={isAdmin}
        settings={data.appSettings}
        mobileOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-area">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            type="button"
            aria-label="باز کردن منوی اصلی"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Icon name="menu" size={20} />
          </button>
          <div className="page-heading">
            <span className="page-kicker">{activePageTitle.kicker}</span>
            <h1>{activePageTitle.title}</h1>
          </div>
          <div className="header-incident-status" aria-label="وضعیت خطاهای باز">
            <span className="header-open-count"><i></i><strong>{faNumber(openBugs.length)}</strong><em>خطای باز</em></span>
            {waitingOpenCount > 0 && <span className="header-waiting-count"><Icon name="waiting" size={14} /><strong>{faNumber(waitingOpenCount)}</strong><em>منتظر پاسخ</em></span>}
            {p1OpenCount > 0 && <span className="header-p1-count"><Icon name="alert" size={14} /><strong>{faNumber(p1OpenCount)}</strong><em>P1</em></span>}
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="جست‌وجوی شناسه، موضوع یا سرویس..."
                aria-label="جست‌وجوی خطا"
              />
            </label>
            <button className="icon-button" onClick={() => void reload()} aria-label="به‌روزرسانی اطلاعات" title="به‌روزرسانی اطلاعات">
              <Icon name="refresh" size={18} />
            </button>
            {canEdit && (
              <button className="primary-button incident-create-button" onClick={() => setModal("bug")}>
                <span><Icon name="plus" size={17} /></span>
                <b>ثبت خطا</b>
              </button>
            )}
            <div className="account-menu">
              <button className="account-button" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen}>
                <span className={cx("account-role-icon", currentUser.role.toLowerCase())} aria-hidden="true"><Icon name={["SUPER_ADMIN", "ADMIN"].includes(currentUser.role) ? "admin" : "person"} size={18} /></span>
                <span><strong>{currentUser.fullName}</strong><small>{roleLabel(currentUser.role)}</small></span>
                <b className="account-chevron">⌄</b>
              </button>
              {accountOpen && (
                <div className="account-popover">
                  <strong>{currentUser.fullName}</strong>
                  {currentUser.username && <span dir="ltr">@{currentUser.username}</span>}
                  <span dir="ltr">{currentUser.email}</span>
                  <small>{currentUser.team} · {roleLabel(currentUser.role)}</small>
                  {authMode === "LOCAL" && <button type="button" className="account-password-action" onClick={() => { setAccountOpen(false); setUsernameOpen(true); }}>{currentUser.username ? "تغییر نام کاربری" : "تنظیم نام کاربری"}</button>}
                  {authMode === "LOCAL" && <button type="button" className="account-password-action" onClick={() => { setAccountOpen(false); setPasswordUser({ id: currentUser.id, full_name: currentUser.fullName, email: currentUser.email, username: currentUser.username, role: currentUser.role, team: currentUser.team, is_active: currentUser.isActive ? 1 : 0 }); }}>تغییر رمز عبور من</button>}
                  {authMode === "LOCAL" ? (
                    <form className="account-signout-form" action={signOutPath || "/api/auth/logout"} method="post">
                      <button type="submit" className="account-password-action account-signout-action">خروج از حساب</button>
                    </form>
                  ) : authMode === "PROXY" ? <span>ورود یکپارچه ویندوز</span> : <span>حالت توسعه بدون ورود</span>}
                </div>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="banner banner-error">
            <span>!</span>
            <div><strong>دریافت اطلاعات با مشکل روبه‌رو شد</strong><small>{error}</small></div>
            <button onClick={() => void reload()}>تلاش دوباره</button>
          </div>
        )}
        {notice && <div className="toast">{notice}</div>}

        <div className="content">
          {loading ? (
            <LoadingState />
          ) : page === "dashboard" ? (
            <Dashboard
              data={data}
              filteredBugs={filteredBugs}
              adaptiveTables={preferences.adaptiveTables}
              canEdit={canEdit}
              canManage={isAdmin}
              appSettings={data.appSettings}
              onSaveSettings={saveAppSettings}
              onSelectBug={(id) => setSelectedBugId(id)}
              onQuickUpdate={quickUpdateBug}
              onSeeAll={() => setPage("bugs")}
            />
          ) : page === "bugs" ? (
            <BugsPage
              bugs={filteredBugs}
              services={data.services}
              users={data.users}
              assignees={data.assignees}
              adaptiveTables={preferences.adaptiveTables}
              canEdit={canEdit}
              onSelectBug={(id) => setSelectedBugId(id)}
              onQuickUpdate={quickUpdateBug}
            />
          ) : page === "followups" ? (
            <FollowupsPage
              followUps={data.followUps}
              bugs={data.bugs}
              canEdit={canEdit}
              appSettings={data.appSettings}
              onChanged={async (message) => {
                showNotice(message);
                await reload();
              }}
              onOpenBug={(id) => setSelectedBugId(id)}
            />
          ) : page === "services" ? (
            <ServicesPage
              services={data.services}
              canManage={isAdmin}
              onNew={() => setModal("service")}
              onUpdated={async () => {
                showNotice("اطلاعات سرویس ذخیره شد.");
                await reload();
              }}
            />
          ) : page === "users" ? (
            <UsersPage
              users={data.users}
              currentUserId={currentUser.id}
              currentUserRole={currentUser.role}
              onNew={() => setModal("user")}
              onPassword={(user) => setPasswordUser(user)}
              onUpdated={async () => {
                showNotice("اطلاعات کاربر ذخیره شد.");
                await reload();
              }}
            />
          ) : page === "audit" ? (
            <AuditPage logs={data.auditLogs} />
          ) : page === "automation" ? (
            <AutomationPage data={data} />
          ) : page === "help" ? (
            <HelpPage settings={data.appSettings} onNavigate={setPage} />
          ) : (
            <SettingsPage
              preferences={preferences}
              appSettings={data.appSettings}
              canManage={isAdmin}
              lastUpdatedAt={lastUpdatedAt}
              onChange={setPreferences}
              onSaveAppSettings={saveAppSettings}
              onRefresh={reload}
            />
          )}
        </div>
      </main>

      {selectedBug && (
        <BugDrawer
          key={String(selectedBug.id)}
          bug={selectedBug}
          services={data.services}
          users={data.users}
          assignees={bugAssignees(data.assignees, selectedBug.id)}
          attachments={data.attachments.filter((item) => Number(item.bug_id) === Number(selectedBug.id))}
          followUps={data.followUps.filter((item) => Number(item.bug_id) === Number(selectedBug.id))}
          events={data.events.filter((event) => Number(event.bug_id) === Number(selectedBug.id))}
          canEdit={canEdit}
          canDelete={isAdmin}
          appSettings={data.appSettings}
          onClose={() => setSelectedBugId(null)}
          onUpdated={async (message) => {
            showNotice(message);
            await reload();
          }}
        />
      )}

      {canEdit && modal === "bug" && (
        <NewBugModal
          services={data.services}
          users={data.users}
          onClose={() => setModal(null)}
          onCreated={async () => {
            setModal(null);
            showNotice("خطای جدید ثبت و در تاریخچه ذخیره شد.");
            await reload();
          }}
        />
      )}
      {isAdmin && modal === "service" && (
        <NewServiceModal
          onClose={() => setModal(null)}
          onCreated={async () => {
            setModal(null);
            showNotice("سرویس جدید ثبت شد.");
            await reload();
          }}
        />
      )}
      {isSuperAdmin && modal === "user" && (
        <NewUserModal
          onClose={() => setModal(null)}
          onCreated={async () => {
            setModal(null);
            showNotice("کاربر جدید ثبت شد.");
            await reload();
          }}
        />
      )}
      {usernameOpen && (
        <UsernameModal
          currentUsername={currentUser.username}
          email={currentUser.email}
          onClose={() => setUsernameOpen(false)}
          onChanged={async () => {
            setUsernameOpen(false);
            window.location.reload();
          }}
        />
      )}
      {passwordUser && (
        <ChangePasswordModal
          user={passwordUser}
          isCurrentUser={Number(passwordUser.id) === currentUser.id}
          actorRole={currentUser.role}
          onClose={() => setPasswordUser(null)}
          onChanged={async () => {
            setPasswordUser(null);
            showNotice(Number(passwordUser.id) === currentUser.id ? "رمز عبور شما تغییر کرد." : "رمز عبور کاربر بازنشانی شد.");
            await reload();
          }}
        />
      )}
    </div>
  );
}

function Sidebar({
  active,
  onNavigate,
  openCount,
  overdueCount,
  isAdmin,
  settings,
  mobileOpen,
  onClose,
}: {
  active: PageKey;
  onNavigate: (key: PageKey) => void;
  openCount: number;
  overdueCount: number;
  isAdmin: boolean;
  settings: AppSettings;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const availableItems = navItems.filter((item) =>
    isAdmin || !["users", "automation", "settings"].includes(item.key),
  );
  const navigate = (key: PageKey) => {
    onNavigate(key);
    onClose();
  };

  return (
    <>
      <button
        type="button"
        className={cx("sidebar-backdrop", mobileOpen && "visible")}
        aria-label="بستن منوی اصلی"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onClose}
      />
      <aside className={cx("sidebar", mobileOpen && "mobile-open")} aria-label="منوی اصلی">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true"><Icon name="incident" size={23} /><span className="brand-signal"></span></div>
        <div><strong>{settings.brand.name}</strong><small>{settings.brand.subtitle}</small></div>
        <button className="sidebar-mobile-close" type="button" aria-label="بستن منوی اصلی" onClick={onClose}><Icon name="close" size={18} /></button>
      </div>
      <nav>
        <span className="nav-section">فضای کاری</span>
        {availableItems.map((item) => (
          <button
            key={item.key}
            className={cx("nav-item", active === item.key && "active")}
            title={item.label}
            onClick={() => navigate(item.key)}
          >
            <span className="nav-icon"><Icon name={item.icon} size={17} /></span>
            <span>{item.label}</span>
            {item.key === "bugs" && openCount > 0 && <b>{faNumber(openCount)}</b>}
            {item.key === "followups" && overdueCount > 0 && <b className="danger-count">{faNumber(overdueCount)}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-health">
          <div><img className="health-gif" src="/ui/system-link.gif" alt="" aria-hidden="true" /><span className="pulse"></span><strong>ارتباط با سامانه</strong></div>
          <small>اطلاعات از پایگاه داده دریافت می‌شود</small>
          <div className="health-meter"><i></i></div>
        </div>
        <button className={cx("support-link", active === "help" && "active")} onClick={() => navigate("help")}><span>؟</span> راهنما و مستندات</button>
      </div>
    </aside>
    </>
  );
}

function Dashboard({
  data,
  filteredBugs,
  adaptiveTables,
  canEdit,
  canManage,
  appSettings,
  onSaveSettings,
  onSelectBug,
  onQuickUpdate,
  onSeeAll,
}: {
  data: Snapshot;
  filteredBugs: Row[];
  adaptiveTables: boolean;
  canEdit: boolean;
  canManage: boolean;
  appSettings: AppSettings;
  onSaveSettings: (settings: AppSettings, successMessage?: string) => Promise<void>;
  onSelectBug: (id: number) => void;
  onQuickUpdate: (id: number, payload: Record<string, unknown>) => Promise<void>;
  onSeeAll: () => void;
}) {
  const [range, setRange] = useState("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<WidgetKey[]>(defaultWidgetOrder);
  const [hidden, setHidden] = useState<WidgetKey[]>(defaultHiddenWidgets);
  const [customTitles, setCustomTitles] = useState<Record<string, string>>(appSettings.dashboard.widgetTitles);
  const [savingTitles, setSavingTitles] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("elk-dashboard-layout-v4");
      const savedRange = window.localStorage.getItem("elk-dashboard-range-v1");
      if (savedRange) setRange(savedRange);
      if (!saved) {
        setPreferencesReady(true);
        return;
      }
      try {
        const parsed = JSON.parse(saved) as { order?: WidgetKey[]; hidden?: WidgetKey[] };
        if (Array.isArray(parsed.order)) {
          const validSaved = parsed.order.filter((key): key is WidgetKey => defaultWidgetOrder.includes(key));
          const upgraded = [...validSaved, ...defaultWidgetOrder.filter((key) => !validSaved.includes(key))];
          setOrder(upgraded);
        }
        if (Array.isArray(parsed.hidden)) setHidden(parsed.hidden.filter((key): key is WidgetKey => defaultWidgetOrder.includes(key)));
      } catch {
        window.localStorage.removeItem("elk-dashboard-layout-v4");
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("elk-dashboard-layout-v4", JSON.stringify({ order, hidden }));
    window.localStorage.setItem("elk-dashboard-range-v1", range);
  }, [order, hidden, range, preferencesReady]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCustomTitles(appSettings.dashboard.widgetTitles);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [appSettings.dashboard.widgetTitles]);

  const widgetTitle = (key: WidgetKey) => customTitles[key] || widgetNames[key];

  const saveTitles = async () => {
    setSavingTitles(true);
    try {
      await onSaveSettings({
        ...appSettings,
        dashboard: { ...appSettings.dashboard, widgetTitles: { ...customTitles } },
      }, "عنوان‌های داشبورد برای همه کاربران ذخیره شد.");
    } finally {
      setSavingTitles(false);
    }
  };

  const rangeBugs = useMemo(() => {
    if (range === "ALL") return data.bugs;
    if (range === "CUSTOM") {
      const from = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const to = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      if (from > to) return [];
      return data.bugs.filter((bug) => {
        const time = new Date(String(bug.created_at)).getTime();
        return time >= from && time <= to;
      });
    }
    const cutoff = pageLoadedAt - Number(range) * 86_400_000;
    return data.bugs.filter((bug) => new Date(String(bug.created_at)).getTime() >= cutoff);
  }, [customFrom, customTo, data.bugs, range]);

  const rangeBugIds = new Set(rangeBugs.map((bug) => Number(bug.id)));
  const active = rangeBugs.filter((bug) => !["CLOSED", "RESOLVED"].includes(String(bug.status)));
  const p1 = active.filter((bug) => bug.priority === "P1");
  const newOpen = active.filter((bug) => bug.status === "NEW");
  const inProgressOpen = active.filter((bug) => bug.status === "IN_PROGRESS");
  const waitingOpen = active.filter((bug) => bug.status === "WAITING");
  const scheduled = data.followUps.filter((item) =>
    item.status === "SCHEDULED" && rangeBugIds.has(Number(item.bug_id)),
  );
  const overdue = scheduled.filter((item) => isPast(item.scheduled_at));
  const assigned = rangeBugs.filter((bug) => bug.owner_id || String(bug.owner_name) !== "تعیین نشده");
  const followedBugIds = new Set(data.followUps.map((item) => Number(item.bug_id)));
  const withFollowup = rangeBugs.filter((bug) => followedBugIds.has(Number(bug.id)));
  const scheduledBugIds = new Set(scheduled.map((item) => Number(item.bug_id)));
  const unassigned = active.filter((bug) => !bug.owner_id && String(bug.owner_name) === "تعیین نشده");
  const withoutFollowup = active.filter((bug) => !scheduledBugIds.has(Number(bug.id)));
  const stale = active.filter((bug) =>
    pageLoadedAt - new Date(String(bug.updated_at)).getTime() > appSettings.followups.staleAfterHours * 60 * 60 * 1000,
  );
  const openAge = active.length
    ? Math.round(active.reduce((sum, bug) => sum + Math.max(0, pageLoadedAt - new Date(String(bug.first_seen_at)).getTime()), 0) / active.length / 86_400_000)
    : 0;
  const statusCounts = Object.keys(statusLabels).map((key) => ({
    key,
    label: statusLabels[key],
    count: rangeBugs.filter((bug) => bug.status === key).length,
  })).filter((item) => item.count > 0);
  const priorityCounts = ["P1", "P2", "P3", "P4"].map((key) => ({
    key,
    count: rangeBugs.filter((bug) => bug.priority === key).length,
  }));
  const serviceCounts = Object.entries(
    rangeBugs.reduce<Record<string, number>>((acc, bug) => {
      const key = String(bug.service_label);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxServiceCount = Math.max(...serviceCounts.map((item) => item[1]), 1);
  const critical = [...p1].sort((a, b) => new Date(String(b.last_seen_at)).getTime() - new Date(String(a.last_seen_at)).getTime())[0];
  const growthDays = Array.from({ length: 10 }, (_, index) => {
    const date = new Date(pageLoadedAt - (9 - index) * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric" }).format(date),
      count: data.bugs.filter((bug) => String(bug.created_at ?? bug.first_seen_at).slice(0, 10) === key).length,
    };
  });
  const maxGrowth = Math.max(...growthDays.map((item) => item.count), 1);
  const recentGrowth = growthDays.slice(-3).reduce((sum, item) => sum + item.count, 0);

  const moveWidget = (key: WidgetKey, direction: -1 | 1) => {
    setOrder((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const renderWidget = (key: WidgetKey) => {
    if (hidden.includes(key)) return null;
    let content: ReactNode;
    if (key === "kpis") {
      content = (
        <section className="stats-grid incident-kpis">
          <StatCard label="کل خطاهای باز" value={active.length} note={`میانگین عمر ${faNumber(openAge)} روز`} icon="incident" tone="danger" trend={p1.length ? `${faNumber(p1.length)} مورد P1` : "نیازمند پیگیری"} emphasis />
          <StatCard label="جدید" value={newOpen.length} note="هنوز وارد چرخه پیگیری نشده" icon="alert" tone="blue" trend="وضعیت NEW" />
          <StatCard label="در حال پیگیری" value={inProgressOpen.length} note="دارای اقدام یا بررسی فعال" icon="activity" tone="orange" trend="وضعیت فعال" />
          <StatCard label="منتظر پاسخ" value={waitingOpen.length} note="وابسته به پاسخ یا اقدام بیرونی" icon="waiting" tone="yellow" trend="نیازمند بازبینی" />
        </section>
      );
    } else if (key === "critical") {
      if (!critical) return null;
      content = (
        <section className="critical-strip" onClick={() => onSelectBug(Number(critical.id))}>
          <div className="critical-icon"><Icon name="alert" size={18} /></div>
          <div>
            <span>خطای P1 باز</span>
            <strong>{String(critical.title)}</strong>
            <small>{String(critical.bug_code)} · {String(critical.service_label)} · آخرین مشاهده {formatDate(critical.last_seen_at, true)}</small>
          </div>
          <button>{canEdit ? "بازکردن و بررسی" : "مشاهده جزئیات"} <Icon name="arrowLeft" size={15} /></button>
        </section>
      );
    } else if (key === "attention") {
      const items = [
        p1.length ? { label: "P1 باز", value: p1.length, text: "نیازمند بررسی فوری", tone: "red" } : null,
        overdue.length ? { label: "پیگیری عقب‌افتاده", value: overdue.length, text: "موعد اقدام گذشته است", tone: "orange" } : null,
        unassigned.length ? { label: "بدون مسئول", value: unassigned.length, text: "مسئول پیگیری تعیین نشده", tone: "yellow" } : null,
        withoutFollowup.length ? { label: "بدون اقدام بعدی", value: withoutFollowup.length, text: "پیگیری بعدی ثبت نشده", tone: "purple" } : null,
        stale.length ? { label: `بدون تغییر بیش از ${faNumber(appSettings.followups.staleAfterHours)} ساعت`, value: stale.length, text: "آخرین ویرایش قدیمی است", tone: "gray" } : null,
      ].filter((item): item is { label: string; value: number; text: string; tone: string } => Boolean(item)).slice(0, 4);
      content = (
        <section className="panel attention-panel">
          <PanelHeader title="نیازمند اقدام" subtitle="فقط موارد باز که الان به توجه نیاز دارند" action={<button className="text-button" onClick={onSeeAll}>فهرست خطاها <Icon name="arrowLeft" size={14} /></button>} />
          {items.length ? (
            <div className="attention-grid">
              {items.map((item) => (
                <article className={item.tone} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{faNumber(item.value)}</strong>
                  <small>{item.text}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="attention-empty"><img className="attention-empty-gif" src="/ui/incident-clear.gif" alt="" aria-hidden="true" /><div><strong>مورد فوری برای اقدام نیست</strong><span>در حال حاضر هیچ خطای بازِ بدون مسئول، عقب‌افتاده یا P1 ثبت نشده است.</span></div></div>
          )}
        </section>
      );
    } else if (key === "overview") {
      content = (
        <section className="panel analytics-panel">
          <PanelHeader title={widgetTitle("overview")} subtitle={`${faNumber(rangeBugs.length)} رخداد در بازه انتخابی`} />
          <div className="donut-layout">
            <div className="donut-chart" style={{ background: donutGradient(statusCounts, rangeBugs.length) }}>
              <div><strong>{faNumber(rangeBugs.length)}</strong><span>کل رخداد</span></div>
            </div>
            <div className="chart-legend">
              {statusCounts.map((item, index) => (
                <div key={item.key}><i style={{ background: statusColors[item.key] ?? chartColors[index % chartColors.length] }}></i><span>{item.label}</span><strong>{faNumber(item.count)}</strong></div>
              ))}
            </div>
          </div>
          <div className="priority-strip">
            {priorityCounts.map((item) => <div key={item.key}><span>{item.key}</span><strong>{faNumber(item.count)}</strong></div>)}
          </div>
        </section>
      );
    } else if (key === "services") {
      content = (
        <section className="panel analytics-panel">
          <PanelHeader title={widgetTitle("services")} subtitle="سهم رخدادها به تفکیک سرویس" />
          <div className="bar-list">
            {serviceCounts.map(([service, count]) => (
              <div key={service}>
                <div><span>{service}</span><strong>{faNumber(count)}</strong></div>
                <b><i style={{ width: `${Math.max(8, (count / maxServiceCount) * 100)}%` }}></i></b>
              </div>
            ))}
          </div>
        </section>
      );
    } else if (key === "incidents") {
      const recentBugs = filteredBugs
        .filter((bug) => rangeBugIds.has(Number(bug.id)) && !["CLOSED", "RESOLVED"].includes(String(bug.status)))
        .sort((a, b) => new Date(String(b.last_seen_at ?? b.created_at)).getTime() - new Date(String(a.last_seen_at ?? a.created_at)).getTime())
        .slice(0, 8);
      content = (
        <section className="panel unified-dashboard-incidents">
          <PanelHeader title={widgetTitle("incidents")} subtitle="فقط موارد باز؛ مرتب‌شده براساس آخرین مشاهده" action={<button className="text-button" onClick={onSeeAll}>مشاهده همه ←</button>} />
          <BugTable bugs={recentBugs} assignees={data.assignees} onSelect={onSelectBug} compact adaptiveColumns={adaptiveTables} onQuickUpdate={canEdit ? onQuickUpdate : undefined} />
        </section>
      );
    } else if (key === "followups") {
      content = (
        <section className="panel">
          <PanelHeader title={widgetTitle("followups")} subtitle="اقدام‌های باز و عقب‌افتاده" />
          <div className="followup-list">
            {scheduled.slice(0, 5).map((item) => {
              const bug = data.bugs.find((entry) => Number(entry.id) === Number(item.bug_id));
              const isOverdue = isPast(item.scheduled_at);
              return (
                <button key={String(item.id)} className="followup-item" onClick={() => bug && onSelectBug(Number(bug.id))}>
                  <div className={cx("date-tile", isOverdue && "overdue")}>
                    <strong>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "2-digit" }).format(new Date(String(item.scheduled_at)))}</strong>
                    <span>{new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short" }).format(new Date(String(item.scheduled_at)))}</span>
                  </div>
                  <div><strong>{String(item.type)}</strong><span>{bug ? String(bug.title) : "خطای مرتبط"}</span><small>{String(item.owner_name)} {isOverdue && "· عقب‌افتاده"}</small></div>
                  <span className="arrow">←</span>
                </button>
              );
            })}
            {!scheduled.length && <EmptyState title="پیگیری بازی نیست" text="برای خطاهای باز، اقدام بعدی تعریف کنید." />}
          </div>
        </section>
      );
    } else if (key === "quality") {
      content = (
        <section className="panel quality-panel">
          <PanelHeader title={widgetTitle("quality")} subtitle="بررسی مسئول و پیگیری ثبت‌شده" />
          <div className="quality-metrics">
            <QualityMetric label="مسئول مشخص" value={rangeBugs.length ? Math.round(assigned.length / rangeBugs.length * 100) : 0} />
            <QualityMetric label="دارای پیگیری" value={rangeBugs.length ? Math.round(withFollowup.length / rangeBugs.length * 100) : 0} />
            <QualityMetric label="داده واردشده" value={rangeBugs.length ? Math.round(rangeBugs.filter((bug) => bug.source === "SPREADSHEET").length / rangeBugs.length * 100) : 0} />
          </div>
          <div className="import-proof"><span>Excel</span><div><strong>{faNumber(data.imports.find((item) => String(item.source_name).toLowerCase().includes("bug-report"))?.imported_count ?? 0)} ردیف واردشده</strong><small>تعداد ثبت‌شده در آخرین فایل ورودی</small></div></div>
        </section>
      );
    } else if (key === "growth") {
      content = (
        <section className="panel growth-panel">
          <PanelHeader title={widgetTitle("growth")} subtitle="تعداد خطاهای ثبت‌شده در ۱۰ روز اخیر" />
          <div className="growth-summary"><strong>{faNumber(recentGrowth)}</strong><span>رکورد جدید در ۳ روز اخیر</span><small>{faNumber(data.bugs.length)} خطا · {faNumber(data.services.length)} سرویس · {faNumber(data.users.length)} مسئول</small></div>
          <div className="growth-chart">
            {growthDays.map((item) => (
              <div key={item.key} title={`${item.label}: ${faNumber(item.count)} رکورد`}>
                <b><i style={{ height: `${Math.max(item.count ? 14 : 3, (item.count / maxGrowth) * 100)}%` }}></i></b>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <p className="adaptive-note">{adaptiveTables ? "ستون‌های تکمیلی در جدول خطاها نمایش داده می‌شوند." : "ستون‌های تکمیلی جدول از تنظیمات پنهان شده‌اند."}</p>
        </section>
      );
    } else {
      content = (
        <section className="panel">
          <PanelHeader title={widgetTitle("activity")} subtitle="آخرین تغییرات ثبت‌شده" />
          <div className="activity-list">
            {data.events.slice(0, 6).map((event) => (
              <div className="activity-item" key={String(event.id)}>
                <span className={cx("activity-dot", String(event.event_type).toLowerCase())}></span>
                <div><strong>{eventLabels[String(event.event_type)] ?? String(event.event_type)}</strong><p>{String(event.summary)}</p><small>{String(event.actor)} · {formatDate(event.created_at, true)}</small></div>
              </div>
            ))}
          </div>
        </section>
      );
    }
    return (
      <DashboardWidget
        key={key}
        widgetKey={key}
        title={widgetTitle(key)}
        editing={editing}
        canRename={canManage}
        onRename={(value) => setCustomTitles((current) => ({ ...current, [key]: value }))}
        onMove={(direction) => moveWidget(key, direction)}
        onHide={() => setHidden((current) => [...current, key])}
      >
        {content}
      </DashboardWidget>
    );
  };

  return (
    <div className="dashboard-grid">
      <section className="welcome-row focus-dashboard-hero">
        <div>
          <h2>{appSettings.dashboard.welcomeTitle}</h2>
          <p>{formatDate(new Date().toISOString())} · {appSettings.dashboard.welcomeText}</p>
        </div>
        <div className="dashboard-tools">
          <label><span>تاریخ ثبت</span><select value={range} onChange={(event) => setRange(event.target.value)}><option value="7">۷ روز اخیر</option><option value="30">۳۰ روز اخیر</option><option value="90">۹۰ روز اخیر</option><option value="CUSTOM">بازه دلخواه</option><option value="ALL">همه تاریخ‌ها</option></select></label>
          {range === "CUSTOM" && (
            <div className="custom-date-range">
              <label><span>ثبت از</span><input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} /></label>
              <label><span>ثبت تا</span><input type="date" value={customTo} min={customFrom || undefined} onChange={(event) => setCustomTo(event.target.value)} /></label>
              <small>{customFrom || customTo ? `${customFrom ? formatDate(`${customFrom}T00:00:00`) : "ابتدا"} تا ${customTo ? formatDate(`${customTo}T00:00:00`) : "امروز"}` : "تاریخ شروع و پایان را انتخاب کنید"}</small>
            </div>
          )}
          <button className={cx("secondary-button", editing && "active")} onClick={() => setEditing((value) => !value)}>{editing ? "پایان ویرایش" : "تنظیم داشبورد"}</button>
          <div className="live-chip">به‌روزرسانی خودکار</div>
        </div>
      </section>

      {editing && (
        <section className="dashboard-customizer">
          <div><strong>چیدمان و عنوان‌ها</strong><span>ترتیب و نمایش فقط در همین مرورگر می‌ماند؛ عنوان‌ها با دسترسی مدیر برای همه ذخیره می‌شوند.</span></div>
          <div className="hidden-widgets">
            {hidden.map((key) => <button key={key} onClick={() => setHidden((current) => current.filter((item) => item !== key))}>＋ {widgetTitle(key)}</button>)}
            <button onClick={() => { setOrder(defaultWidgetOrder); setHidden(defaultHiddenWidgets); }}>بازنشانی چیدمان</button>
            {canManage && <button className="save-dashboard-titles" disabled={savingTitles} onClick={() => void saveTitles()}>{savingTitles ? "در حال ذخیره..." : "ذخیره عنوان‌ها"}</button>}
          </div>
        </section>
      )}
      {order.map(renderWidget)}
    </div>
  );
}

const chartColors = ["#2b8f67", "#4f83b6", "#e09a42", "#8a69b7", "#d65b55"];

function donutGradient(items: { key: string; count: number }[], total: number) {
  if (!total) return "#edf2ef";
  let start = 0;
  const parts = items.map((item, index) => {
    const end = start + (item.count / total) * 100;
    const color = statusColors[item.key] ?? chartColors[index % chartColors.length];
    const part = `${color} ${start}% ${end}%`;
    start = end;
    return part;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

function DashboardWidget({
  widgetKey,
  title,
  editing,
  canRename,
  onRename,
  onMove,
  onHide,
  children,
}: {
  widgetKey: string;
  title: string;
  editing: boolean;
  canRename: boolean;
  onRename: (value: string) => void;
  onMove: (direction: -1 | 1) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cx("dashboard-widget", `widget-${widgetKey}`, editing && "editing")}>
      {editing && (
        <div className="widget-controls">
          {canRename ? <input value={title} maxLength={80} aria-label="عنوان بخش" onChange={(event) => onRename(event.target.value)} /> : <strong>{title}</strong>}
          <button onClick={() => onMove(-1)} aria-label="انتقال به بالا">↑</button>
          <button onClick={() => onMove(1)} aria-label="انتقال به پایین">↓</button>
          <button onClick={onHide}>پنهان</button>
        </div>
      )}
      {children}
    </div>
  );
}

function QualityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="quality-metric">
      <div><span>{label}</span><strong>{faNumber(value)}٪</strong></div>
      <b><i style={{ width: `${value}%` }}></i></b>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  icon,
  tone,
  trend,
  emphasis = false,
}: {
  label: string;
  value: number | string;
  note: string;
  icon: IconName;
  tone: string;
  trend: string;
  emphasis?: boolean;
}) {
  return (
    <article className={cx("stat-card", `tone-${tone}`, emphasis && "primary-stat")}>
      <div className={cx("stat-icon", tone)}><Icon name={icon} size={18} /></div>
      <div className="stat-top"><span>{label}</span><small>{trend}</small></div>
      <strong className="stat-value">{typeof value === "number" ? faNumber(value) : value}</strong>
      <p>{note}</p>
    </article>
  );
}

function PanelHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="panel-header">
      <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
      {action}
    </div>
  );
}

function BugsPage({
  bugs,
  services,
  users,
  assignees,
  adaptiveTables,
  canEdit,
  onSelectBug,
  onQuickUpdate,
}: {
  bugs: Row[];
  services: Row[];
  users: Row[];
  assignees: Row[];
  adaptiveTables: boolean;
  canEdit: boolean;
  onSelectBug: (id: number) => void;
  onQuickUpdate: (id: number, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [priority, setPriority] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [service, setService] = useState("ALL");
  const [owner, setOwner] = useState("ALL");
  const [attention, setAttention] = useState("ALL");
  const [sort, setSort] = useState("NEWEST_REGISTERED");
  const [showResolved, setShowResolved] = useState(false);
  const [datePreset, setDatePreset] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dateMatches = (bug: Row) => {
    const registeredAt = new Date(String(bug.created_at)).getTime();
    if (datePreset === "TODAY") return registeredAt >= dayStart.getTime();
    if (datePreset === "7" || datePreset === "30" || datePreset === "90") {
      return registeredAt >= pageLoadedAt - Number(datePreset) * 86_400_000;
    }
    if (datePreset === "CUSTOM") {
      const from = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const to = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
      return from <= to && registeredAt >= from && registeredAt <= to;
    }
    return true;
  };
  const attentionMatches = (bug: Row) => {
    const isOpen = !["RESOLVED", "CLOSED"].includes(String(bug.status));
    if (attention === "OPEN") return isOpen;
    if (attention === "P1") return isOpen && bug.priority === "P1";
    if (attention === "OVERDUE") return isOpen && isPast(bug.next_follow_up_at);
    if (attention === "UNASSIGNED") {
      return isOpen && !bug.owner_id && !bugAssignees(assignees, bug.id).length;
    }
    if (attention === "STALE") {
      return isOpen && pageLoadedAt - new Date(String(bug.updated_at)).getTime() > 48 * 60 * 60 * 1000;
    }
    return true;
  };
  const shown = [...bugs.filter((bug) =>
    (priority === "ALL" || bug.priority === priority) &&
    (status === "ALL" || bug.status === status) &&
    (service === "ALL" || String(bug.service_id) === service) &&
    (owner === "ALL" || bugAssignees(assignees, bug.id).some((item) => String(item.user_id) === owner)) &&
    dateMatches(bug) &&
    attentionMatches(bug) &&
    (showResolved || !["RESOLVED", "CLOSED"].includes(String(bug.status))),
  )].sort((a, b) => {
    if (sort === "NEWEST_REGISTERED") return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
    if (sort === "LATEST_UPDATED") return new Date(String(b.updated_at)).getTime() - new Date(String(a.updated_at)).getTime();
    if (sort === "OLDEST_REGISTERED") return new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime();
    if (sort === "SERVICE") return String(a.service_label).localeCompare(String(b.service_label), "fa");
    return ["P1", "P2", "P3", "P4"].indexOf(String(a.priority)) - ["P1", "P2", "P3", "P4"].indexOf(String(b.priority));
  });

  const activeFilterCount = [
    priority !== "ALL",
    status !== "ALL",
    service !== "ALL",
    owner !== "ALL",
    attention !== "ALL",
    datePreset !== "ALL",
  ].filter(Boolean).length;
  const resetFilters = () => {
    setPriority("ALL");
    setStatus("ALL");
    setService("ALL");
    setOwner("ALL");
    setAttention("ALL");
    setSort("NEWEST_REGISTERED");
    setShowResolved(false);
    setDatePreset("ALL");
    setDateFrom("");
    setDateTo("");
  };
  const exportRows = shown.map((bug) => ({
    bugCode: String(bug.bug_code),
    registeredAt: String(bug.created_at),
    registeredAtPersian: formatDate(bug.created_at, true),
    title: String(bug.title),
    service: String(bug.service_label),
    priority: String(bug.priority),
    status: statusLabels[String(bug.status)] ?? String(bug.status),
    assignees: bugAssignees(assignees, bug.id).map((item) => String(item.full_name)).join("، ") || String(bug.owner_name),
    source: sourceLabels[String(bug.source)] ?? String(bug.source),
    occurrenceCount: Number(bug.occurrence_count),
    lastSeenAt: String(bug.last_seen_at ?? ""),
    nextFollowUpAt: String(bug.next_follow_up_at ?? ""),
  }));
  const exportCsv = () => {
    const headers = ["شناسه", "تاریخ ثبت", "موضوع", "سرویس", "اولویت", "وضعیت", "مسئولان", "منبع", "تعداد رخداد", "آخرین مشاهده", "پیگیری بعدی"];
    const lines = exportRows.map((row) => [
      row.bugCode, row.registeredAtPersian, row.title, row.service, row.priority,
      row.status, row.assignees, row.source, row.occurrenceCount,
      formatDate(row.lastSeenAt, true), formatDate(row.nextFollowUpAt, true),
    ].map(csvCell).join(","));
    downloadTextFile(
      `incident-report-${new Date().toISOString().slice(0, 10)}.csv`,
      `\uFEFF${headers.map(csvCell).join(",")}\n${lines.join("\n")}`,
      "text/csv;charset=utf-8",
    );
  };
  const exportJson = () => {
    downloadTextFile(
      `incident-report-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), count: exportRows.length, incidents: exportRows }, null, 2),
      "application/json;charset=utf-8",
    );
  };

  const openIncidentCount = bugs.filter((bug) => !["RESOLVED", "CLOSED"].includes(String(bug.status))).length;
  const p1IncidentCount = bugs.filter((bug) => !["RESOLVED", "CLOSED"].includes(String(bug.status)) && String(bug.priority) === "P1").length;
  const waitingIncidentCount = bugs.filter((bug) => !["RESOLVED", "CLOSED"].includes(String(bug.status)) && String(bug.status) === "WAITING").length;
  const overdueIncidentCount = bugs.filter((bug) => !["RESOLVED", "CLOSED"].includes(String(bug.status)) && isPast(bug.next_follow_up_at)).length;
  const unassignedIncidentCount = bugs.filter((bug) =>
    !["RESOLVED", "CLOSED"].includes(String(bug.status)) &&
    !bug.owner_id &&
    !bugAssignees(assignees, bug.id).length
  ).length;

  const quickFilters = [
    { key: "OPEN", label: "خطاهای باز", count: openIncidentCount, icon: "incident" as IconName, tone: "open" },
    { key: "P1", label: "P1 فوری", count: p1IncidentCount, icon: "alert" as IconName, tone: "danger" },
    { key: "WAITING", label: "منتظر پاسخ", count: waitingIncidentCount, icon: "waiting" as IconName, tone: "waiting" },
    { key: "OVERDUE", label: "پیگیری عقب‌افتاده", count: overdueIncidentCount, icon: "clock" as IconName, tone: "overdue" },
    { key: "UNASSIGNED", label: "بدون مسئول", count: unassignedIncidentCount, icon: "users" as IconName, tone: "neutral" },
  ];

  return (
    <section className="panel page-panel">
      <div className="filterbar professional-filterbar">
        <div className="filterbar-title">
          <div><strong>فیلتر و پایش خطاها</strong><span>موارد مهم را سریع محدود کن؛ گزینه‌های تکمیلی داخل «فیلترهای بیشتر» قرار دارند.</span></div>
          <div className="filterbar-actions">
            <button className="export-button" title="دریافت خروجی CSV" onClick={exportCsv}>CSV</button>
            <button className="export-button" title="دریافت خروجی JSON" onClick={exportJson}>JSON</button>
          </div>
        </div>
        <div className="incident-filter-rail" role="group" aria-label="فیلترهای سریع خطا">
          {quickFilters.map((item) => {
            const selected = item.key === "WAITING" ? status === "WAITING" : attention === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={cx("incident-filter-chip", `tone-${item.tone}`, selected && "active")}
                aria-pressed={selected}
                onClick={() => {
                  if (item.key === "WAITING") {
                    setStatus(selected ? "ALL" : "WAITING");
                    if (!selected) setAttention("ALL");
                  } else {
                    setAttention(selected ? "ALL" : item.key);
                    if (!selected) setStatus("ALL");
                  }
                }}
              >
                <span className="incident-filter-icon"><Icon name={item.icon} size={15} /></span>
                <span className="incident-filter-copy"><b>{item.label}</b></span>
                <strong>{faNumber(item.count)}</strong>
              </button>
            );
          })}
        </div>
        <div className="incident-filter-toolbar">
          <div className="filter-primary-line">
            <label className="filter-control"><span>وضعیت</span><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="فیلتر وضعیت">
              <option value="ALL">همه وضعیت‌ها</option>
              {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label className="filter-control"><span>سرویس</span><select aria-label="فیلتر سرویس" value={service} onChange={(event) => setService(event.target.value)}>
              <option value="ALL">همه سرویس‌ها</option>
              {services.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.path)}</option>)}
            </select></label>
            <label className="filter-control sort-control"><span>مرتب‌سازی</span><select aria-label="مرتب‌سازی" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="NEWEST_REGISTERED">جدیدترین ثبت</option>
              <option value="LATEST_UPDATED">آخرین تغییر</option>
              <option value="PRIORITY">اولویت</option>
              <option value="OLDEST_REGISTERED">قدیمی‌ترین ثبت</option>
              <option value="SERVICE">نام سرویس</option>
            </select></label>
            <button type="button" className={cx("advanced-filter-toggle", filtersExpanded && "active")} aria-expanded={filtersExpanded} onClick={() => setFiltersExpanded((value) => !value)}>
              <Icon name="filter" size={16} />
              <span>فیلترهای بیشتر</span>
              {activeFilterCount > 0 && <b>{faNumber(activeFilterCount)}</b>}
            </button>
            {activeFilterCount > 0 && <button type="button" className="filter-reset-compact" onClick={resetFilters}>پاک‌کردن</button>}
          </div>
          {filtersExpanded && (
            <div className="filter-group advanced-filters">
              <label className="filter-control"><span>مسئول</span><select aria-label="فیلتر مسئول" value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="ALL">همه مسئولان</option>
                {users.map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.full_name)}</option>)}
              </select></label>
              <label className="filter-control"><span>اولویت</span><select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="فیلتر اولویت">
                <option value="ALL">همه اولویت‌ها</option>
                <option>P1</option><option>P2</option><option>P3</option><option>P4</option>
              </select></label>
              <label className="filter-control"><span>نیازمند اقدام</span><select aria-label="فیلتر نیازمند اقدام" value={attention} onChange={(event) => setAttention(event.target.value)}>
                <option value="ALL">همه موارد</option>
                <option value="OPEN">فقط موارد باز</option>
                <option value="P1">P1 باز</option>
                <option value="OVERDUE">پیگیری عقب‌افتاده</option>
                <option value="UNASSIGNED">بدون مسئول</option>
                <option value="STALE">بدون تغییر بیش از ۴۸ ساعت</option>
              </select></label>
              <label className="filter-control"><span>تاریخ ثبت</span><select aria-label="بازه تاریخ ثبت" value={datePreset} onChange={(event) => setDatePreset(event.target.value)}>
                <option value="ALL">همه تاریخ‌ها</option>
                <option value="TODAY">امروز</option>
                <option value="7">۷ روز اخیر</option>
                <option value="30">۳۰ روز اخیر</option>
                <option value="90">۹۰ روز اخیر</option>
                <option value="CUSTOM">بازه دلخواه...</option>
              </select></label>
              <label className="filter-check compact-check"><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} /><span>نمایش رفع‌شده‌ها</span></label>
            </div>
          )}
        </div>
        {datePreset === "CUSTOM" && (
          <div className="custom-date-filter-panel">
            <div className="custom-date-heading"><span>بازه دلخواه تاریخ ثبت</span><small>تاریخ شروع و پایان را مشخص کنید؛ هر دو اختیاری هستند.</small></div>
            <label><span>از تاریخ ثبت</span><input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /><small>{dateFrom ? formatDate(`${dateFrom}T00:00:00`) : "از اولین رکورد"}</small></label>
            <span className="date-range-arrow">←</span>
            <label><span>تا تاریخ ثبت</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /><small>{dateTo ? formatDate(`${dateTo}T00:00:00`) : "تا امروز"}</small></label>
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}>پاک‌کردن تاریخ‌ها</button>
          </div>
        )}
        <div className="filterbar-summary">
          <div className="result-count"><strong>{faNumber(shown.length)}</strong> رکورد{canEdit ? " · وضعیت و اولویت از جدول قابل تغییر است" : ""}</div>
          <div className="active-filter-summary">
            {activeFilterCount > 0 ? <span>{faNumber(activeFilterCount)} فیلتر فعال</span> : <span>بدون فیلتر اضافی</span>}
            {activeFilterCount > 0 && <button onClick={resetFilters}>پاک‌کردن همه فیلترها</button>}
          </div>
        </div>
      </div>
      <BugTable bugs={shown} assignees={assignees} adaptiveColumns={adaptiveTables} onSelect={onSelectBug} onQuickUpdate={canEdit ? onQuickUpdate : undefined} />
    </section>
  );
}

function BugTable({
  bugs,
  assignees,
  onSelect,
  compact = false,
  adaptiveColumns = false,
  onQuickUpdate,
}: {
  bugs: Row[];
  assignees: Row[];
  onSelect: (id: number) => void;
  compact?: boolean;
  adaptiveColumns?: boolean;
  onQuickUpdate?: (id: number, payload: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <div className={cx("table-wrap", "unified-records", compact && "compact-records")}>
      <table className="bug-table modern-record-table">
        <thead>
          <tr>
            <th>شناسه و موضوع</th>
            <th>سرویس</th>
            <th className="priority-col">اولویت</th>
            <th className="status-col">وضعیت</th>
            {!compact && <th>مسئول</th>}
            <th>پیگیری بعدی</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bugs.map((bug, index) => {
            const owners = bugAssignees(assignees, bug.id);
            const isOpen = !["CLOSED", "RESOLVED"].includes(String(bug.status));
            return (
            <tr
              className={cx("bug-row", isOpen && "is-open", `status-row-${String(bug.status).toLowerCase()}`, `priority-row-${String(bug.priority).toLowerCase()}`)}
              key={String(bug.id)}
              tabIndex={0}
              aria-label={`${String(bug.bug_code)} - ${String(bug.title)}`}
              style={{ animationDelay: `${Math.min(index, 12) * 26}ms` }}
              onClick={() => onSelect(Number(bug.id))}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(Number(bug.id));
                }
              }}
            >
              <td data-label="خطا" className="incident-record-main">
                <div className="bug-code-line">
                  <span className="bug-code">{String(bug.bug_code)}</span>
                  {isOpen && <span className="open-state-pill"><Icon name="activity" size={12} /><i></i>باز</span>}
                </div>
                <strong className="bug-title">{String(bug.title)}</strong>
                {adaptiveColumns && <div className="bug-observation-summary"><span>ثبت {formatDate(bug.created_at)}</span><span>آخرین مشاهده {formatRelativeDate(bug.last_seen_at)}</span><b>{faNumber(bug.occurrence_count)} بار</b><em>{sourceLabels[String(bug.source)] ?? String(bug.source)}</em></div>}
              </td>
              <td data-label="سرویس" className="service-record-cell"><span className="service-path">{String(bug.service_label).replace("ELK > ", "")}</span></td>
              <td data-label="اولویت" className={cx("priority-cell", `priority-${String(bug.priority).toLowerCase()}`)}>{onQuickUpdate ? (
                <select
                  className={cx("inline-select", `priority-${String(bug.priority).toLowerCase()}`)}
                  value={String(bug.priority)}
                  aria-label={`اولویت ${String(bug.bug_code)}`}
                  title="تغییر اولویت"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => void onQuickUpdate(Number(bug.id), { priority: event.target.value })}
                ><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select>
              ) : <PriorityBadge value={String(bug.priority)} />}</td>
              <td data-label="وضعیت" className={cx("status-cell", `status-${String(bug.status).toLowerCase()}`)}>{onQuickUpdate ? (
                <select
                  className={cx("inline-select", "status", `status-${String(bug.status).toLowerCase()}`)}
                  value={String(bug.status)}
                  aria-label={`وضعیت ${String(bug.bug_code)}`}
                  title="تغییر وضعیت"
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => void onQuickUpdate(Number(bug.id), { status: event.target.value })}
                >{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              ) : <StatusBadge value={String(bug.status)} />}</td>
              {!compact && <td data-label="مسئول" className="assignee-record-cell"><AssigneeSummary owners={owners} fallback={String(bug.owner_name)} /></td>}
              <td data-label="پیگیری بعدی"><TableDate value={bug.next_follow_up_at} late={isPast(bug.next_follow_up_at)} emptyLabel="بدون موعد" /></td>
              <td className="row-menu-cell"><button className="row-action" aria-label="مشاهده جزئیات" title="باز کردن جزئیات"><Icon name="arrowLeft" size={16} /></button></td>
            </tr>
          );})}
          {!bugs.length && <tr><td colSpan={compact ? 6 : 7}><EmptyState title="رکوردی پیدا نشد" text="فیلتر یا عبارت جست‌وجو را تغییر دهید." /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function TableDate({ value, late = false, emptyLabel = "—" }: { value: unknown; late?: boolean; emptyLabel?: string }) {
  if (!value) return <span className="table-date-cell empty">{emptyLabel}</span>;
  return <span className={cx("table-date-cell", late && "late")}><strong>{formatDate(value, true)}</strong><small>{formatRelativeDate(value)}</small></span>;
}

function AssigneeSummary({ owners, fallback }: { owners: Row[]; fallback: string }) {
  if (!owners.length) return <div className="person-cell"><Avatar name={fallback} /><span>{fallback}</span></div>;
  return (
    <div className="assignee-summary" title={owners.map((owner) => String(owner.full_name)).join("، ")}>
      <div className="avatar-stack">{owners.slice(0, 3).map((owner) => <Avatar key={String(owner.user_id)} name={String(owner.full_name)} />)}</div>
      <span>{String(owners[0].full_name)}{owners.length > 1 ? ` +${faNumber(owners.length - 1)}` : ""}</span>
    </div>
  );
}

function PriorityBadge({ value }: { value: string }) {
  return <span className={cx("priority-badge", value.toLowerCase())}><i></i>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={cx("status-badge", value.toLowerCase())}>{statusLabels[value] ?? value}</span>;
}

function Avatar({ name }: { name: string }) {
  const initials = name === "تعیین نشده" ? "؟" : name.split(" ").slice(0, 2).map((part) => part[0]).join("");
  return <span className="mini-avatar">{initials}</span>;
}

function AssigneePicker({
  users,
  selectedIds,
  onChange,
  compact = false,
}: {
  users: Row[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visibleUsers = users.filter((user) =>
    (Number(user.is_active) !== 0 || selectedIds.includes(String(user.id))) &&
    [user.full_name, user.team, user.email].some((value) => String(value ?? "").toLowerCase().includes(query.trim().toLowerCase())),
  );
  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
  };
  return (
    <div className={cx("assignee-picker", compact && "compact")}>
      <div className="assignee-picker-head">
        <div><strong>مسئولان پیگیری</strong><span>{selectedIds.length ? `${faNumber(selectedIds.length)} نفر انتخاب شده` : "بدون مسئول"}</span></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام یا تیم..." />
      </div>
      {selectedIds.length > 0 && (
        <div className="selected-assignees">
          {selectedIds.map((id) => {
            const user = users.find((item) => String(item.id) === id);
            return user ? <button type="button" key={id} onClick={() => toggle(id)} title="حذف از مسئولان این خطا"><span>{String(user.full_name)}</span><b>× حذف</b></button> : null;
          })}
        </div>
      )}
      <div className="assignee-options">
        {visibleUsers.map((user) => {
          const id = String(user.id);
          const selected = selectedIds.includes(id);
          return (
            <button type="button" className={selected ? "selected" : ""} key={id} onClick={() => toggle(id)}>
              <Avatar name={String(user.full_name)} />
              <span><strong>{String(user.full_name)}</strong><small>{String(user.team)}</small></span>
              <i>{selected ? "✓" : "＋"}</i>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FollowupsPage({
  followUps,
  bugs,
  canEdit,
  appSettings,
  onChanged,
  onOpenBug,
}: {
  followUps: Row[];
  bugs: Row[];
  canEdit: boolean;
  appSettings: AppSettings;
  onChanged: (message: string) => Promise<void>;
  onOpenBug: (id: number) => void;
}) {
  const [view, setView] = useState<"OVERDUE" | "TODAY" | "UPCOMING" | "DONE" | "ALL">("OVERDUE");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [action, setAction] = useState<{ mode: "COMPLETE" | "RESCHEDULE"; item: Row } | null>(null);
  const scheduled = followUps.filter((item) => item.status === "SCHEDULED");
  const done = followUps.filter((item) => item.status === "DONE");
  const cancelled = followUps.filter((item) => item.status === "CANCELLED");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const overdue = scheduled.filter((item) => new Date(String(item.scheduled_at)).getTime() < todayStart.getTime());
  const today = scheduled.filter((item) => {
    const time = new Date(String(item.scheduled_at)).getTime();
    return time >= todayStart.getTime() && time < tomorrowStart.getTime();
  });
  const upcoming = scheduled.filter((item) => new Date(String(item.scheduled_at)).getTime() >= tomorrowStart.getTime());
  const owners = [...new Set(followUps.map((item) => String(item.owner_name)).filter(Boolean))].sort();
  const types = [...new Set([...appSettings.followups.types, ...followUps.map((item) => String(item.type)).filter(Boolean)])];

  const baseItems = view === "OVERDUE" ? overdue
    : view === "TODAY" ? today
      : view === "UPCOMING" ? upcoming
        : view === "DONE" ? [...done, ...cancelled]
          : followUps;
  const needle = query.trim().toLowerCase();
  const shown = baseItems.filter((item) => {
    const bug = bugs.find((entry) => Number(entry.id) === Number(item.bug_id));
    return (typeFilter === "ALL" || String(item.type) === typeFilter)
      && (ownerFilter === "ALL" || String(item.owner_name) === ownerFilter)
      && (!needle || [item.type, item.next_action, item.result, item.owner_name, bug?.bug_code, bug?.title]
        .some((value) => String(value ?? "").toLowerCase().includes(needle)));
  });

  const complete = async (item: Row, payload: { result: string; nextAction: string; scheduleNextAt: string }) => {
    await api(`/api/followups/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        action: "COMPLETE",
        result: payload.result,
        nextAction: payload.nextAction,
        nextScheduledAt: payload.scheduleNextAt ? new Date(payload.scheduleNextAt).toISOString() : "",
        nextType: String(item.type || appSettings.followups.defaultType),
        nextOwnerName: String(item.owner_name),
      }),
    });
    setAction(null);
    await onChanged(payload.scheduleNextAt ? "نتیجه ثبت و پیگیری بعدی برنامه‌ریزی شد." : "نتیجه پیگیری ثبت شد.");
  };

  const reschedule = async (item: Row, payload: { scheduledAt: string; ownerName: string; type: string; nextAction: string }) => {
    await api(`/api/followups/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        action: "RESCHEDULE",
        scheduledAt: new Date(payload.scheduledAt).toISOString(),
        ownerName: payload.ownerName,
        type: payload.type,
        nextAction: payload.nextAction,
      }),
    });
    setAction(null);
    await onChanged("زمان و جزئیات پیگیری به‌روزرسانی شد.");
  };

  const cancel = async (item: Row) => {
    const reason = window.prompt("دلیل لغو این پیگیری را بنویسید:", "این پیگیری دیگر نیاز نیست.");
    if (reason === null) return;
    await api(`/api/followups/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "CANCEL", result: reason }),
    });
    await onChanged("پیگیری لغو شد و در سابقه باقی ماند.");
  };

  return (
    <div className="followup-page">
      <section className="followup-summary-grid">
        <button className={cx("followup-summary-card overdue", view === "OVERDUE" && "active")} onClick={() => setView("OVERDUE")}><span>عقب‌افتاده</span><strong>{faNumber(overdue.length)}</strong><small>موعد گذشته و نتیجه ثبت نشده</small></button>
        <button className={cx("followup-summary-card today", view === "TODAY" && "active")} onClick={() => setView("TODAY")}><span>امروز</span><strong>{faNumber(today.length)}</strong><small>اقدام‌هایی که امروز موعد دارند</small></button>
        <button className={cx("followup-summary-card upcoming", view === "UPCOMING" && "active")} onClick={() => setView("UPCOMING")}><span>آینده</span><strong>{faNumber(upcoming.length)}</strong><small>پیگیری‌های برنامه‌ریزی‌شده بعدی</small></button>
        <button className={cx("followup-summary-card done", view === "DONE" && "active")} onClick={() => setView("DONE")}><span>انجام‌شده</span><strong>{faNumber(done.length)}</strong><small>{faNumber(cancelled.length)} مورد لغوشده</small></button>
      </section>

      <section className="panel followup-workspace">
        <PanelHeader title="صف پیگیری" subtitle="موعد، مسئول، اقدام بعدی و نتیجه هر پیگیری در یک نما" />
        <div className="followup-toolbar">
          <label className="followup-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی شناسه، موضوع، مسئول یا اقدام..." /></label>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">همه نوع‌ها</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option value="ALL">همه مسئولان</option>{owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}</select>
          <button className={cx("secondary-button", view === "ALL" && "active")} onClick={() => setView("ALL")}>نمایش همه</button>
        </div>
        <div className="followup-board">
          {shown.map((item) => {
            const bug = bugs.find((entry) => Number(entry.id) === Number(item.bug_id));
            const late = item.status === "SCHEDULED" && isPast(item.scheduled_at);
            const isDone = item.status === "DONE";
            const isCancelled = item.status === "CANCELLED";
            return (
              <article className={cx("followup-card-pro", late && "late", isDone && "completed", isCancelled && "cancelled")} key={String(item.id)}>
                <div className="followup-card-head">
                  <div><span className={cx("followup-state", late && "late", isDone && "done", isCancelled && "cancelled")}>{isCancelled ? "لغوشده" : isDone ? "انجام‌شده" : late ? "عقب‌افتاده" : "برنامه‌ریزی‌شده"}</span><strong>{String(item.type)}</strong></div>
                  <DateBlock value={item.status === "SCHEDULED" ? item.scheduled_at : item.completed_at} late={late} />
                </div>
                <button className="followup-bug-link" onClick={() => bug && onOpenBug(Number(bug.id))}><span>{String(bug?.bug_code ?? "بدون شناسه")}</span><strong>{String(bug?.title ?? "خطای مرتبط")}</strong></button>
                <div className="followup-next-action"><span>{isDone || isCancelled ? "نتیجه" : "اقدام بعدی"}</span><p>{String((isDone || isCancelled ? item.result : item.next_action) || "هنوز توضیحی ثبت نشده است.")}</p></div>
                <div className="followup-card-footer"><div className="task-owner"><span className="task-owner-badge" aria-hidden="true"><Icon name="person" size={14} /></span><Avatar name={String(item.owner_name)} /><span><small>مسئول پیگیری</small>{String(item.owner_name)}</span></div>{bug && <PriorityBadge value={String(bug.priority ?? "P3")} />}</div>
                {canEdit && item.status === "SCHEDULED" && (
                  <div className="followup-actions">
                    <button className="primary-button small" onClick={() => setAction({ mode: "COMPLETE", item })}>ثبت نتیجه</button>
                    <button onClick={() => setAction({ mode: "RESCHEDULE", item })}>تغییر زمان</button>
                    <button className="danger-text" onClick={() => void cancel(item)}>لغو</button>
                  </div>
                )}
              </article>
            );
          })}
          {!shown.length && <EmptyState title="موردی در این نما وجود ندارد" text="فیلترها را تغییر دهید یا یک پیگیری جدید برای خطای باز ثبت کنید." />}
        </div>
      </section>

      {action?.mode === "COMPLETE" && (
        <ModalShell title="ثبت نتیجه پیگیری" subtitle={`${String(action.item.type)} · ${String(action.item.owner_name)}`} onClose={() => setAction(null)}>
          <CompleteFollowup settings={appSettings} onCancel={() => setAction(null)} onSubmit={(payload) => complete(action.item, payload)} />
        </ModalShell>
      )}
      {action?.mode === "RESCHEDULE" && (
        <ModalShell title="تنظیم مجدد پیگیری" subtitle="زمان، مسئول و اقدام بعدی را دقیق ثبت کنید" onClose={() => setAction(null)}>
          <RescheduleFollowup item={action.item} types={types} onCancel={() => setAction(null)} onSubmit={(payload) => reschedule(action.item, payload)} />
        </ModalShell>
      )}
    </div>
  );
}

function DateBlock({ value, late = false }: { value: unknown; late?: boolean }) {
  return (
    <div className={cx("date-block", late && "late")}>
      <strong>{formatDate(value, true)}</strong>
      <small>{formatRelativeDate(value)}</small>
    </div>
  );
}

function CompleteFollowup({
  settings,
  onCancel,
  onSubmit,
}: {
  settings: AppSettings;
  onCancel: () => void;
  onSubmit: (payload: { result: string; nextAction: string; scheduleNextAt: string }) => Promise<void>;
}) {
  const [result, setResult] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const [scheduleNextAt, setScheduleNextAt] = useState(() => toDateTimeLocal(new Date(Date.now() + settings.followups.nextDelayHours * 3_600_000).toISOString()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (settings.followups.requireResult && !result.trim()) {
      setError("ثبت نتیجه برای تکمیل پیگیری الزامی است.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit({ result: result.trim() || "پیگیری انجام شد.", nextAction: nextAction.trim(), scheduleNextAt: scheduleNext ? scheduleNextAt : "" });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="followup-action-form">
      <label><span>نتیجه پیگیری</span><textarea rows={5} value={result} onChange={(event) => setResult(event.target.value)} placeholder="چه چیزی بررسی شد و نتیجه چه بود؟" autoFocus /></label>
      <label><span>اقدام بعدی یا نکته باقی‌مانده</span><textarea rows={3} value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="در صورت نیاز، اقدام بعدی را روشن و قابل انجام بنویسید." /></label>
      <label className="followup-next-toggle"><input type="checkbox" checked={scheduleNext} onChange={(event) => setScheduleNext(event.target.checked)} /><span>بعد از ثبت نتیجه، یک پیگیری دیگر بساز</span></label>
      {scheduleNext && <label><span>موعد پیگیری بعدی</span><input type="datetime-local" value={scheduleNextAt} onChange={(event) => setScheduleNextAt(event.target.value)} /><small>{formatDate(scheduleNextAt, true)} · {formatRelativeDate(scheduleNextAt)}</small></label>}
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions"><button onClick={onCancel}>انصراف</button><button className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? "در حال ثبت..." : "ثبت نتیجه"}</button></div>
    </div>
  );
}

function RescheduleFollowup({
  item,
  types,
  onCancel,
  onSubmit,
}: {
  item: Row;
  types: string[];
  onCancel: () => void;
  onSubmit: (payload: { scheduledAt: string; ownerName: string; type: string; nextAction: string }) => Promise<void>;
}) {
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(item.scheduled_at));
  const [ownerName, setOwnerName] = useState(String(item.owner_name));
  const [type, setType] = useState(String(item.type));
  const [nextAction, setNextAction] = useState(String(item.next_action ?? ""));
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!scheduledAt || !ownerName.trim()) return;
    setSaving(true);
    try { await onSubmit({ scheduledAt, ownerName: ownerName.trim(), type, nextAction: nextAction.trim() }); } finally { setSaving(false); }
  };
  return (
    <div className="followup-action-form">
      <div className="form-grid two-cols">
        <label><span>نوع پیگیری</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>مسئول</span><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} /></label>
        <label className="full"><span>زمان جدید</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /><small>{formatDate(scheduledAt, true)} · {formatRelativeDate(scheduledAt)}</small></label>
        <label className="full"><span>اقدام بعدی</span><textarea rows={4} value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label>
      </div>
      <div className="modal-actions"><button onClick={onCancel}>انصراف</button><button className="primary-button" disabled={saving || !scheduledAt || !ownerName.trim()} onClick={() => void submit()}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button></div>
    </div>
  );
}

function ServicesPage({ services, canManage, onNew, onUpdated }: { services: Row[]; canManage: boolean; onNew: () => void; onUpdated: () => Promise<void> }) {
  const [editing, setEditing] = useState<Row | null>(null);
  return (
    <>
      <section className="panel page-panel">
        <PanelHeader title="سرویس‌های ثبت‌شده" subtitle={`${faNumber(services.filter((item) => Number(item.is_active) !== 0).length)} سرویس فعال · مرتب‌شده براساس نام`} action={canManage ? <button className="secondary-button" onClick={onNew}>＋ افزودن سرویس</button> : undefined} />
        <div className="catalog-grid">
          {services.map((service) => (
            <article className={cx("catalog-card", Number(service.is_active) === 0 && "inactive")} key={String(service.id)}>
              <div className="catalog-head"><div className="catalog-icon">{String(service.code).slice(0, 2)}</div><span className="active-label"><i></i>{Number(service.is_active) === 0 ? "غیرفعال" : "فعال"}</span></div>
              <h3>{String(service.name)}</h3>
              <code>{String(service.path)}</code>
              <dl><div><dt>تیم مالک</dt><dd>{String(service.team)}</dd></div><div><dt>ایمیل هشدار</dt><dd>{String(service.alert_email || "تنظیم نشده")}</dd></div></dl>
              {canManage && <button className="card-edit-button" onClick={() => setEditing(service)}>ویرایش سرویس</button>}
            </article>
          ))}
        </div>
      </section>
      {canManage && editing && <EditServiceModal service={editing} onClose={() => setEditing(null)} onUpdated={async () => { setEditing(null); await onUpdated(); }} />}
    </>
  );
}

function UsersPage({
  users,
  currentUserId,
  currentUserRole,
  onNew,
  onPassword,
  onUpdated,
}: {
  users: Row[];
  currentUserId: number;
  currentUserRole: CurrentUser["role"];
  onNew: () => void;
  onPassword: (user: Row) => void;
  onUpdated: () => Promise<void>;
}) {
  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "سوپر ادمین",
    ADMIN: "مدیر سامانه",
    OPERATOR: "کارشناس",
    VIEWER: "مشاهده‌گر",
  };
  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";
  const isAdmin = currentUserRole === "ADMIN";
  const [editing, setEditing] = useState<Row | null>(null);
  return (
    <>
      <section className="panel page-panel">
        <PanelHeader
          title="کاربران دارای دسترسی"
          subtitle={isSuperAdmin ? "سوپر ادمین مدیریت کامل حساب‌ها و رمزها را دارد. مدیر سامانه می‌تواند نقش کاربران عادی را مدیریت کند و هر کاربر فقط رمز خودش را تغییر می‌دهد." : isAdmin ? "مدیر سامانه می‌تواند نقش و وضعیت کاربران عادی را مدیریت کند؛ تغییر رمز دیگران فقط با سوپر ادمین است." : "هر کاربر فقط می‌تواند رمز عبور خودش را تغییر دهد."}
          action={isSuperAdmin ? <button className="secondary-button" onClick={onNew}>＋ افزودن کاربر</button> : undefined}
        />
        <div className="user-list">
          {users.map((user) => {
            const isSelf = Number(user.id) === currentUserId;
            const isProtectedSuperAdmin = String(user.role) === "SUPER_ADMIN";
            const canReset = isSelf || currentUserRole === "SUPER_ADMIN";
            const canManageRole = isSuperAdmin || (isAdmin && !isSelf && !isProtectedSuperAdmin);
            return (
              <article className={Number(user.is_active) === 0 ? "inactive" : ""} key={String(user.id)}>
                <Avatar name={String(user.full_name)} />
                <div><strong>{String(user.full_name)}</strong><span dir="ltr">@{String(user.username || "—")}</span><span>{String(user.email)}</span></div>
                <div className="user-team"><small>تیم</small><strong>{String(user.team)}</strong></div>
                <span className={cx("role-badge", String(user.role).toLowerCase())}>{roleLabels[String(user.role)] ?? String(user.role)}</span>
                <span className="active-label"><i></i>{Number(user.is_active) === 0 ? "غیرفعال" : "فعال"}</span>
                <div className="user-row-actions">
                  {canReset && <button className="card-edit-button" onClick={() => onPassword(user)}>{isSelf ? "تغییر رمز من" : "تغییر رمز"}</button>}
                  {canManageRole && <button className="card-edit-button" onClick={() => setEditing(user)}>{isSuperAdmin ? (isSelf ? "ویرایش حساب" : "ویرایش") : "مدیریت نقش"}</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {editing && <EditUserModal user={editing} isCurrentUser={Number(editing.id) === currentUserId} actorRole={currentUserRole} onClose={() => setEditing(null)} onUpdated={async () => { setEditing(null); await onUpdated(); }} />}
    </>
  );
}

function AuditPage({ logs }: { logs: Row[] }) {
  const [entity, setEntity] = useState("ALL");
  const [actor, setActor] = useState("ALL");
  const entityLabels: Record<string, string> = {
    BUG: "خطا",
    FOLLOW_UP: "پیگیری",
    EMAIL: "ایمیل",
    SERVICE: "سرویس",
    USER: "کاربر",
    SETTINGS: "تنظیمات",
  };
  const actionLabels: Record<string, string> = {
    CREATE: "ثبت",
    UPDATE: "ویرایش",
    COMPLETE: "ثبت نتیجه",
    DRAFT: "ذخیره پیش‌نویس",
    QUEUE: "ثبت در صف ارسال",
    DELETE: "حذف",
    CANCEL: "لغو",
    PROVISION_ADMIN: "ایجاد مدیر اولیه",
    PROMOTE_SUPER_ADMIN: "تعیین سوپر ادمین",
    PASSWORD_CHANGED: "تغییر رمز عبور",
    LOCAL_AUTH_BOOTSTRAP: "فعال‌سازی ورود محلی",
    PURGE_DEMO_USERS: "حذف حساب‌های آزمایشی",
  };
  const actors = [...new Set(logs.map((item) => String(item.actor)).filter(Boolean))];
  const shown = logs.filter((item) =>
    (entity === "ALL" || String(item.entity_type) === entity) &&
    (actor === "ALL" || String(item.actor) === actor),
  );
  return (
    <section className="panel page-panel">
      <PanelHeader title="سوابق تغییرات" subtitle="ثبت تغییرات اطلاعات، کاربران و پیگیری‌ها" />
      <div className="filterbar audit-filters">
        <div className="filter-group">
          <select value={entity} onChange={(event) => setEntity(event.target.value)} aria-label="نوع رکورد">
            <option value="ALL">همه بخش‌ها</option>
            {Object.entries(entityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select value={actor} onChange={(event) => setActor(event.target.value)} aria-label="تغییردهنده">
            <option value="ALL">همه کاربران</option>
            {actors.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="result-count"><strong>{faNumber(shown.length)}</strong> تغییر</div>
      </div>
      <div className="audit-list">
        {shown.map((log) => (
          <article key={String(log.id)}>
            <span className="audit-icon">{String(log.action) === "DELETE" ? "−" : String(log.action) === "CREATE" ? "+" : "↻"}</span>
            <div>
              <strong>{actionLabels[String(log.action)] ?? String(log.action)}</strong>
              <p>{entityLabels[String(log.entity_type)] ?? String(log.entity_type)} · شناسه {String(log.entity_id)}</p>
            </div>
            <div className="audit-actor"><span>{String(log.actor)}</span><small>{formatDate(log.created_at, true)}</small></div>
          </article>
        ))}
        {!shown.length && <EmptyState title="تغییری در این فیلتر ثبت نشده است" text="فیلتر بخش یا کاربر را تغییر دهید." />}
      </div>
    </section>
  );
}

function AutomationPage({ data }: { data: Snapshot }) {
  const rules = [
    { title: "ثبت هشدار ELK", text: "هشدار تازه با شناسه یکتا ثبت می‌شود", active: data.integrations.elk.status === "CONNECTED" },
    { title: "تشخیص هشدار تکراری", text: "هشدار همسان به رکورد باز قبلی اضافه می‌شود", active: data.integrations.elk.status === "CONNECTED" },
    { title: "اطلاع خطای P1", text: "ایمیل مدیر سرویس در صف ارسال قرار می‌گیرد", active: true },
    { title: "کنترل موعد پیگیری", text: "موارد موعددار و عقب‌افتاده مشخص می‌شوند", active: true },
    { title: "گزارش روزانه", text: "در این نسخه فعال نشده است", active: false },
  ];
  return (
    <div className="automation-layout">
      <section className="panel">
        <PanelHeader title="اتصال‌ها" subtitle="وضعیت کانال‌های ورودی و خروجی" />
        <div className="integration-list">
          <article>
            <div className="integration-logo elk">ELK</div>
            <div><strong>Elasticsearch / Kibana</strong><p>دریافت هشدار از Webhook و کنترل موارد تکراری</p><code>POST {data.integrations.elk.endpoint}</code></div>
            <span className={data.integrations.elk.status === "CONNECTED" ? "connected" : "needs-config"}><i></i>{data.integrations.elk.status === "CONNECTED" ? "متصل" : "نیازمند تنظیم"}</span>
          </article>
          <article>
            <div className="integration-logo mail">✉</div>
            <div><strong>ارسال ایمیل</strong><p>صف پیام، ثبت گیرندگان و مدیریت تلاش مجدد</p><code>EMAIL_WEBHOOK_URL</code></div>
            <span className={data.integrations.email.status === "CONNECTED" ? "connected" : "needs-config"}><i></i>{data.integrations.email.status === "CONNECTED" ? "متصل" : "نیازمند تنظیم"}</span>
          </article>
        </div>
      </section>
      <section className="panel">
        <PanelHeader title="قواعد ثبت و پیگیری" subtitle="وضعیت فعلی هر قاعده" />
        <div className="rule-list">
          {rules.map((rule) => (
            <article key={rule.title}><div><strong>{rule.title}</strong><p>{rule.text}</p></div><span className={cx("toggle", rule.active && "on")}><i></i></span></article>
          ))}
        </div>
      </section>
      <section className="panel email-log-panel">
        <PanelHeader title="صف و سابقه ایمیل" subtitle="آخرین پیش‌نویس‌ها و ارسال‌ها" />
        <div className="email-log">
          {data.emails.length ? data.emails.map((email) => (
            <article key={String(email.id)}>
              <span className="mail-icon">✉</span>
              <div><strong>{String(email.subject)}</strong><p>{String(email.recipient)}</p></div>
              <EmailStatus value={String(email.status)} />
              <small>{formatDate(email.created_at, true)}</small>
            </article>
          )) : <EmptyState title="صف ایمیل خالی است" text="با ارجاع یک خطا یا ثبت P1، پیام اینجا ساخته می‌شود." />}
        </div>
      </section>
      <section className="panel payload-panel">
        <PanelHeader title="نمونه Payload برای Kibana" subtitle="قابل استفاده در Webhook Connector" />
        <pre>{`{
  "alert_id": "{{alert.id}}",
  "title": "{{rule.name}}",
  "service": "ELK > Pay",
  "priority": "P1",
  "fingerprint": "{{rule.id}}:{{context.group}}",
  "message": "{{context.message}}",
  "dashboard_url": "{{context.link}}"
}`}</pre>
      </section>
    </div>
  );
}

function HelpPage({ settings, onNavigate }: { settings: AppSettings; onNavigate: (page: PageKey) => void }) {
  const [query, setQuery] = useState("");
  const sections = [
    {
      title: "شروع کار در چند دقیقه",
      keywords: "شروع ثبت خطا داشبورد",
      body: (
        <ol>
          <li>از بالای صفحه روی «ثبت خطا» بزنید و موضوع، سرویس، اولویت و زمان اولین مشاهده را وارد کنید.</li>
          <li>بعد از ثبت، خطا را باز کنید؛ مسئول، وضعیت و زمان پیگیری بعدی را مشخص کنید.</li>
          <li>برای مکاتبه، از تب «ساخت ایمیل» استفاده کنید. متن نهایی را قبل از ذخیره یا ارسال مرور کنید.</li>
          <li>نتیجه هر تماس یا بررسی را در بخش پیگیری ثبت کنید تا سابقه کار روشن بماند.</li>
        </ol>
      ),
    },
    {
      title: "معنی وضعیت‌ها",
      keywords: "وضعیت جدید پیگیری منتظر رفع بسته بازگشایی",
      body: (
        <div className="help-status-list">
          <p><StatusBadge value="NEW" /><span>مورد ثبت شده ولی هنوز بررسی عملی روی آن شروع نشده است.</span></p>
          <p><StatusBadge value="IN_PROGRESS" /><span>مسئول مشخص است و بررسی یا اقدام در جریان است.</span></p>
          <p><StatusBadge value="WAITING" /><span>ادامه کار به پاسخ تیم دیگر، مشتری یا تأمین‌کننده وابسته است.</span></p>
          <p><StatusBadge value="RESOLVED" /><span>مشکل برطرف شده و نتیجه اولیه تأیید شده است.</span></p>
          <p><StatusBadge value="CLOSED" /><span>پیگیری کامل شده، مستندات کافی است و کار پایان یافته است.</span></p>
          <p><StatusBadge value="REOPENED" /><span>مشکل بعد از رفع دوباره دیده شده و باید مجدد بررسی شود.</span></p>
        </div>
      ),
    },
    {
      title: "پیگیری خوب چه اطلاعاتی دارد؟",
      keywords: "پیگیری موعد مسئول نتیجه اقدام بعدی",
      body: (
        <div>
          <p>یک پیگیری خوب چهار بخش روشن دارد: مسئول، موعد، اقدام بعدی و نتیجه. عبارت‌های کلی مثل «بررسی شود» برای ادامه کار کافی نیستند.</p>
          <div className="help-example"><strong>نمونه مناسب</strong><p>تیم Rail لاگ‌های بازه ۲۰:۰۰ تا ۲۰:۳۰ را بررسی کند و علت خطای 500 در مسیر Search را تا فردا ساعت ۱۰ اعلام کند.</p></div>
          <p>اگر نتیجه نهایی نشده است، هنگام ثبت نتیجه گزینه ساخت پیگیری بعدی را فعال کنید تا موضوع از صف کار خارج نشود.</p>
        </div>
      ),
    },
    {
      title: "خواندن جدول خطاها",
      keywords: "جدول رنگ مشاهده تاریخ اولویت",
      body: (
        <div>
          <p>رنگ پس‌زمینه هر ردیف وضعیت را نشان می‌دهد و نوار کنار ردیف برای تفکیک سریع‌تر است. P1 و P2 با کنتراست بیشتری دیده می‌شوند.</p>
          <p>«اولین مشاهده» زمان شروع رخداد است، «آخرین مشاهده» آخرین زمانی است که دوباره دیده شده و «دفعات مشاهده» تعداد رخدادهای ثبت‌شده را نشان می‌دهد.</p>
          <p>برای تغییر سریع وضعیت یا اولویت، از فهرست داخل همان ردیف استفاده کنید؛ برای جزئیات کامل روی ردیف بزنید.</p>
        </div>
      ),
    },
    {
      title: "ثبت و استفاده از ایمیل",
      keywords: "ایمیل قالب endpoint rca",
      body: (
        <div>
          <p>قالب را براساس نوع رخداد انتخاب کنید. مسیرهای API، ساعت شروع، کد خطا و تعداد رخداد را در متن نگه دارید؛ این اطلاعات برای تیم فنی از توضیح کلی مفیدتر است.</p>
          <p>برای پیگیری مجدد، همان Bug ID را در موضوع نگه دارید تا مکاتبات در یک رشته قابل جست‌وجو باشند. بعد از رفع نیز درخواست علت اصلی و اقدام پیشگیرانه را فراموش نکنید.</p>
        </div>
      ),
    },
    {
      title: "تنظیم داشبورد و متن‌ها",
      keywords: "تنظیم عنوان برند ویجت رنگ",
      body: (
        <div>
          <p>ترتیب و مخفی‌کردن بخش‌های داشبورد برای همان مرورگر ذخیره می‌شود. مدیر سامانه می‌تواند نام سامانه، عنوان صفحه‌ها، عنوان ویجت‌ها و قواعد پیش‌فرض پیگیری را برای همه کاربران تغییر دهد.</p>
          <button className="secondary-button" onClick={() => onNavigate("settings")}>بازکردن تنظیمات</button>
        </div>
      ),
    },
    {
      title: "وقتی اطلاعات بارگذاری نمی‌شود",
      keywords: "خطا لود بارگذاری health 3000 3001",
      body: (
        <ol>
          <li>یک‌بار صفحه را با Ctrl+Shift+R تازه‌سازی کنید.</li>
          <li>در محیط اصلی آدرس <code>/api/health</code> را روی پورت 3000 بررسی کنید؛ در Dev از پورت 3001 استفاده می‌شود.</li>
          <li>اگر کد پیگیری خطا نمایش داده شد، همان کد را همراه ساعت وقوع برای مدیر سامانه بفرستید.</li>
          <li>در صورت کمبود فضای دیسک، قبل از هر Build یا انتشار فضا را آزاد کنید.</li>
        </ol>
      ),
    },
  ];
  const needle = query.trim().toLowerCase();
  const shown = sections.filter((section) => !needle || `${section.title} ${section.keywords}`.toLowerCase().includes(needle));
  return (
    <div className="help-page">
      <section className="help-hero panel">
        <div><span>راهنمای کار روزمره</span><h2>کار با سامانه، بدون حدس‌زدن</h2><p>این راهنما براساس روند واقعی ثبت خطا، مکاتبه و پیگیری نوشته شده است. هر بخش را می‌توانید مستقل بخوانید.</p></div>
        <label><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="مثلاً پیگیری، وضعیت یا ایمیل..." /></label>
      </section>
      <section className="help-grid">
        {shown.map((section) => <article className="panel help-card" key={section.title}><h3>{section.title}</h3>{section.body}</article>)}
        {!shown.length && <EmptyState title="مطلبی پیدا نشد" text="عبارت کوتاه‌تری جست‌وجو کنید." />}
      </section>
      <section className="panel help-contact"><div><strong>{settings.help.contactName}</strong><p>{settings.help.contactText}</p></div><button className="secondary-button" onClick={() => onNavigate("audit")}>مشاهده سوابق تغییرات</button></section>
    </div>
  );
}

function SettingsPage({
  preferences,
  appSettings,
  canManage,
  lastUpdatedAt,
  onChange,
  onSaveAppSettings,
  onRefresh,
}: {
  preferences: AppPreferences;
  appSettings: AppSettings;
  canManage: boolean;
  lastUpdatedAt: string;
  onChange: (value: AppPreferences) => void;
  onSaveAppSettings: (settings: AppSettings, successMessage?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const themes: { key: AppPreferences["theme"]; name: string; description: string; colors: string[] }[] = [
    { key: "forest", name: "Sage روشن", description: "خنثی، آرام و مناسب استفاده روزانه", colors: ["#10271e", "#16805a", "#f4f7f5"] },
    { key: "ocean", name: "Ocean روشن", description: "آبی خنثی برای مانیتورینگ و داده", colors: ["#0d2a3a", "#197da8", "#f3f7fa"] },
    { key: "violet", name: "Violet روشن", description: "تفکیک نرم پنل‌ها با Accent بنفش", colors: ["#2b2440", "#7259c7", "#f7f5fb"] },
    { key: "amber", name: "Sand روشن", description: "گرم، کم‌تنش و مناسب محیط اداری", colors: ["#34261d", "#ae672d", "#faf7f2"] },
    { key: "dark", name: "Obsidian Focus", description: "دارک یکدست با تفکیک واضح‌تر وضعیت‌ها، Accent فیروزه‌ای و تمرکز بیشتر روی Incident", colors: ["#0a0f16", "#2dd4bf", "#141d2a"] },
  ];
  const [draft, setDraft] = useState<AppSettings>(appSettings);
  const [typesText, setTypesText] = useState(appSettings.followups.types.join("\n"));
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraft(appSettings);
      setTypesText(appSettings.followups.types.join("\n"));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [appSettings]);
  const update = (patch: Partial<AppPreferences>) => onChange({ ...preferences, ...patch });
  const setPageText = (key: PageKey, field: "title" | "kicker", value: string) => setDraft((current) => ({
    ...current,
    pageTitles: { ...current.pageTitles, [key]: { ...current.pageTitles[key], [field]: value } },
  }));
  const saveGlobal = async () => {
    const types = [...new Set(typesText.split(/\r?\n|،|,/).map((item) => item.trim()).filter(Boolean))];
    const next = {
      ...draft,
      followups: {
        ...draft.followups,
        types: types.length ? types : DEFAULT_APP_SETTINGS.followups.types,
        defaultType: types.includes(draft.followups.defaultType) ? draft.followups.defaultType : (types[0] || DEFAULT_APP_SETTINGS.followups.defaultType),
      },
    };
    setSaving(true);
    try { await onSaveAppSettings(next); } finally { setSaving(false); }
  };
  return (
    <div className="settings-layout professional-settings">
      <section className="panel settings-panel">
        <PanelHeader title="ظاهر شخصی" subtitle="این گزینه‌ها فقط در همین مرورگر ذخیره می‌شوند" />
        <div className="theme-grid">
          {themes.map((theme) => (
            <button key={theme.key} className={cx("theme-card", preferences.theme === theme.key && "selected")} onClick={() => update({ theme: theme.key })}>
              <div>{theme.colors.map((color) => <i key={color} style={{ background: color }}></i>)}</div>
              <strong>{theme.name}</strong><span>{theme.description}</span><b>{preferences.theme === theme.key ? "✓ انتخاب‌شده" : "انتخاب"}</b>
            </button>
          ))}
        </div>
        <div className="settings-list settings-list-grid">
          <article><div><strong>اندازه نوشته‌ها</strong><p>اندازه مناسب برای مانیتور و فاصله مشاهده</p></div><select value={preferences.fontSize} onChange={(event) => update({ fontSize: event.target.value as AppPreferences["fontSize"] })}><option value="normal">معمولی</option><option value="large">خوانا</option><option value="xlarge">درشت</option></select></article>
          <article><div><strong>فاصله ردیف‌های جدول</strong><p>نمای راحت یا فشرده برای تعداد رکورد بیشتر</p></div><select value={preferences.tableDensity} onChange={(event) => update({ tableDensity: event.target.value as AppPreferences["tableDensity"] })}><option value="comfortable">راحت</option><option value="compact">فشرده</option></select></article>
          <article><div><strong>کنتراست جدول</strong><p>تفکیک واضح‌تر وضعیت‌ها و اولویت‌ها</p></div><select value={preferences.contrast} onChange={(event) => update({ contrast: event.target.value as AppPreferences["contrast"] })}><option value="standard">معمولی</option><option value="high">زیاد</option></select></article>
          <article><div><strong>ستون‌های تکمیلی</strong><p>منبع، دفعات و آخرین مشاهده</p></div><button className={cx("setting-toggle", preferences.adaptiveTables && "on")} onClick={() => update({ adaptiveTables: !preferences.adaptiveTables })}><i></i><span>{preferences.adaptiveTables ? "نمایش" : "مخفی"}</span></button></article>
        </div>
        <div className="simple-color-legend"><span><i className="blue"></i>آبی: جدید</span><span><i className="orange"></i>نارنجی: در پیگیری</span><span><i className="yellow"></i>زرد: منتظر</span><span><i className="green"></i>سبز: رفع‌شده</span><span><i className="gray"></i>خاکستری: بسته</span><span><i className="red"></i>قرمز: بازگشایی</span></div>
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="نام سامانه و عنوان صفحه‌ها" subtitle={canManage ? "این تغییرها برای همه کاربران نمایش داده می‌شوند" : "فقط مدیر سامانه می‌تواند این بخش را تغییر دهد"} />
        <fieldset disabled={!canManage} className="settings-fieldset">
          <div className="form-grid two-cols">
            <label><span>نام سامانه</span><input value={draft.brand.name} onChange={(event) => setDraft((current) => ({ ...current, brand: { ...current.brand, name: event.target.value } }))} /></label>
            <label><span>زیرعنوان کنار لوگو</span><input value={draft.brand.subtitle} onChange={(event) => setDraft((current) => ({ ...current, brand: { ...current.brand, subtitle: event.target.value } }))} /></label>
            {(Object.keys(pageTitles) as PageKey[]).map((key) => <div className="page-text-editor full" key={key}><strong>{pageTitles[key].title}</strong><label><span>عنوان</span><input value={draft.pageTitles[key].title} onChange={(event) => setPageText(key, "title", event.target.value)} /></label><label><span>توضیح کوتاه</span><input value={draft.pageTitles[key].kicker} onChange={(event) => setPageText(key, "kicker", event.target.value)} /></label></div>)}
          </div>
        </fieldset>
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="متن و بخش‌های داشبورد" subtitle="عنوان اصلی و نام ویجت‌ها بدون تغییر کد قابل ویرایش است" />
        <fieldset disabled={!canManage} className="settings-fieldset">
          <div className="form-grid two-cols">
            <label><span>عنوان ابتدای داشبورد</span><input value={draft.dashboard.welcomeTitle} onChange={(event) => setDraft((current) => ({ ...current, dashboard: { ...current.dashboard, welcomeTitle: event.target.value } }))} /></label>
            <label><span>توضیح ابتدای داشبورد</span><input value={draft.dashboard.welcomeText} onChange={(event) => setDraft((current) => ({ ...current, dashboard: { ...current.dashboard, welcomeText: event.target.value } }))} /></label>
          </div>
          <div className="widget-title-settings">{defaultWidgetOrder.map((key) => <label key={key}><span>{widgetNames[key]}</span><input value={draft.dashboard.widgetTitles[key] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, dashboard: { ...current.dashboard, widgetTitles: { ...current.dashboard.widgetTitles, [key]: event.target.value } } }))} /></label>)}</div>
        </fieldset>
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="قواعد پیگیری" subtitle="پیش‌فرض‌ها هنگام ساخت و تکمیل پیگیری استفاده می‌شوند" />
        <fieldset disabled={!canManage} className="settings-fieldset">
          <div className="form-grid two-cols">
            <label className="full"><span>نوع‌های قابل انتخاب؛ هر مورد در یک خط</span><textarea rows={7} value={typesText} onChange={(event) => setTypesText(event.target.value)} /></label>
            <label><span>نوع پیش‌فرض</span><select value={draft.followups.defaultType} onChange={(event) => setDraft((current) => ({ ...current, followups: { ...current.followups, defaultType: event.target.value } }))}>{typesText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span>موعد پیش‌فرض بعد از ثبت</span><select value={draft.followups.defaultDelayHours} onChange={(event) => setDraft((current) => ({ ...current, followups: { ...current.followups, defaultDelayHours: Number(event.target.value) } }))}><option value={4}>۴ ساعت</option><option value={8}>۸ ساعت</option><option value={24}>۱ روز</option><option value={48}>۲ روز</option><option value={72}>۳ روز</option><option value={168}>۱ هفته</option></select></label>
            <label><span>فاصله پیشنهادی پیگیری بعدی</span><select value={draft.followups.nextDelayHours} onChange={(event) => setDraft((current) => ({ ...current, followups: { ...current.followups, nextDelayHours: Number(event.target.value) } }))}><option value={8}>۸ ساعت</option><option value={24}>۱ روز</option><option value={48}>۲ روز</option><option value={72}>۳ روز</option><option value={168}>۱ هفته</option></select></label>
            <label><span>بدون تغییر پس از چند ساعت</span><select value={draft.followups.staleAfterHours} onChange={(event) => setDraft((current) => ({ ...current, followups: { ...current.followups, staleAfterHours: Number(event.target.value) } }))}><option value={24}>۲۴ ساعت</option><option value={48}>۴۸ ساعت</option><option value={72}>۷۲ ساعت</option><option value={168}>یک هفته</option></select></label>
            <article className="settings-inline-toggle"><div><strong>نتیجه برای تکمیل الزامی باشد</strong><p>از بسته‌شدن پیگیری بدون توضیح جلوگیری می‌کند</p></div><button type="button" className={cx("setting-toggle", draft.followups.requireResult && "on")} onClick={() => setDraft((current) => ({ ...current, followups: { ...current.followups, requireResult: !current.followups.requireResult } }))}><i></i><span>{draft.followups.requireResult ? "الزامی" : "اختیاری"}</span></button></article>
          </div>
        </fieldset>
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="راهنما و پشتیبانی" subtitle="متن تماس در انتهای صفحه راهنما نمایش داده می‌شود" />
        <fieldset disabled={!canManage} className="settings-fieldset"><div className="form-grid two-cols"><label><span>نام تیم یا مسئول</span><input value={draft.help.contactName} onChange={(event) => setDraft((current) => ({ ...current, help: { ...current.help, contactName: event.target.value } }))} /></label><label><span>متن راه ارتباطی</span><input value={draft.help.contactText} onChange={(event) => setDraft((current) => ({ ...current, help: { ...current.help, contactText: event.target.value } }))} /></label></div></fieldset>
        {canManage && <div className="settings-save-bar"><div><strong>ذخیره تنظیمات عمومی</strong><p>تغییرها بلافاصله در داشبورد همه کاربران قابل مشاهده خواهد بود.</p></div><button className="primary-button" disabled={saving} onClick={() => void saveGlobal()}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button></div>}
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="دریافت اطلاعات" subtitle="تنظیم فاصله دریافت آخرین تغییرات" />
        <div className="settings-list">
          <article><div><strong>دریافت دوره‌ای</strong><p>هنگام بازبودن صفحه، آخرین خطاها و پیگیری‌ها دریافت می‌شوند</p></div><button className={cx("setting-toggle", preferences.autoRefresh && "on")} onClick={() => update({ autoRefresh: !preferences.autoRefresh })}><i></i><span>{preferences.autoRefresh ? "فعال" : "غیرفعال"}</span></button></article>
          <article><div><strong>فاصله تازه‌سازی</strong><p>حداقل فاصله برای جلوگیری از درخواست‌های اضافی</p></div><select value={preferences.refreshSeconds} disabled={!preferences.autoRefresh} onChange={(event) => update({ refreshSeconds: Number(event.target.value) })}><option value={30}>۳۰ ثانیه</option><option value={60}>۱ دقیقه</option><option value={120}>۲ دقیقه</option></select></article>
          <article><div><strong>آخرین همگام‌سازی</strong><p>{lastUpdatedAt ? `${formatDate(lastUpdatedAt, true)} · ${formatRelativeDate(lastUpdatedAt)}` : "هنوز انجام نشده"}</p></div><button className="secondary-button" onClick={() => void onRefresh()}>↻ دریافت آخرین داده</button></article>
        </div>
      </section>

      <section className="panel settings-panel reset-panel">
        <PanelHeader title="بازنشانی تنظیمات شخصی" subtitle="داده‌ها و تنظیمات عمومی سامانه حذف نمی‌شوند" />
        <div><p>تم، اندازه نوشته، تراکم جدول و رفتار تازه‌سازی به حالت پیشنهادی برمی‌گردد.</p><button className="cancel-button" onClick={() => onChange(defaultPreferences)}>بازگشت به تنظیمات پیشنهادی</button></div>
      </section>
    </div>
  );
}

function BugDrawer({
  bug,
  services,
  users,
  assignees,
  attachments,
  followUps,
  events,
  canEdit,
  canDelete,
  appSettings,
  onClose,
  onUpdated,
}: {
  bug: Row;
  services: Row[];
  users: Row[];
  assignees: Row[];
  attachments: Row[];
  followUps: Row[];
  events: Row[];
  canEdit: boolean;
  canDelete: boolean;
  appSettings: AppSettings;
  onClose: () => void;
  onUpdated: (message: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"summary" | "timeline" | "followups" | "email">("summary");
  const [status, setStatus] = useState(String(bug.status));
  const [priority, setPriority] = useState(String(bug.priority));
  const [ownerIds, setOwnerIds] = useState<string[]>(
    assignees.length ? assignees.map((item) => String(item.user_id)) : bug.owner_id ? [String(bug.owner_id)] : [],
  );
  const [title, setTitle] = useState(String(bug.title));
  const [description, setDescription] = useState(String(bug.description ?? ""));
  const [serviceId, setServiceId] = useState(bug.service_id ? String(bug.service_id) : "");
  const [firstSeenAt, setFirstSeenAt] = useState(toDateTimeLocal(bug.first_seen_at));
  const [lastSeenAt, setLastSeenAt] = useState(toDateTimeLocal(bug.last_seen_at));
  const [nextFollowUpAt, setNextFollowUpAt] = useState(toDateTimeLocal(bug.next_follow_up_at));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showFollowup, setShowFollowup] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);

  const save = async () => {
    if (firstSeenAt && lastSeenAt && new Date(lastSeenAt).getTime() < new Date(firstSeenAt).getTime()) {
      setSaveError("آخرین مشاهده نمی‌تواند قبل از اولین مشاهده باشد.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await api(`/api/bugs/${bug.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description,
          status,
          priority,
          serviceId: serviceId ? Number(serviceId) : null,
          ownerIds: ownerIds.map(Number),
          firstSeenAt: firstSeenAt ? new Date(firstSeenAt).toISOString() : undefined,
          lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : undefined,
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
        }),
      });
      await onUpdated("تغییرات خطا ثبت و در Timeline ذخیره شد.");
    } finally {
      setSaving(false);
    }
  };

  const removeBug = async () => {
    const bugCode = String(bug.bug_code);
    const confirmation = window.prompt(
      `این حذف دائمی است و پیگیری‌ها و سوابق وابسته را نیز پاک می‌کند.\nبرای تأیید، شناسه ${bugCode} را وارد کنید:`,
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== bugCode) {
      setSaveError(`شناسه واردشده با ${bugCode} مطابقت ندارد.`);
      return;
    }
    setDeleting(true);
    setSaveError("");
    try {
      await api(`/api/bugs/${bug.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmBugCode: confirmation.trim() }),
      });
      onClose();
      await onUpdated(`خطای ${bugCode} حذف شد.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="bug-drawer">
        <header className="drawer-header">
          <div><span className="bug-code">{String(bug.bug_code)}</span><h2>{String(bug.title)}</h2><p>{String(bug.service_label)} · ثبت‌شده توسط {String(bug.created_by)}</p></div>
          <button className="close-button" onClick={onClose}>×</button>
        </header>
        <div className="drawer-badges"><PriorityBadge value={String(bug.priority)} /><StatusBadge value={String(bug.status)} /><span className="source-badge">{sourceLabels[String(bug.source)] ?? String(bug.source)}</span></div>
        <div className="drawer-tabs">
          <button className={tab === "summary" ? "active" : ""} onClick={() => setTab("summary")}>خلاصه و اقدام</button>
          <button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}>ساخت ایمیل <b>✉</b></button>
          <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>Timeline <b>{faNumber(events.length)}</b></button>
          <button className={tab === "followups" ? "active" : ""} onClick={() => setTab("followups")}>پیگیری‌ها <b>{faNumber(followUps.length)}</b></button>
        </div>
        <div className="drawer-content">
          {tab === "summary" ? (
            <>
              <section className="drawer-section">
                <h3>اطلاعات اصلی</h3>
                <div className="edit-grid">
                  <label className="full"><span>موضوع</span><input value={title} disabled={!canEdit} onChange={(event) => setTitle(event.target.value)} /></label>
                  <label><span>سرویس</span><select value={serviceId} disabled={!canEdit} onChange={(event) => setServiceId(event.target.value)}><option value="">بدون سرویس</option>{services.map((service) => <option key={String(service.id)} value={String(service.id)}>{String(service.path)}</option>)}</select></label>
                  <label><span>منبع</span><input value={sourceLabels[String(bug.source)] ?? String(bug.source)} disabled /></label>
                  <label className="full"><span>شرح و شواهد</span><textarea rows={5} value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} /></label>
                </div>
                {Boolean(bug.dashboard_url) && <a className="external-link" href={String(bug.dashboard_url)} target="_blank" rel="noreferrer">باز کردن داشبورد Kibana ↗</a>}
              </section>
              <section className="drawer-section incident-images-section">
                <div className="incident-images-heading"><div><h3>تصاویر خطا</h3><p>اسکرین‌شات‌ها و شواهد تصویری مرتبط با این Incident</p></div>{canEdit && <label className="image-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploadingImages} onChange={async (event) => { const files = Array.from(event.target.files ?? []); if (!files.length) return; setUploadingImages(true); setSaveError(""); try { await uploadIncidentImages(Number(bug.id), files); await onUpdated(`${faNumber(files.length)} تصویر به خطا افزوده شد.`); } catch (error) { setSaveError(error instanceof Error ? error.message : "آپلود تصاویر انجام نشد."); } finally { setUploadingImages(false); event.target.value = ""; } }} />{uploadingImages ? "در حال آپلود…" : "＋ افزودن تصویر"}</label>}</div>
                <div className="incident-image-grid">
                  {attachments.map((item) => <article key={String(item.id)} className="incident-image-card"><a href={`/api/bug-attachments/${item.id}`} target="_blank" rel="noreferrer"><img src={`/api/bug-attachments/${item.id}`} alt={String(item.original_name)} /><span>مشاهده بزرگ</span></a><div><strong title={String(item.original_name)}>{String(item.original_name)}</strong><small>{(Number(item.size_bytes) / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} MB · {formatDate(item.created_at, true)}</small>{canEdit && <button type="button" onClick={async () => { if (!window.confirm("این تصویر حذف شود؟")) return; try { await api(`/api/bug-attachments/${item.id}`, { method: "DELETE" }); await onUpdated("تصویر از خطا حذف شد."); } catch (error) { setSaveError(error instanceof Error ? error.message : "حذف تصویر انجام نشد."); } }}>حذف</button>}</div></article>)}
                  {!attachments.length && <div className="incident-images-empty">هنوز تصویری برای این خطا ثبت نشده است.</div>}
                </div>
                <small className="incident-image-help">فرمت‌های مجاز: JPG، PNG و WebP · حداکثر ۱۰ مگابایت برای هر تصویر · حداکثر ۱۰ تصویر در هر بار</small>
              </section>
              <section className="detail-grid detail-grid-expanded">
                <div><span>تاریخ ثبت</span><strong>{formatDate(bug.created_at, true)}</strong><small>{formatRelativeDate(bug.created_at)}</small></div>
                <div><span>اولین مشاهده</span><strong>{formatDate(bug.first_seen_at, true)}</strong><small>{formatRelativeDate(bug.first_seen_at)}</small></div>
                <div><span>آخرین مشاهده</span><strong>{formatDate(bug.last_seen_at, true)}</strong><small>{formatRelativeDate(bug.last_seen_at)}</small></div>
                <div><span>دفعات مشاهده</span><strong>{faNumber(bug.occurrence_count)}</strong><small>تعداد رخداد ثبت‌شده</small></div>
                <div><span>آخرین تغییر</span><strong>{formatDate(bug.updated_at, true)}</strong><small>{formatRelativeDate(bug.updated_at)}</small></div>
                <div className={cx(isPast(bug.next_follow_up_at) && "late")}><span>پیگیری بعدی</span><strong>{formatDate(bug.next_follow_up_at, true)}</strong><small>{formatRelativeDate(bug.next_follow_up_at)}</small></div>
              </section>
              <section className="drawer-section">
                <h3>{canEdit ? "ثبت تغییر" : "اطلاعات پیگیری"}</h3>
                <div className="edit-grid">
                  <label><span>وضعیت</span><select value={status} disabled={!canEdit} onChange={(event) => setStatus(event.target.value)}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label><span>اولویت</span><select value={priority} disabled={!canEdit} onChange={(event) => setPriority(event.target.value)}><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label>
                  {canEdit ? <div className="full"><AssigneePicker users={users} selectedIds={ownerIds} onChange={setOwnerIds} /></div> : <div className="full readonly-assignees"><span>مسئولان</span><AssigneeSummary owners={assignees} fallback={String(bug.owner_name)} /></div>}
                  <label><span>اولین مشاهده</span><input type="datetime-local" value={firstSeenAt} disabled={!canEdit} max={lastSeenAt || undefined} onChange={(event) => setFirstSeenAt(event.target.value)} /><small className="date-preview">{firstSeenAt ? `${formatDate(new Date(firstSeenAt).toISOString(), true)} · ${formatRelativeDate(firstSeenAt)}` : "انتخاب نشده"}</small></label>
                  <label><span>آخرین مشاهده</span><input type="datetime-local" value={lastSeenAt} disabled={!canEdit} min={firstSeenAt || undefined} onChange={(event) => setLastSeenAt(event.target.value)} /><small className="date-preview">{lastSeenAt ? `${formatDate(new Date(lastSeenAt).toISOString(), true)} · ${formatRelativeDate(lastSeenAt)}` : "انتخاب نشده"}</small></label>
                  <label className="full"><span>پیگیری بعدی</span><input type="datetime-local" value={nextFollowUpAt} disabled={!canEdit} onChange={(event) => setNextFollowUpAt(event.target.value)} /><small className="date-preview">{nextFollowUpAt ? `${formatDate(new Date(nextFollowUpAt).toISOString(), true)} · ${formatRelativeDate(nextFollowUpAt)}` : "انتخاب نشده"}</small></label>
                </div>
                {saveError && <p className="form-error">{saveError}</p>}
                {canEdit && <button className="primary-button full-button" onClick={() => void save()} disabled={saving || deleting}>{saving ? "در حال ثبت..." : "ثبت تغییرات"}</button>}
              </section>
              {canDelete && (
                <section className="drawer-section danger-zone">
                  <div><h3>حذف خطا</h3><p>حذف دائمی است و پیگیری‌ها، Timeline و ایمیل‌های وابسته را نیز حذف می‌کند. قبل از حذف از دیتابیس نسخه پشتیبان داشته باشید.</p></div>
                  <button className="danger-button" onClick={() => void removeBug()} disabled={deleting || saving}>{deleting ? "در حال حذف..." : "حذف دائم خطا"}</button>
                </section>
              )}
            </>
          ) : tab === "email" ? (
            <EmailComposer bugId={Number(bug.id)} bugCode={String(bug.bug_code)} canEdit={canEdit} />
          ) : tab === "timeline" ? (
            <section className="timeline">
              {events.map((event) => (
                <article key={String(event.id)}><span className="timeline-marker"></span><div><small>{formatDate(event.created_at, true)}</small><h3>{eventLabels[String(event.event_type)] ?? String(event.event_type)}</h3><p>{String(event.summary)}</p><span>{String(event.actor)}</span></div></article>
              ))}
              {!events.length && <EmptyState title="Timeline خالی است" text="تغییرات آینده در این بخش ثبت می‌شوند." />}
            </section>
          ) : (
            <section className="drawer-followups">
              {canEdit && <button className="secondary-button full-button" onClick={() => setShowFollowup((value) => !value)}>＋ ثبت پیگیری جدید</button>}
              {showFollowup && (
                <FollowupForm
                  bugId={Number(bug.id)}
                  defaultOwner={String(bug.owner_name)}
                  settings={appSettings}
                  onCreated={async () => {
                    setShowFollowup(false);
                    await onUpdated("پیگیری جدید برنامه‌ریزی شد.");
                  }}
                />
              )}
              {followUps.map((item) => (
                <article className={cx("drawer-followup-card", item.status === "DONE" && "done", item.status === "CANCELLED" && "cancelled", item.status === "SCHEDULED" && isPast(item.scheduled_at) && "late")} key={String(item.id)}>
                  <span>{item.status === "DONE" ? "✓" : item.status === "CANCELLED" ? "×" : "◷"}</span>
                  <div><strong>{String(item.type)}</strong><p>{String(item.result || item.next_action || "در انتظار انجام")}</p><small>{String(item.owner_name)} · {formatDate(item.scheduled_at, true)} · {formatRelativeDate(item.scheduled_at)}</small></div>
                </article>
              ))}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

type EmailImageMode = "ATTACH" | "INLINE" | "NONE";

function EmailComposer({ bugId, bugCode, canEdit }: { bugId: number; bugCode: string; canEdit: boolean }) {
  const [templateKey, setTemplateKey] = useState("TECHNICAL_INCIDENT");
  const [recommendedTemplateKey, setRecommendedTemplateKey] = useState("TECHNICAL_INCIDENT");
  const [templates, setTemplates] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [imageModes, setImageModes] = useState<Record<number, EmailImageMode>>({});
  const [maxEmailImageBytes, setMaxEmailImageBytes] = useState(18 * 1024 * 1024);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [insights, setInsights] = useState<{
    intent: string;
    intentLabel: string;
    recommendationReason: string;
    status: string;
    priority: string;
    errorCode: string;
    errorLabel: string;
    endpoints: string[];
    components: string[];
    origin: string;
    service: string;
    firstSeen: string;
    lastSeen: string;
    attachmentCount: number;
    historyCount: number;
    latestFollowUp: { type: string; status: string; owner: string; result: string; scheduledAt: string } | null;
  }>({
    intent: "TECHNICAL_INCIDENT",
    intentLabel: "خطای فنی / سرویس",
    recommendationReason: "",
    status: "نامشخص",
    priority: "",
    errorCode: "",
    errorLabel: "",
    endpoints: [],
    components: [],
    origin: "",
    service: "سرویس مربوطه",
    firstSeen: "",
    lastSeen: "",
    attachmentCount: 0,
    historyCount: 0,
    latestFollowUp: null,
  });
  const [deliveryConfigured, setDeliveryConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"DRAFT" | "QUEUE" | null>(null);
  const [preparingEml, setPreparingEml] = useState(false);
  const [mailApp, setMailApp] = useState<"outlook-classic" | "system" | "outlook-web">("outlook-classic");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const loadTemplate = useCallback(async (key: string) => {
    setLoading(true);
    setFormError("");
    try {
      const result = await api<{
        draft: {
          to: string;
          cc: string;
          subject: string;
          body: string;
          templateKey: string;
          recommendedTemplateKey: string;
          context: {
            intent: string;
            intentLabel: string;
            recommendationReason: string;
            status: string;
            priority: string;
            errorCode: string;
            errorLabel: string;
            endpoints: string[];
            components: string[];
            origin: string;
            service: string;
            firstSeen: string;
            lastSeen: string;
            attachmentCount: number;
            historyCount: number;
            latestFollowUp: { type: string; status: string; owner: string; result: string; scheduledAt: string } | null;
          };
        };
        attachments: Row[];
        maxEmailImageBytes?: number;
        maxInlineImageBytes?: number;
        templates: Row[];
        history: Row[];
        deliveryConfigured: boolean;
      }>(`/api/bugs/${bugId}/emails?template=${encodeURIComponent(key)}`);

      setTemplateKey(result.draft.templateKey);
      setRecommendedTemplateKey(result.draft.recommendedTemplateKey);
      setTo(result.draft.to);
      setCc(result.draft.cc);
      setSubject(result.draft.subject);
      setBody(result.draft.body);
      setInsights(result.draft.context);
      setTemplates(result.templates);
      setHistory(result.history);
      setAttachments(result.attachments);

      const imageLimit = result.maxEmailImageBytes || result.maxInlineImageBytes || 18 * 1024 * 1024;
      setMaxEmailImageBytes(imageLimit);
      setImageModes((current) => {
        const next: Record<number, EmailImageMode> = {};
        let total = 0;
        for (const item of result.attachments) {
          const id = Number(item.id);
          const size = Number(item.size_bytes ?? 0);
          const preferred = current[id] ?? "ATTACH";
          if (preferred === "NONE") {
            next[id] = "NONE";
            continue;
          }
          if (total + size <= imageLimit) {
            next[id] = preferred;
            total += size;
          } else {
            next[id] = "NONE";
          }
        }
        return next;
      });
      setDeliveryConfigured(result.deliveryConfigured);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "ساخت ایمیل انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, [bugId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTemplate("AUTO"), 0);
    return () => window.clearTimeout(timer);
  }, [loadTemplate]);

  const imageSelections = useMemo(() => attachments
    .map((item) => ({
      id: Number(item.id),
      mode: imageModes[Number(item.id)] ?? "ATTACH" as EmailImageMode,
      size: Number(item.size_bytes ?? 0),
      item,
    }))
    .filter((selection) => selection.mode !== "NONE"), [attachments, imageModes]);

  const selectedAttachmentIds = imageSelections.map((selection) => selection.id);
  const selectedImageBytes = imageSelections.reduce((sum, selection) => sum + selection.size, 0);
  const selectedImageMb = selectedImageBytes / 1024 / 1024;
  const maxEmailImageMb = maxEmailImageBytes / 1024 / 1024;
  const attachedImageCount = imageSelections.filter((selection) => selection.mode === "ATTACH").length;
  const inlineImageCount = imageSelections.filter((selection) => selection.mode === "INLINE").length;

  const changeImageMode = (attachmentId: number, mode: EmailImageMode) => {
    setMessage("");
    setFormError("");
    const item = attachments.find((attachment) => Number(attachment.id) === attachmentId);
    if (!item) return;
    const currentMode = imageModes[attachmentId] ?? "ATTACH";
    const currentBytes = currentMode === "NONE" ? 0 : Number(item.size_bytes ?? 0);
    const nextBytes = mode === "NONE" ? 0 : Number(item.size_bytes ?? 0);
    if (selectedImageBytes - currentBytes + nextBytes > maxEmailImageBytes) {
      setFormError(`حجم مجموع تصاویر ایمیل نباید بیشتر از ${maxEmailImageMb.toLocaleString("fa-IR", { maximumFractionDigits: 0 })} مگابایت باشد.`);
      return;
    }
    setImageModes((current) => ({ ...current, [attachmentId]: mode }));
  };

  const persist = async (action: "DRAFT" | "QUEUE") => {
    setSaving(action);
    setMessage("");
    setFormError("");
    try {
      const result = await api<{ email: Row; message: string }>(`/api/bugs/${bugId}/emails`, {
        method: "POST",
        body: JSON.stringify({
          action,
          to,
          cc,
          subject,
          body,
          templateKey,
          attachmentIds: selectedAttachmentIds,
          imageSelections: imageSelections.map((selection) => ({ id: selection.id, mode: selection.mode })),
        }),
      });
      setHistory((current) => [result.email, ...current.filter((item) => Number(item.id) !== Number(result.email.id))]);
      setMessage(result.message);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "ثبت ایمیل انجام نشد.");
    } finally {
      setSaving(null);
    }
  };

  const fallbackCopyText = (value: string) => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.inset = "0 auto auto -9999px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);

    try {
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
      activeElement?.focus({ preventScroll: true });
    }
  };

  const writeClipboard = async (value: string, successMessage: string) => {
    setMessage("");
    setFormError("");
    let copied = false;
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) copied = fallbackCopyText(value);
    if (copied) {
      setMessage(successMessage);
      return;
    }
    setFormError("مرورگر اجازه دسترسی به Clipboard را نداد. متن را انتخاب کرده و Ctrl+C بزنید.");
  };

  const copyBody = () => writeClipboard(body, "متن ایمیل کپی شد.");
  const copySubject = () => writeClipboard(subject, "موضوع ایمیل کپی شد.");
  const copyFullEmail = () => writeClipboard(
    `گیرنده: ${to || "—"}\nرونوشت: ${cc || "—"}\nموضوع: ${subject}\n\n${body}`,
    "ایمیل کامل کپی شد.",
  );

  const downloadEml = async () => {
    setPreparingEml(true);
    setMessage("");
    setFormError("");
    try {
      const response = await fetch(`/api/bugs/${bugId}/emails/eml`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          subject,
          body,
          attachmentIds: selectedAttachmentIds,
          imageSelections: imageSelections.map((selection) => ({ id: selection.id, mode: selection.mode })),
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `ساخت فایل ایمیل با خطا روبه‌رو شد (HTTP ${response.status}).`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${bugCode.replace(/[^A-Za-z0-9_-]/g, "_")}.eml`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const parts = [
        attachedImageCount ? `${attachedImageCount.toLocaleString("fa-IR")} پیوست` : "",
        inlineImageCount ? `${inlineImageCount.toLocaleString("fa-IR")} تصویر داخل متن` : "",
      ].filter(Boolean);
      setMessage(parts.length
        ? `فایل Outlook آماده شد (${parts.join(" + ")}).`
        : "فایل Outlook آماده شد.");
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "ساخت فایل EML انجام نشد.");
    } finally {
      setPreparingEml(false);
    }
  };

  const openMailClient = () => {
    if (!to.trim()) {
      setFormError("برای باز کردن برنامه ایمیل، حداقل یک گیرنده وارد کنید.");
      return;
    }
    setFormError("");
    if (mailApp === "outlook-classic") {
      void downloadEml();
      return;
    }
    if (imageSelections.length) {
      setMessage("برای انتقال خودکار تصاویر به ایمیل، Outlook Classic را انتخاب کنید. Outlook Web و برنامه پیش‌فرض فقط متن را باز می‌کنند.");
    }
    if (mailApp === "outlook-web") {
      const href = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to.replace(/\s+/g, ""))}&cc=${encodeURIComponent(cc.replace(/\s+/g, ""))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    const href = `mailto:${to.replace(/\s+/g, "")}?cc=${encodeURIComponent(cc.replace(/\s+/g, ""))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  const selectedTemplate = templates.find((item) => String(item.key) === templateKey);
  const detectedFacts = [
    insights.errorLabel,
    insights.endpoints.length ? `${insights.endpoints.length.toLocaleString("fa-IR")} مسیر معتبر` : "",
    insights.components.length ? `${insights.components.length.toLocaleString("fa-IR")} مؤلفه` : "",
    insights.origin ? `سمت ${insights.origin}` : "",
  ].filter(Boolean);

  if (loading) return <div className="email-composer-loading">در حال ساخت ایمیل هوشمند…</div>;

  return (
    <section className="email-composer smart-email-v12">
      <div className="email-composer-intro smart-email-intro-v12">
        <div>
          <span>✉</span>
          <div>
            <strong>ساخت ایمیل {bugCode}</strong>
            <p>متن کوتاه از اطلاعات واقعی رخداد ساخته می‌شود و قابل ویرایش است.</p>
          </div>
        </div>
        <button type="button" className="secondary-button smart-email-rebuild" onClick={() => void loadTemplate("AUTO")}>✦ بازسازی هوشمند</button>
      </div>

      <div className="smart-email-toolbar-v12">
        <label className="smart-email-type-control">
          <span>نوع پیام</span>
          <select value={templateKey} onChange={(event) => void loadTemplate(event.target.value)}>
            {templates.map((item) => <option key={String(item.key)} value={String(item.key)}>{Boolean(item.recommended) ? "★ " : ""}{String(item.name)}</option>)}
          </select>
          <small>{String(selectedTemplate?.description ?? "نوع پیام را انتخاب کنید.")}</small>
        </label>
        <div className="smart-email-detection-v12">
          <span>تشخیص خودکار</span>
          <strong>{String(templates.find((item) => String(item.key) === recommendedTemplateKey)?.name ?? insights.intentLabel)}</strong>
          {insights.recommendationReason && <small>{insights.recommendationReason}</small>}
          {detectedFacts.length > 0 && <div>{detectedFacts.map((fact) => <b key={fact}>{fact}</b>)}</div>}
        </div>
      </div>

      <div className="email-fields smart-email-fields-v12">
        <label><span>گیرندگان *</span><input value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@company.com" dir="ltr" /></label>
        <label><span>رونوشت (CC)</span><input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="manager@company.com" dir="ltr" /></label>
        <label className="full"><span>موضوع *</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label className="full"><span>متن ایمیل *</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={12} /></label>
      </div>

      {attachments.length > 0 && (
        <div className="smart-email-images-v12">
          <div className="smart-email-images-head-v12">
            <div>
              <strong>تصاویر رخداد</strong>
              <span>پیش‌فرض تصاویر به‌صورت پیوست Outlook ارسال می‌شوند؛ در صورت نیاز هر تصویر را داخل متن قرار دهید.</span>
            </div>
            <div className="smart-email-image-summary-v12">
              {attachedImageCount > 0 && <b>📎 {attachedImageCount.toLocaleString("fa-IR")} پیوست</b>}
              {inlineImageCount > 0 && <b>▣ {inlineImageCount.toLocaleString("fa-IR")} داخل متن</b>}
            </div>
          </div>
          <div className="smart-email-image-grid-v12">
            {attachments.map((item) => {
              const id = Number(item.id);
              const mode = imageModes[id] ?? "ATTACH";
              return (
                <article key={id} className={cx("smart-email-image-card-v12", mode === "NONE" && "disabled", mode === "INLINE" && "inline")}>
                  <img src={String(item.url || `/api/bug-attachments/${id}`)} alt={String(item.original_name)} />
                  <div>
                    <strong title={String(item.original_name)}>{String(item.original_name)}</strong>
                    <small>{(Number(item.size_bytes) / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} MB</small>
                    <select value={mode} onChange={(event) => changeImageMode(id, event.target.value as EmailImageMode)} aria-label={`نحوه استفاده از ${String(item.original_name)}`}>
                      <option value="ATTACH">پیوست فایل</option>
                      <option value="INLINE">داخل متن ایمیل</option>
                      <option value="NONE">استفاده نشود</option>
                    </select>
                  </div>
                </article>
              );
            })}
          </div>
          <div className={cx("email-attachment-summary", selectedImageBytes > maxEmailImageBytes * 0.85 && "near-limit")}>
            <span>{imageSelections.length.toLocaleString("fa-IR")} تصویر انتخاب شده</span>
            <strong>{selectedImageMb.toLocaleString("fa-IR", { maximumFractionDigits: 2 })} / {maxEmailImageMb.toLocaleString("fa-IR", { maximumFractionDigits: 0 })} MB</strong>
          </div>
        </div>
      )}

      {message && <div className="email-message success">{message}</div>}
      {formError && <div className="email-message error">{formError}</div>}

      <div className="email-actions email-actions-v2 smart-email-actions-v12">
        <div className="email-copy-actions">
          <button className="cancel-button" type="button" onClick={() => void copyBody()}>کپی متن</button>
          <button className="cancel-button" type="button" onClick={() => void copySubject()}>کپی موضوع</button>
          <button className="cancel-button" type="button" onClick={() => void copyFullEmail()}>کپی کامل</button>
        </div>
        <div className="mail-app-picker">
          <select value={mailApp} onChange={(event) => setMailApp(event.target.value as typeof mailApp)} aria-label="انتخاب برنامه ایمیل">
            <option value="outlook-classic">Outlook Classic (EML + پیوست)</option>
            <option value="system">برنامه پیش‌فرض سیستم</option>
            <option value="outlook-web">Outlook Web</option>
          </select>
          <button className="primary-button" disabled={preparingEml} onClick={openMailClient}>{mailApp === "outlook-classic" ? (preparingEml ? "در حال آماده‌سازی…" : "ساخت ایمیل Outlook") : "باز کردن برنامه"}</button>
        </div>
        {canEdit && <button className="secondary-button" disabled={Boolean(saving)} onClick={() => void persist("DRAFT")}>{saving === "DRAFT" ? "در حال ذخیره…" : "ذخیره پیش‌نویس"}</button>}
        {canEdit && <button className="secondary-button" disabled={Boolean(saving)} onClick={() => void persist("QUEUE")}>{saving === "QUEUE" ? "در حال ثبت…" : deliveryConfigured ? "ارسال ایمیل" : "ثبت در صف ارسال"}</button>}
      </div>

      <div className="email-history smart-email-history-v12">
        <h3>سابقه ایمیل‌های این خطا</h3>
        {history.length ? history.map((email) => (
          <article key={String(email.id)}>
            <span className="mail-icon">✉</span>
            <div><strong>{String(email.subject)}</strong><p>{String(email.recipient || "بدون گیرنده")}</p></div>
            <EmailStatus value={String(email.status)} />
            <small>{formatDate(email.created_at, true)}</small>
          </article>
        )) : <p className="empty-email-history">هنوز ایمیلی برای این خطا ثبت نشده است.</p>}
      </div>
    </section>
  );
}


function EmailStatus({ value }: { value: string }) {
  const labels: Record<string, string> = {
    DRAFT: "پیش‌نویس",
    PENDING: "در صف",
    SENT: "ارسال‌شده",
    FAILED: "ناموفق",
  };
  return <span className={cx("email-status", value.toLowerCase())}>{labels[value] ?? value}</span>;
}

function FollowupForm({
  bugId,
  defaultOwner,
  settings,
  onCreated,
}: {
  bugId: number;
  defaultOwner: string;
  settings: AppSettings;
  onCreated: () => Promise<void>;
}) {
  const [type, setType] = useState(settings.followups.defaultType);
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocal(new Date(Date.now() + settings.followups.defaultDelayHours * 3_600_000).toISOString()));
  const [ownerName, setOwnerName] = useState(defaultOwner === "تعیین نشده" ? "" : defaultOwner);
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form className="inline-form followup-create-form" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      try {
        await api(`/api/bugs/${bugId}/followups`, {
          method: "POST",
          body: JSON.stringify({ type, scheduledAt: new Date(scheduledAt).toISOString(), ownerName, nextAction }),
        });
        await onCreated();
      } finally {
        setSaving(false);
      }
    }}>
      <label><span>نوع پیگیری</span><select value={type} onChange={(event) => setType(event.target.value)}>{settings.followups.types.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>زمان</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /><small>{formatDate(scheduledAt, true)} · {formatRelativeDate(scheduledAt)}</small></label>
      <label><span>مسئول</span><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required /></label>
      <label className="full"><span>اقدام مورد انتظار</span><textarea rows={3} value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="دقیق بنویسید چه کاری، توسط چه کسی و با چه خروجی انجام شود." /></label>
      <button className="primary-button small" disabled={saving || !scheduledAt || !ownerName.trim()}>{saving ? "در حال ثبت..." : "ثبت پیگیری"}</button>
    </form>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card">
        <header><div><span>سامانه مدیریت خطا</span><h2>{title}</h2><p>{subtitle}</p></div><button className="close-button" onClick={onClose}>×</button></header>
        {children}
      </section>
    </div>
  );
}

function NewBugModal({ services, users, onClose, onCreated }: { services: Row[]; users: Row[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [firstSeenAt, setFirstSeenAt] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const imagePreviews = useMemo(() => images.map((file) => ({ file, url: URL.createObjectURL(file) })), [images]);
  useEffect(() => () => imagePreviews.forEach((item) => URL.revokeObjectURL(item.url)), [imagePreviews]);
  return (
    <ModalShell title="خطای جدید" subtitle="موضوع، سرویس، اولویت و زمان مشاهده را وارد کنید." onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true); setFormError("");
        const values = new FormData(event.currentTarget);
        try {
          const created = await api<{ bug: Row }>("/api/bugs", {
            method: "POST",
            body: JSON.stringify({
              title: values.get("title"),
              description: values.get("description"),
              serviceId: Number(values.get("serviceId")),
              priority: values.get("priority"),
              ownerIds: ownerIds.map(Number),
              firstSeenAt: firstSeenAt ? new Date(firstSeenAt).toISOString() : new Date().toISOString(),
            }),
          });
          if (images.length) await uploadIncidentImages(Number(created.bug.id), images);
          await onCreated();
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "ثبت خطا انجام نشد.");
        } finally { setSaving(false); }
      }}>
        <label className="full"><span>موضوع خطا *</span><input name="title" placeholder="مثلاً افزایش خطای ۵۰۲ در درگاه پرداخت" required autoFocus /></label>
        <label><span>سرویس *</span><select name="serviceId" required defaultValue=""><option value="" disabled>انتخاب سرویس</option>{services.map((service) => <option key={String(service.id)} value={String(service.id)}>{String(service.path)}</option>)}</select></label>
        <label><span>اولویت *</span><select name="priority" defaultValue="P2"><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select></label>
        <div className="full"><AssigneePicker users={users} selectedIds={ownerIds} onChange={setOwnerIds} compact /></div>
        <label className="full"><span>اولین مشاهده</span><input name="firstSeenAt" type="datetime-local" value={firstSeenAt} onChange={(event) => setFirstSeenAt(event.target.value)} /><small className="date-preview">{firstSeenAt ? `${formatDate(new Date(firstSeenAt).toISOString(), true)} · ${formatRelativeDate(firstSeenAt)}` : "در صورت خالی بودن، زمان فعلی ثبت می‌شود"}</small></label>
        <label className="full"><span>شرح و شواهد اولیه</span><textarea name="description" rows={5} placeholder="اثر مشاهده‌شده، نمودار مرتبط یا اقدام اولیه..." /></label>
        <div className="full new-bug-image-picker"><div className="image-picker-head"><div><strong>تصاویر خطا</strong><span>اسکرین‌شات یا شواهد تصویری را همراه ثبت Incident اضافه کنید.</span></div><label className="image-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); const invalid = selected.find((file) => file.size > 10 * 1024 * 1024); if (invalid) { setFormError(`حجم ${invalid.name} بیشتر از ۱۰ مگابایت است.`); event.target.value = ""; return; } setImages((current) => [...current, ...selected].slice(0, 10)); event.target.value = ""; }} />＋ انتخاب تصویر</label></div>{images.length > 0 && <div className="new-bug-image-previews">{imagePreviews.map(({ file, url }, index) => <article key={`${file.name}-${file.lastModified}-${index}`}><img src={url} alt={file.name} /><button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button><span>{file.name}</span><small>{(file.size / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 2 })} MB</small></article>)}</div>}<small className="incident-image-help">JPG، PNG یا WebP · حداکثر ۱۰ مگابایت برای هر تصویر · حداکثر ۱۰ تصویر</small></div>
        {formError && <p className="form-error">{formError}</p>}
        <footer><button type="button" className="cancel-button" onClick={onClose}>انصراف</button><button className="primary-button" disabled={saving}>{saving ? "در حال ثبت..." : "ثبت خطا"}</button></footer>
      </form>
    </ModalShell>
  );
}

function NewServiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  return (
    <ModalShell title="سرویس جدید" subtitle="مالکیت، مسیر ELK و گیرندگان هشدار را مشخص کنید." onClose={onClose}>
      <SimpleCreateForm endpoint="/api/services" onCreated={onCreated} onClose={onClose} fields={[
        { name: "name", label: "نام سرویس", required: true },
        { name: "code", label: "کد انگلیسی", required: true, placeholder: "PAY" },
        { name: "path", label: "مسیر در ELK", required: true, placeholder: "ELK > Pay" },
        { name: "team", label: "تیم مالک", required: true },
        { name: "managerEmail", label: "ایمیل مدیر" },
        { name: "alertEmail", label: "ایمیل هشدار" },
      ]} />
    </ModalShell>
  );
}

function NewUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  return (
    <ModalShell title="کاربر جدید" subtitle="ایمیل، رمز اولیه و نقش را مشخص کنید. نام کاربری را خود کاربر تنظیم می‌کند." onClose={onClose}>
      <SimpleCreateForm endpoint="/api/users" onCreated={onCreated} onClose={onClose} fields={[
        { name: "fullName", label: "نام و نام خانوادگی", required: true },
        { name: "email", label: "ایمیل", required: true, type: "email" },
        { name: "password", label: "رمز عبور اولیه", required: true, type: "password", placeholder: "حداقل ۸ کاراکتر" },
        { name: "team", label: "تیم", required: true },
        { name: "role", label: "نقش", type: "select", options: [{ value: "OPERATOR", label: "کارشناس" }, { value: "ADMIN", label: "مدیر سامانه" }, { value: "VIEWER", label: "مشاهده‌گر" }] },
      ]} />
    </ModalShell>
  );
}

function EditServiceModal({ service, onClose, onUpdated }: { service: Row; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  return (
    <ModalShell title="ویرایش سرویس" subtitle="نام نمایشی، مسیر، مالکیت و گیرندگان هشدار را تغییر دهید." onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setSaving(true); setFormError("");
        const values = new FormData(event.currentTarget);
        try {
          await api(`/api/services/${service.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: values.get("name"),
              code: values.get("code"),
              path: values.get("path"),
              team: values.get("team"),
              managerEmail: values.get("managerEmail"),
              alertEmail: values.get("alertEmail"),
              isActive: values.get("isActive") === "on",
            }),
          });
          await onUpdated();
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "ویرایش سرویس انجام نشد.");
        } finally { setSaving(false); }
      }}>
        <label><span>نام سرویس *</span><input name="name" required defaultValue={String(service.name)} /></label>
        <label><span>کد *</span><input name="code" required defaultValue={String(service.code)} dir="ltr" /></label>
        <label className="full"><span>مسیر/نام در مانیتورینگ *</span><input name="path" required defaultValue={String(service.path)} /></label>
        <label><span>تیم مالک *</span><input name="team" required defaultValue={String(service.team)} /></label>
        <label><span>ایمیل مدیر</span><input name="managerEmail" type="email" defaultValue={String(service.manager_email ?? "")} /></label>
        <label><span>ایمیل هشدار</span><input name="alertEmail" type="email" defaultValue={String(service.alert_email ?? "")} /></label>
        <label className="switch-field"><input name="isActive" type="checkbox" defaultChecked={Number(service.is_active) !== 0} /><span>سرویس فعال باشد</span></label>
        {formError && <p className="form-error">{formError}</p>}
        <footer><button type="button" className="cancel-button" onClick={onClose}>انصراف</button><button className="primary-button" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button></footer>
      </form>
    </ModalShell>
  );
}

function EditUserModal({ user, isCurrentUser, actorRole, onClose, onUpdated }: { user: Row; isCurrentUser: boolean; actorRole: CurrentUser["role"]; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const isSuperAdminAccount = String(user.role) === "SUPER_ADMIN";
  const roleOnly = actorRole === "ADMIN";
  return (
    <ModalShell title={roleOnly ? "مدیریت نقش کاربر" : "ویرایش کاربر"} subtitle={isSuperAdminAccount ? "حساب سوپر ادمین فعال و محافظت‌شده باقی می‌ماند." : roleOnly ? "مدیر سامانه فقط نقش و وضعیت حساب را تغییر می‌دهد؛ رمز عبور و مشخصات هویتی دست‌نخورده می‌مانند." : "مشخصات حساب و نقش را مدیریت کنید؛ نام کاربری را خود کاربر از منوی حساب تنظیم می‌کند."} onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setSaving(true); setFormError("");
        const values = new FormData(event.currentTarget);
        try {
          await api(`/api/users/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify(roleOnly ? {
              role: values.get("role"),
              isActive: values.get("isActive") === "on",
            } : {
              fullName: values.get("fullName"),
              email: values.get("email"),
              team: values.get("team"),
              role: values.get("role"),
              isActive: values.get("isActive") === "on",
            }),
          });
          await onUpdated();
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "ویرایش کاربر انجام نشد.");
        } finally { setSaving(false); }
      }}>
        {roleOnly ? (
          <div className="full form-hint"><b>{String(user.full_name)}</b> · <span dir="ltr">@{String(user.username || "—")}</span> · <span dir="ltr">{String(user.email)}</span></div>
        ) : (
          <>
            <label><span>نام و نام خانوادگی *</span><input name="fullName" required defaultValue={String(user.full_name)} /></label>
            <label><span>ایمیل *</span><input name="email" type="email" required defaultValue={String(user.email)} /></label>
            <label><span>تیم *</span><input name="team" required defaultValue={String(user.team)} /></label>
          </>
        )}
        <label><span>نقش</span><select name="role" defaultValue={String(user.role)} disabled={isSuperAdminAccount || isCurrentUser}><option value="ADMIN">مدیر سامانه</option><option value="OPERATOR">کارشناس</option><option value="VIEWER">مشاهده‌گر</option>{isSuperAdminAccount && <option value="SUPER_ADMIN">سوپر ادمین</option>}</select></label>
        <label className="switch-field full"><input name="isActive" type="checkbox" defaultChecked={Number(user.is_active) !== 0} disabled={isSuperAdminAccount || isCurrentUser} /><span>این کاربر فعال باشد</span></label>
        <div className="full form-hint">رمز عبور از بخش «تغییر رمز» مدیریت می‌شود. مدیر سامانه به رمز سایر کاربران دسترسی ندارد.</div>
        {formError && <p className="form-error">{formError}</p>}
        <footer className="split-footer">
          {!roleOnly && <button type="button" className="danger-button" disabled={deleting || isCurrentUser || isSuperAdminAccount} title={isSuperAdminAccount ? "حساب سوپر ادمین قابل حذف نیست" : isCurrentUser ? "حسابی که با آن وارد شده‌اید قابل حذف نیست" : undefined} onClick={async () => {
            const confirmed = window.confirm(`حساب «${String(user.full_name)}» حذف شود؟ مسئولیت خطاهای جاری برداشته می‌شود، اما سابقه تغییرات باقی می‌ماند.`);
            if (!confirmed) return;
            setDeleting(true); setFormError("");
            try {
              await api(`/api/users/${user.id}`, { method: "DELETE" });
              await onUpdated();
            } catch (requestError) {
              setFormError(requestError instanceof Error ? requestError.message : "حذف کاربر انجام نشد.");
            } finally {
              setDeleting(false);
            }
          }}>{deleting ? "در حال حذف..." : isSuperAdminAccount ? "حساب محافظت‌شده" : isCurrentUser ? "حساب فعال" : "حذف حساب"}</button>}
          <span></span>
          <button type="button" className="cancel-button" onClick={onClose}>انصراف</button>
          <button className="primary-button" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button>
        </footer>
      </form>
    </ModalShell>
  );
}

function UsernameModal({
  currentUsername,
  email,
  onClose,
  onChanged,
}: {
  currentUsername: string;
  email: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  return (
    <ModalShell title="نام کاربری من" subtitle="برای ورود سریع‌تر می‌توانید یک نام کاربری کوتاه انتخاب کنید." onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        setSaving(true);
        setFormError("");
        try {
          await api("/api/account/username", {
            method: "PATCH",
            body: JSON.stringify({ username: values.get("username") }),
          });
          await onChanged();
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "تغییر نام کاربری انجام نشد.");
        } finally {
          setSaving(false);
        }
      }}>
        <div className="full form-hint"><span dir="ltr">{email}</span></div>
        <label className="full"><span>نام کاربری</span><input name="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9._-]+" defaultValue={currentUsername} placeholder="username" dir="ltr" autoComplete="username" autoFocus /></label>
        <div className="full form-hint">حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط مجاز است. اگر فیلد را خالی ذخیره کنید، ورود فقط با ایمیل انجام می‌شود.</div>
        {formError && <p className="form-error">{formError}</p>}
        <footer><button type="button" className="cancel-button" onClick={onClose}>انصراف</button><button className="primary-button" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره نام کاربری"}</button></footer>
      </form>
    </ModalShell>
  );
}

function ChangePasswordModal({
  user,
  isCurrentUser,
  actorRole,
  onClose,
  onChanged,
}: {
  user: Row;
  isCurrentUser: boolean;
  actorRole: CurrentUser["role"];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const canReset = actorRole === "SUPER_ADMIN";
  return (
    <ModalShell title={isCurrentUser ? "تغییر رمز عبور من" : `تغییر رمز ${String(user.full_name)}`} subtitle={isCurrentUser ? "برای امنیت، ابتدا رمز فعلی خود را وارد کنید." : canReset ? "رمز جدید جایگزین رمز قبلی می‌شود." : "دسترسی تغییر رمز این حساب را ندارید."} onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!isCurrentUser && !canReset) return;
        const values = new FormData(event.currentTarget);
        const newPassword = String(values.get("newPassword") ?? "");
        const confirmPassword = String(values.get("confirmPassword") ?? "");
        if (newPassword !== confirmPassword) { setFormError("تکرار رمز عبور با رمز جدید یکسان نیست."); return; }
        setSaving(true); setFormError("");
        try {
          await api(`/api/users/${user.id}/password`, {
            method: "PATCH",
            body: JSON.stringify({ currentPassword: values.get("currentPassword"), newPassword }),
          });
          await onChanged();
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "تغییر رمز عبور انجام نشد.");
        } finally { setSaving(false); }
      }}>
        <div className="full form-hint"><b dir="ltr">@{String(user.username || "user")}</b> · {String(user.email)}</div>
        {isCurrentUser && <label className="full"><span>رمز عبور فعلی *</span><input name="currentPassword" type="password" required minLength={8} autoComplete="current-password" dir="ltr" /></label>}
        <label className="full"><span>رمز عبور جدید *</span><input name="newPassword" type="password" required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" /></label>
        <label className="full"><span>تکرار رمز عبور جدید *</span><input name="confirmPassword" type="password" required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" /></label>
        {formError && <p className="form-error">{formError}</p>}
        <footer><button type="button" className="cancel-button" onClick={onClose}>انصراف</button><button className="primary-button" disabled={saving || (!isCurrentUser && !canReset)}>{saving ? "در حال ذخیره..." : "تغییر رمز عبور"}</button></footer>
      </form>
    </ModalShell>
  );
}

function SimpleCreateForm({
  endpoint,
  fields,
  onCreated,
  onClose,
}: {
  endpoint: string;
  fields: { name: string; label: string; required?: boolean; type?: string; placeholder?: string; options?: { value: string; label: string }[] }[];
  onCreated: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  return (
    <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault(); setSaving(true); setFormError("");
      const values = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        await api(endpoint, { method: "POST", body: JSON.stringify(values) });
        await onCreated();
      } catch (requestError) {
        setFormError(requestError instanceof Error ? requestError.message : "ثبت اطلاعات انجام نشد.");
      } finally { setSaving(false); }
    }}>
      {fields.map((field) => (
        <label key={field.name}><span>{field.label}{field.required ? " *" : ""}</span>
          {field.type === "select" ? (
            <select name={field.name} required={field.required}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          ) : (
            <input name={field.name} type={field.type ?? "text"} required={field.required} placeholder={field.placeholder} />
          )}
        </label>
      ))}
      {formError && <p className="form-error">{formError}</p>}
      <footer><button type="button" className="cancel-button" onClick={onClose}>انصراف</button><button className="primary-button" disabled={saving}>{saving ? "در حال ثبت..." : "ثبت اطلاعات"}</button></footer>
    </form>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><img className="empty-state-gif" src="/ui/incident-radar.gif" alt="" aria-hidden="true" /><strong>{title}</strong><p>{text}</p></div>;
}

function LoadingState() {
  return <div className="loading-state"><span></span><p>در حال دریافت اطلاعات...</p></div>;
}
