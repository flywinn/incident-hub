"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Row = Record<string, unknown>;

type Snapshot = {
  bugs: Row[];
  services: Row[];
  users: Row[];
  assignees: Row[];
  followUps: Row[];
  events: Row[];
  emails: Row[];
  imports: Row[];
  auditLogs: Row[];
  currentUser: CurrentUser | null;
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
  | "settings";

type WidgetKey = "kpis" | "critical" | "attention" | "overview" | "services" | "incidents" | "followups" | "quality" | "growth" | "activity";

type CurrentUser = {
  id: number;
  fullName: string;
  email: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
  team: string;
  isActive: boolean;
};

type AppPreferences = {
  theme: "forest" | "ocean" | "violet" | "amber";
  fontSize: "normal" | "large" | "xlarge";
  autoRefresh: boolean;
  refreshSeconds: number;
  adaptiveTables: boolean;
};

const defaultPreferences: AppPreferences = {
  theme: "forest",
  fontSize: "large",
  autoRefresh: true,
  refreshSeconds: 30,
  adaptiveTables: true,
};

const defaultWidgetOrder: WidgetKey[] = ["kpis", "critical", "attention", "overview", "services", "incidents", "followups", "quality", "growth", "activity"];

const widgetNames: Record<WidgetKey, string> = {
  kpis: "شاخص‌های کلیدی",
  critical: "هشدار بحرانی",
  attention: "صف نیازمند اقدام",
  overview: "ترکیب وضعیت‌ها",
  services: "سرویس‌های پرتکرار",
  incidents: "خطاهای اخیر",
  followups: "پیگیری‌های نزدیک",
  quality: "کیفیت داده",
  growth: "رشد داده",
  activity: "جریان فعالیت",
};

const statusLabels: Record<string, string> = {
  NEW: "جدید",
  IN_PROGRESS: "در حال بررسی",
  RESOLVED: "رفع‌شده",
  CLOSED: "بسته‌شده",
  REOPENED: "بازگشایی",
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
};

const sourceLabels: Record<string, string> = {
  MANUAL: "ثبت دستی",
  ELK: "هشدار ELK",
  SPREADSHEET: "Excel",
};

function roleLabel(role: CurrentUser["role"]) {
  return role === "ADMIN" ? "مدیر سامانه" : role === "OPERATOR" ? "کارشناس" : "مشاهده‌گر";
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
};

const navItems: { key: PageKey; label: string; icon: string }[] = [
  { key: "dashboard", label: "داشبورد", icon: "⌂" },
  { key: "bugs", label: "خطاها", icon: "!" },
  { key: "followups", label: "پیگیری‌ها", icon: "✓" },
  { key: "services", label: "سرویس‌ها", icon: "◇" },
  { key: "users", label: "کاربران", icon: "●" },
  { key: "audit", label: "سوابق تغییرات", icon: "≡" },
  { key: "automation", label: "اتصال‌ها", icon: "↻" },
  { key: "settings", label: "تنظیمات", icon: "⚙" },
];

const emptySnapshot: Snapshot = {
  bugs: [],
  services: [],
  users: [],
  assignees: [],
  followUps: [],
  events: [],
  emails: [],
  imports: [],
  auditLogs: [],
  currentUser: null,
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

function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "درخواست انجام نشد.");
  return payload;
}

export default function IncidentHub({
  currentUser,
  signOutPath,
}: {
  currentUser: CurrentUser;
  signOutPath: string;
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
  const canEdit = currentUser.role === "ADMIN" || currentUser.role === "OPERATOR";
  const isAdmin = currentUser.role === "ADMIN";

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
      const saved = window.localStorage.getItem("elk-app-preferences-v2");
      if (saved) {
        try {
          setPreferences({ ...defaultPreferences, ...JSON.parse(saved) as Partial<AppPreferences> });
        } catch {
          window.localStorage.removeItem("elk-app-preferences-v2");
        }
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("elk-app-preferences-v2", JSON.stringify(preferences));
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.dataset.fontSize = preferences.fontSize;
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

  const selectedBug = data.bugs.find((bug) => Number(bug.id) === selectedBugId) ?? null;
  const openBugs = data.bugs.filter((bug) => !["CLOSED", "RESOLVED"].includes(String(bug.status)));
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

  return (
    <div className="app-shell" dir="rtl" data-theme={preferences.theme}>
      <Sidebar
        active={page}
        onNavigate={setPage}
        openCount={openBugs.length}
        overdueCount={overdueFollowups.length}
        isAdmin={isAdmin}
      />

      <main className="main-area">
        <header className="topbar">
          <div className="page-heading">
            <span className="page-kicker">{pageTitles[page].kicker}</span>
            <h1>{pageTitles[page].title}</h1>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="جست‌وجوی شناسه، موضوع یا سرویس..."
                aria-label="جست‌وجوی خطا"
              />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button" onClick={() => void reload()} aria-label="به‌روزرسانی">
              ↻
            </button>
            {canEdit && (
              <button className="primary-button" onClick={() => setModal("bug")}>
                <span>＋</span>
                ثبت خطا
              </button>
            )}
            <div className="account-menu">
              <button className="account-button" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen}>
                <Avatar name={currentUser.fullName} />
                <span><strong>{currentUser.fullName}</strong><small>{roleLabel(currentUser.role)}</small></span>
                <b>⌄</b>
              </button>
              {accountOpen && (
                <div className="account-popover">
                  <strong>{currentUser.fullName}</strong>
                  <span dir="ltr">{currentUser.email}</span>
                  <small>{currentUser.team} · {roleLabel(currentUser.role)}</small>
                  {signOutPath ? <a href={signOutPath}>خروج از حساب</a> : <span>ورود یکپارچه ویندوز</span>}
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
              onSelectBug={(id) => setSelectedBugId(id)}
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
              onQuickUpdate={async (id, payload) => {
                await api(`/api/bugs/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify(payload),
                });
                showNotice("تغییر سریع ذخیره شد.");
                await reload();
              }}
            />
          ) : page === "followups" ? (
            <FollowupsPage
              followUps={data.followUps}
              bugs={data.bugs}
              canEdit={canEdit}
              onComplete={async (id, result) => {
                await api(`/api/followups/${id}`, {
                  method: "PATCH",
                  body: JSON.stringify({ result }),
                });
                showNotice("پیگیری با موفقیت انجام شد.");
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
              onNew={() => setModal("user")}
              onUpdated={async () => {
                showNotice("اطلاعات مسئول ذخیره شد.");
                await reload();
              }}
            />
          ) : page === "audit" ? (
            <AuditPage logs={data.auditLogs} />
          ) : page === "automation" ? (
            <AutomationPage data={data} />
          ) : (
            <SettingsPage
              preferences={preferences}
              lastUpdatedAt={lastUpdatedAt}
              onChange={setPreferences}
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
          followUps={data.followUps.filter((item) => Number(item.bug_id) === Number(selectedBug.id))}
          events={data.events.filter((event) => Number(event.bug_id) === Number(selectedBug.id))}
          canEdit={canEdit}
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
      {isAdmin && modal === "user" && (
        <NewUserModal
          onClose={() => setModal(null)}
          onCreated={async () => {
            setModal(null);
            showNotice("کاربر جدید ثبت شد.");
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
}: {
  active: PageKey;
  onNavigate: (key: PageKey) => void;
  openCount: number;
  overdueCount: number;
  isAdmin: boolean;
}) {
  const availableItems = navItems.filter((item) =>
    isAdmin || !["users", "automation", "settings"].includes(item.key),
  );
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><span></span><span></span><span></span></div>
        <div><strong>دیدبان</strong><small>مدیریت خطا و پیگیری</small></div>
      </div>
      <nav>
        <span className="nav-section">فضای کاری</span>
        {availableItems.map((item) => (
          <button
            key={item.key}
            className={cx("nav-item", active === item.key && "active")}
            onClick={() => onNavigate(item.key)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.key === "bugs" && openCount > 0 && <b>{faNumber(openCount)}</b>}
            {item.key === "followups" && overdueCount > 0 && <b className="danger-count">{faNumber(overdueCount)}</b>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-health">
          <div><span className="pulse"></span><strong>ارتباط با سامانه</strong></div>
          <small>اطلاعات از پایگاه داده دریافت می‌شود</small>
          <div className="health-meter"><i></i></div>
        </div>
        <button className="support-link"><span>؟</span> راهنما و مستندات</button>
      </div>
    </aside>
  );
}

function Dashboard({
  data,
  filteredBugs,
  adaptiveTables,
  canEdit,
  onSelectBug,
  onSeeAll,
}: {
  data: Snapshot;
  filteredBugs: Row[];
  adaptiveTables: boolean;
  canEdit: boolean;
  onSelectBug: (id: number) => void;
  onSeeAll: () => void;
}) {
  const [range, setRange] = useState("ALL");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<WidgetKey[]>(defaultWidgetOrder);
  const [hidden, setHidden] = useState<WidgetKey[]>([]);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = window.localStorage.getItem("elk-dashboard-layout-v1");
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
        window.localStorage.removeItem("elk-dashboard-layout-v1");
      }
      setPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    window.localStorage.setItem("elk-dashboard-layout-v1", JSON.stringify({ order, hidden }));
    window.localStorage.setItem("elk-dashboard-range-v1", range);
  }, [order, hidden, range, preferencesReady]);

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
  const scheduled = data.followUps.filter((item) =>
    item.status === "SCHEDULED" && rangeBugIds.has(Number(item.bug_id)),
  );
  const overdue = scheduled.filter((item) => isPast(item.scheduled_at));
  const resolved = rangeBugs.filter((bug) => bug.status === "RESOLVED" || bug.status === "CLOSED");
  const resolutionRate = rangeBugs.length ? Math.round((resolved.length / rangeBugs.length) * 100) : 0;
  const assigned = rangeBugs.filter((bug) => bug.owner_id || String(bug.owner_name) !== "تعیین نشده");
  const followedBugIds = new Set(data.followUps.map((item) => Number(item.bug_id)));
  const withFollowup = rangeBugs.filter((bug) => followedBugIds.has(Number(bug.id)));
  const scheduledBugIds = new Set(scheduled.map((item) => Number(item.bug_id)));
  const unassigned = active.filter((bug) => !bug.owner_id && String(bug.owner_name) === "تعیین نشده");
  const withoutFollowup = active.filter((bug) => !scheduledBugIds.has(Number(bug.id)));
  const stale = active.filter((bug) =>
    pageLoadedAt - new Date(String(bug.updated_at)).getTime() > 48 * 60 * 60 * 1000,
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
        <section className="stats-grid">
          <StatCard label="خطاهای باز" value={active.length} note={`میانگین عمر ${faNumber(openAge)} روز`} icon="!" tone="orange" trend={`از ${faNumber(rangeBugs.length)} رکورد`} />
          <StatCard label="P1 باز" value={p1.length} note="فقط موارد نیازمند اقدام" icon="◆" tone="red" trend={p1.length ? "توجه فوری" : "بدون مورد"} />
          <StatCard label="پیگیری عقب‌افتاده" value={overdue.length} note={`از ${faNumber(scheduled.length)} پیگیری باز`} icon="◷" tone="purple" trend="نیازمند ثبت نتیجه" />
          <StatCard label="نرخ رفع" value={`${faNumber(resolutionRate)}٪`} note={`${faNumber(resolved.length)} مورد رفع‌شده`} icon="↗" tone="green" trend="براساس بازه انتخابی" />
        </section>
      );
    } else if (key === "critical") {
      content = critical ? (
        <section className="critical-strip" onClick={() => onSelectBug(Number(critical.id))}>
          <div className="critical-icon">!</div>
          <div>
            <span>مورد بحرانی باز</span>
            <strong>{String(critical.title)}</strong>
            <small>{String(critical.bug_code)} · {String(critical.service_label)} · آخرین مشاهده {formatDate(critical.last_seen_at, true)}</small>
          </div>
          <button>{canEdit ? "بازکردن و بررسی ←" : "مشاهده جزئیات ←"}</button>
        </section>
      ) : <section className="healthy-strip"><span>✓</span><div><strong>مورد P1 بازی ثبت نشده است</strong><small>این نتیجه فقط براساس داده‌های بازه انتخابی است.</small></div></section>;
    } else if (key === "attention") {
      const items = [
        { label: "P1 باز", value: p1.length, text: "نیازمند بررسی فوری", tone: "red" },
        { label: "بدون مسئول", value: unassigned.length, text: "مسئول پیگیری تعیین نشده", tone: "orange" },
        { label: "بدون پیگیری باز", value: withoutFollowup.length, text: "اقدام بعدی ثبت نشده", tone: "purple" },
        { label: "بدون تغییر بیش از ۴۸ ساعت", value: stale.length, text: "آخرین ویرایش قدیمی است", tone: "gray" },
      ];
      content = (
        <section className="panel attention-panel">
          <PanelHeader title="صف نیازمند اقدام" subtitle="موارد باز که برای ادامه کار به تصمیم یا ثبت اطلاعات نیاز دارند" action={<button className="text-button" onClick={onSeeAll}>رفتن به فهرست خطاها ←</button>} />
          <div className="attention-grid">
            {items.map((item) => (
              <article className={item.tone} key={item.label}>
                <span>{item.label}</span>
                <strong>{faNumber(item.value)}</strong>
                <small>{item.text}</small>
              </article>
            ))}
          </div>
        </section>
      );
    } else if (key === "overview") {
      content = (
        <section className="panel analytics-panel">
          <PanelHeader title="ترکیب وضعیت‌ها" subtitle={`${faNumber(rangeBugs.length)} رخداد در بازه انتخابی`} />
          <div className="donut-layout">
            <div className="donut-chart" style={{ background: donutGradient(statusCounts, rangeBugs.length) }}>
              <div><strong>{faNumber(rangeBugs.length)}</strong><span>کل رخداد</span></div>
            </div>
            <div className="chart-legend">
              {statusCounts.map((item, index) => (
                <div key={item.key}><i style={{ background: chartColors[index % chartColors.length] }}></i><span>{item.label}</span><strong>{faNumber(item.count)}</strong></div>
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
          <PanelHeader title="سرویس‌های پرتکرار" subtitle="سهم رخدادها به تفکیک سرویس" />
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
        .filter((bug) => rangeBugIds.has(Number(bug.id)))
        .sort((a, b) => new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime())
        .slice(0, 7);
      content = (
        <section className="panel">
          <PanelHeader title="آخرین خطاهای ثبت‌شده" subtitle="مرتب‌شده براساس تاریخ ثبت، از جدید به قدیم" action={<button className="text-button" onClick={onSeeAll}>مشاهده همه ←</button>} />
          <BugTable bugs={recentBugs} assignees={data.assignees} onSelect={onSelectBug} compact />
        </section>
      );
    } else if (key === "followups") {
      content = (
        <section className="panel">
          <PanelHeader title="پیگیری‌های نزدیک" subtitle="اقدام‌های باز و عقب‌افتاده" />
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
          <PanelHeader title="کامل‌بودن اطلاعات" subtitle="بررسی مسئول و پیگیری ثبت‌شده" />
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
          <PanelHeader title="رکوردهای جدید" subtitle="تعداد خطاهای ثبت‌شده در ۱۰ روز اخیر" />
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
          <PanelHeader title="جریان فعالیت" subtitle="آخرین تغییرات ثبت‌شده" />
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
        title={widgetNames[key]}
        editing={editing}
        onMove={(direction) => moveWidget(key, direction)}
        onHide={() => setHidden((current) => [...current, key])}
      >
        {content}
      </DashboardWidget>
    );
  };

  return (
    <div className="dashboard-grid">
      <section className="welcome-row">
        <div>
          <h2>خلاصه وضعیت ثبت و پیگیری</h2>
          <p>{formatDate(new Date().toISOString())} · آمار براساس تاریخ ثبت خطا</p>
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
          <button className={cx("secondary-button", editing && "active")} onClick={() => setEditing((value) => !value)}>{editing ? "پایان ویرایش" : "⚙ تنظیم داشبورد"}</button>
          <div className="live-chip"><span className="pulse"></span> دریافت دوره‌ای داده</div>
        </div>
      </section>

      {editing && (
        <section className="dashboard-customizer">
          <div><strong>چیدمان داشبورد</strong><span>ترتیب و نمایش بخش‌ها فقط برای همین مرورگر ذخیره می‌شود.</span></div>
          <div className="hidden-widgets">
            {hidden.map((key) => <button key={key} onClick={() => setHidden((current) => current.filter((item) => item !== key))}>＋ {widgetNames[key]}</button>)}
            <button onClick={() => { setOrder(defaultWidgetOrder); setHidden([]); }}>بازنشانی</button>
          </div>
        </section>
      )}
      {order.map(renderWidget)}
    </div>
  );
}

const chartColors = ["#2b8f67", "#4f83b6", "#e09a42", "#8a69b7", "#d65b55"];

function donutGradient(items: { count: number }[], total: number) {
  if (!total) return "#edf2ef";
  let start = 0;
  const parts = items.map((item, index) => {
    const end = start + (item.count / total) * 100;
    const part = `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
    start = end;
    return part;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

function DashboardWidget({
  widgetKey,
  title,
  editing,
  onMove,
  onHide,
  children,
}: {
  widgetKey: string;
  title: string;
  editing: boolean;
  onMove: (direction: -1 | 1) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cx("dashboard-widget", `widget-${widgetKey}`, editing && "editing")}>
      {editing && <div className="widget-controls"><strong>{title}</strong><button onClick={() => onMove(-1)}>↑</button><button onClick={() => onMove(1)}>↓</button><button onClick={onHide}>پنهان</button></div>}
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
}: {
  label: string;
  value: number | string;
  note: string;
  icon: string;
  tone: string;
  trend: string;
}) {
  return (
    <article className="stat-card">
      <div className={cx("stat-icon", tone)}>{icon}</div>
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
  const [showResolved, setShowResolved] = useState(true);
  const [datePreset, setDatePreset] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
    !showResolved,
  ].filter(Boolean).length;
  const resetFilters = () => {
    setPriority("ALL");
    setStatus("ALL");
    setService("ALL");
    setOwner("ALL");
    setAttention("ALL");
    setSort("NEWEST_REGISTERED");
    setShowResolved(true);
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

  return (
    <section className="panel page-panel">
      <div className="filterbar professional-filterbar">
        <div className="filterbar-title">
          <div><strong>فیلتر فهرست خطاها</strong><span>تاریخ‌ها براساس زمان ثبت رکورد محاسبه می‌شوند</span></div>
          <div className="filterbar-actions">
            <button className="export-button" onClick={exportCsv}>↓ خروجی CSV</button>
            <button className="export-button" onClick={exportJson}>↓ خروجی JSON</button>
          </div>
        </div>
        <div className="filter-group primary-filters">
          <select aria-label="فیلتر سرویس" value={service} onChange={(event) => setService(event.target.value)}>
            <option value="ALL">همه سرویس‌ها</option>
            {services.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.path)}</option>)}
          </select>
          <select aria-label="فیلتر مسئول" value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="ALL">همه مسئولان</option>
            {users.map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.full_name)}</option>)}
          </select>
          <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="فیلتر اولویت">
            <option value="ALL">همه اولویت‌ها</option>
            <option>P1</option><option>P2</option><option>P3</option><option>P4</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="فیلتر وضعیت">
            <option value="ALL">همه وضعیت‌ها</option>
            {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select aria-label="فیلتر نیازمند اقدام" value={attention} onChange={(event) => setAttention(event.target.value)}>
            <option value="ALL">همه موارد</option>
            <option value="OPEN">فقط موارد باز</option>
            <option value="P1">P1 باز</option>
            <option value="OVERDUE">پیگیری عقب‌افتاده</option>
            <option value="UNASSIGNED">بدون مسئول</option>
            <option value="STALE">بدون تغییر بیش از ۴۸ ساعت</option>
          </select>
          <select aria-label="بازه تاریخ ثبت" value={datePreset} onChange={(event) => setDatePreset(event.target.value)}>
            <option value="ALL">تاریخ ثبت: همه</option>
            <option value="TODAY">ثبت‌شده امروز</option>
            <option value="7">۷ روز اخیر</option>
            <option value="30">۳۰ روز اخیر</option>
            <option value="90">۹۰ روز اخیر</option>
            <option value="CUSTOM">بازه دلخواه...</option>
          </select>
          <select aria-label="مرتب‌سازی" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="NEWEST_REGISTERED">جدیدترین تاریخ ثبت</option>
            <option value="LATEST_UPDATED">آخرین تغییر</option>
            <option value="PRIORITY">ترتیب اولویت</option>
            <option value="OLDEST_REGISTERED">قدیمی‌ترین تاریخ ثبت</option>
            <option value="SERVICE">نام سرویس</option>
          </select>
          <label className="filter-check"><input type="checkbox" checked={showResolved} onChange={(event) => setShowResolved(event.target.checked)} /><span>نمایش رفع‌شده‌ها</span></label>
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
    <div className="table-wrap">
      <table className="bug-table">
        <thead>
          <tr>
            <th>شناسه و موضوع</th>
            <th>سرویس</th>
            {!compact && <th>ثبت</th>}
            <th>اولویت</th>
            <th>وضعیت</th>
            {!compact && <th>مسئول</th>}
            {!compact && adaptiveColumns && <th>منبع</th>}
            {!compact && adaptiveColumns && <th>تعداد رخداد</th>}
            {!compact && adaptiveColumns && <th>آخرین مشاهده</th>}
            <th>پیگیری بعدی</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bugs.map((bug) => {
            const owners = bugAssignees(assignees, bug.id);
            return (
            <tr key={String(bug.id)} onClick={() => onSelect(Number(bug.id))}>
              <td>
                <span className="bug-code">{String(bug.bug_code)}</span>
                <strong className="bug-title">{String(bug.title)}</strong>
                <small>آخرین مشاهده {formatDate(bug.last_seen_at, true)} ({formatRelativeDate(bug.last_seen_at)}) · {faNumber(bug.occurrence_count)} رخداد</small>
              </td>
              <td><span className="service-path">{String(bug.service_label).replace("ELK > ", "")}</span></td>
              {!compact && <td><span className="registered-date"><i>◷</i><span><strong>{formatDate(bug.created_at, true)}</strong><small>{formatRelativeDate(bug.created_at)}</small></span></span></td>}
              <td>{onQuickUpdate ? (
                <select
                  className={cx("inline-select", `priority-${String(bug.priority).toLowerCase()}`)}
                  value={String(bug.priority)}
                  aria-label={`اولویت ${String(bug.bug_code)}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => void onQuickUpdate(Number(bug.id), { priority: event.target.value })}
                ><option>P1</option><option>P2</option><option>P3</option><option>P4</option></select>
              ) : <PriorityBadge value={String(bug.priority)} />}</td>
              <td>{onQuickUpdate ? (
                <select
                  className="inline-select status"
                  value={String(bug.status)}
                  aria-label={`وضعیت ${String(bug.bug_code)}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => void onQuickUpdate(Number(bug.id), { status: event.target.value })}
                >{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
              ) : <StatusBadge value={String(bug.status)} />}</td>
              {!compact && <td><AssigneeSummary owners={owners} fallback={String(bug.owner_name)} /></td>}
              {!compact && adaptiveColumns && <td><span className="source-badge">{sourceLabels[String(bug.source)] ?? String(bug.source)}</span></td>}
              {!compact && adaptiveColumns && <td><strong className="occurrence-cell">{faNumber(bug.occurrence_count)}</strong></td>}
              {!compact && adaptiveColumns && <td><span className="followup-date">{formatDate(bug.last_seen_at, true)}<small>{formatRelativeDate(bug.last_seen_at)}</small></span></td>}
              <td>
                <span className={cx("followup-date", isPast(bug.next_follow_up_at) && "late")}>
                  {formatDate(bug.next_follow_up_at)}{Boolean(bug.next_follow_up_at) && <small>{formatRelativeDate(bug.next_follow_up_at)}</small>}
                </span>
              </td>
              <td><button className="row-action" aria-label="مشاهده">•••</button></td>
            </tr>
          );})}
          {!bugs.length && <tr><td colSpan={compact ? 6 : adaptiveColumns ? 11 : 8}><EmptyState title="رکوردی پیدا نشد" text="فیلتر یا عبارت جست‌وجو را تغییر دهید." /></td></tr>}
        </tbody>
      </table>
    </div>
  );
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
  onComplete,
  onOpenBug,
}: {
  followUps: Row[];
  bugs: Row[];
  canEdit: boolean;
  onComplete: (id: number, result: string) => Promise<void>;
  onOpenBug: (id: number) => void;
}) {
  const [completing, setCompleting] = useState<number | null>(null);
  const scheduled = followUps.filter((item) => item.status === "SCHEDULED");
  const done = followUps.filter((item) => item.status === "DONE");

  return (
    <div className="two-column-page">
      <section className="panel">
        <PanelHeader title="پیگیری‌های در انتظار" subtitle={`${faNumber(scheduled.length)} اقدام برنامه‌ریزی‌شده`} />
        <div className="task-list">
          {scheduled.map((item) => {
            const bug = bugs.find((entry) => Number(entry.id) === Number(item.bug_id));
            const late = isPast(item.scheduled_at);
            return (
              <article className={cx("task-card", late && "late")} key={String(item.id)}>
                <div className="task-check">
                  {canEdit && <button onClick={() => setCompleting(Number(item.id))} aria-label="ثبت نتیجه پیگیری">✓</button>}
                </div>
                <div className="task-body">
                  <div><PriorityBadge value={String(bug?.priority ?? "P3")} /><span className={cx("due-label", late && "late")}>{late ? "عقب‌افتاده · " : ""}{formatDate(item.scheduled_at, true)}</span></div>
                  <h3>{String(item.type)}</h3>
                  <p>{String(item.next_action || "بررسی وضعیت و ثبت نتیجه")}</p>
                  <button className="linked-bug" onClick={() => bug && onOpenBug(Number(bug.id))}>{String(bug?.bug_code)} · {String(bug?.title)}</button>
                  <div className="task-owner"><Avatar name={String(item.owner_name)} />{String(item.owner_name)}</div>
                </div>
                {completing === Number(item.id) && (
                  <CompleteFollowup
                    onCancel={() => setCompleting(null)}
                    onSubmit={async (result) => {
                      await onComplete(Number(item.id), result);
                      setCompleting(null);
                    }}
                  />
                )}
              </article>
            );
          })}
          {!scheduled.length && <EmptyState title="پیگیری بازی وجود ندارد" text="همه‌ی پیگیری‌های برنامه‌ریزی‌شده انجام شده‌اند." />}
        </div>
      </section>
      <section className="panel done-panel">
        <PanelHeader title="تکمیل‌شده‌ها" subtitle="آخرین نتایج ثبت‌شده" />
        <div className="done-list">
          {done.slice(0, 12).map((item) => (
            <article key={String(item.id)}>
              <span>✓</span>
              <div><strong>{String(item.type)}</strong><p>{String(item.result || "انجام شد")}</p><small>{String(item.owner_name)} · {formatDate(item.completed_at, true)}</small></div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CompleteFollowup({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (result: string) => Promise<void> }) {
  const [result, setResult] = useState("");
  return (
    <div className="inline-complete">
      <textarea value={result} onChange={(event) => setResult(event.target.value)} placeholder="نتیجه‌ی پیگیری را ثبت کنید..." autoFocus />
      <div><button onClick={onCancel}>انصراف</button><button className="primary-button small" onClick={() => void onSubmit(result || "پیگیری انجام و نتیجه تأیید شد.")}>ثبت نتیجه</button></div>
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

function UsersPage({ users, currentUserId, onNew, onUpdated }: { users: Row[]; currentUserId: number; onNew: () => void; onUpdated: () => Promise<void> }) {
  const roleLabels: Record<string, string> = { ADMIN: "مدیر سامانه", OPERATOR: "کارشناس", VIEWER: "مشاهده‌گر" };
  const [editing, setEditing] = useState<Row | null>(null);
  return (
    <>
      <section className="panel page-panel">
        <PanelHeader title="کاربران دارای دسترسی" subtitle="نقش هر کاربر، امکان مشاهده یا تغییر اطلاعات را مشخص می‌کند" action={<button className="secondary-button" onClick={onNew}>＋ افزودن کاربر</button>} />
        <div className="user-list">
          {users.map((user) => (
            <article className={Number(user.is_active) === 0 ? "inactive" : ""} key={String(user.id)}>
              <Avatar name={String(user.full_name)} />
              <div><strong>{String(user.full_name)}</strong><span>{String(user.email)}</span></div>
              <div className="user-team"><small>تیم</small><strong>{String(user.team)}</strong></div>
              <span className={cx("role-badge", String(user.role).toLowerCase())}>{roleLabels[String(user.role)] ?? String(user.role)}</span>
              <span className="active-label"><i></i>{Number(user.is_active) === 0 ? "غیرفعال" : "فعال"}</span>
              <button className="card-edit-button" onClick={() => setEditing(user)}>{Number(user.id) === currentUserId ? "حساب من" : "ویرایش"}</button>
            </article>
          ))}
        </div>
      </section>
      {editing && <EditUserModal user={editing} isCurrentUser={Number(editing.id) === currentUserId} onClose={() => setEditing(null)} onUpdated={async () => { setEditing(null); await onUpdated(); }} />}
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
  };
  const actionLabels: Record<string, string> = {
    CREATE: "ثبت",
    UPDATE: "ویرایش",
    COMPLETE: "ثبت نتیجه",
    DRAFT: "ذخیره پیش‌نویس",
    QUEUE: "ثبت در صف ارسال",
    DELETE: "حذف",
    PROVISION_ADMIN: "ایجاد مدیر اولیه",
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

function SettingsPage({
  preferences,
  lastUpdatedAt,
  onChange,
  onRefresh,
}: {
  preferences: AppPreferences;
  lastUpdatedAt: string;
  onChange: (value: AppPreferences) => void;
  onRefresh: () => Promise<void>;
}) {
  const themes: { key: AppPreferences["theme"]; name: string; description: string; colors: string[] }[] = [
    { key: "forest", name: "سبز دیدبان", description: "تم اصلی و آرام برای کار روزانه", colors: ["#132820", "#1f8f63", "#f5f7f6"] },
    { key: "ocean", name: "آبی اقیانوسی", description: "کنتراست خنک برای مانیتورینگ", colors: ["#102b3a", "#287da8", "#f2f7fa"] },
    { key: "violet", name: "بنفش عملیاتی", description: "تفکیک رنگی واضح‌تر ویجت‌ها", colors: ["#28223d", "#7458b4", "#f7f4fb"] },
    { key: "amber", name: "کهربایی گرم", description: "پس‌زمینه گرم با تمرکز بالا", colors: ["#35261d", "#b76a2c", "#faf6f1"] },
  ];
  const update = (patch: Partial<AppPreferences>) => onChange({ ...preferences, ...patch });
  return (
    <div className="settings-layout">
      <section className="panel settings-panel">
        <PanelHeader title="تم و رنگ‌بندی" subtitle="تغییرات فقط برای همین مرورگر ذخیره می‌شود" />
        <div className="theme-grid">
          {themes.map((theme) => (
            <button key={theme.key} className={cx("theme-card", preferences.theme === theme.key && "selected")} onClick={() => update({ theme: theme.key })}>
              <div>{theme.colors.map((color) => <i key={color} style={{ background: color }}></i>)}</div>
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
              <b>{preferences.theme === theme.key ? "✓ انتخاب‌شده" : "انتخاب تم"}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="خوانایی و نمایش" subtitle="اندازه قلم در تمام داشبورد، فرم‌ها و جدول‌ها اعمال می‌شود" />
        <div className="settings-list">
          <article>
            <div><strong>اندازه نوشته‌ها</strong><p>فونت فارسی خواناتر با فاصله خطوط مناسب</p></div>
            <select value={preferences.fontSize} onChange={(event) => update({ fontSize: event.target.value as AppPreferences["fontSize"] })}>
              <option value="normal">معمولی</option>
              <option value="large">خوانا</option>
              <option value="xlarge">خیلی خوانا</option>
            </select>
          </article>
          <article>
            <div><strong>ستون‌های تکمیلی جدول</strong><p>نمایش منبع، تعداد رخداد و زمان آخرین مشاهده</p></div>
            <button className={cx("setting-toggle", preferences.adaptiveTables && "on")} onClick={() => update({ adaptiveTables: !preferences.adaptiveTables })}><i></i><span>{preferences.adaptiveTables ? "فعال" : "غیرفعال"}</span></button>
          </article>
        </div>
      </section>

      <section className="panel settings-panel">
        <PanelHeader title="دریافت اطلاعات" subtitle="تنظیم فاصله دریافت آخرین تغییرات" />
        <div className="settings-list">
          <article>
            <div><strong>دریافت دوره‌ای</strong><p>هنگام بازبودن صفحه، آخرین خطاها و پیگیری‌ها دریافت می‌شوند</p></div>
            <button className={cx("setting-toggle", preferences.autoRefresh && "on")} onClick={() => update({ autoRefresh: !preferences.autoRefresh })}><i></i><span>{preferences.autoRefresh ? "فعال" : "غیرفعال"}</span></button>
          </article>
          <article>
            <div><strong>فاصله تازه‌سازی</strong><p>حداقل فاصله برای جلوگیری از درخواست‌های اضافی</p></div>
            <select value={preferences.refreshSeconds} disabled={!preferences.autoRefresh} onChange={(event) => update({ refreshSeconds: Number(event.target.value) })}>
              <option value={30}>هر ۳۰ ثانیه</option>
              <option value={60}>هر ۱ دقیقه</option>
              <option value={120}>هر ۲ دقیقه</option>
            </select>
          </article>
          <article>
            <div><strong>آخرین همگام‌سازی</strong><p>{lastUpdatedAt ? `${formatDate(lastUpdatedAt, true)} · ${formatRelativeDate(lastUpdatedAt)}` : "هنوز انجام نشده"}</p></div>
            <button className="secondary-button" onClick={() => void onRefresh()}>↻ دریافت آخرین داده</button>
          </article>
        </div>
        <div className="settings-explainer">
          <span>سازگاری چیدمان با نسخه‌های بعدی</span>
          <p>بخش‌های جدید به چیدمان ذخیره‌شده اضافه می‌شوند و ترتیب فعلی شما باقی می‌ماند.</p>
        </div>
      </section>

      <section className="panel settings-panel reset-panel">
        <PanelHeader title="بازنشانی تنظیمات نمایشی" subtitle="داده‌های خطا، کاربران و سرویس‌ها حذف نمی‌شوند" />
        <div><p>تم، اندازه فونت و رفتار تازه‌سازی به حالت پیشنهادی برمی‌گردد.</p><button className="cancel-button" onClick={() => onChange(defaultPreferences)}>بازگشت به تنظیمات پیشنهادی</button></div>
      </section>
    </div>
  );
}

function BugDrawer({
  bug,
  services,
  users,
  assignees,
  followUps,
  events,
  canEdit,
  onClose,
  onUpdated,
}: {
  bug: Row;
  services: Row[];
  users: Row[];
  assignees: Row[];
  followUps: Row[];
  events: Row[];
  canEdit: boolean;
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
  const [saveError, setSaveError] = useState("");
  const [showFollowup, setShowFollowup] = useState(false);

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
              <section className="detail-grid">
                <div><span>اولین مشاهده</span><strong>{formatDate(bug.first_seen_at, true)}</strong></div>
                <div><span>آخرین مشاهده</span><strong>{formatDate(bug.last_seen_at, true)}</strong></div>
                <div><span>تعداد رخداد</span><strong>{faNumber(bug.occurrence_count)}</strong></div>
                <div><span>پیگیری بعدی</span><strong>{formatDate(bug.next_follow_up_at, true)}</strong></div>
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
                {canEdit && <button className="primary-button full-button" onClick={() => void save()} disabled={saving}>{saving ? "در حال ثبت..." : "ثبت تغییرات"}</button>}
              </section>
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
                  onCreated={async () => {
                    setShowFollowup(false);
                    await onUpdated("پیگیری جدید برنامه‌ریزی شد.");
                  }}
                />
              )}
              {followUps.map((item) => (
                <article className={cx("drawer-followup-card", item.status === "DONE" && "done")} key={String(item.id)}>
                  <span>{item.status === "DONE" ? "✓" : "◷"}</span>
                  <div><strong>{String(item.type)}</strong><p>{String(item.result || item.next_action || "در انتظار انجام")}</p><small>{String(item.owner_name)} · {formatDate(item.scheduled_at, true)}</small></div>
                </article>
              ))}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function EmailComposer({ bugId, bugCode, canEdit }: { bugId: number; bugCode: string; canEdit: boolean }) {
  const [templateKey, setTemplateKey] = useState("INCIDENT_ACTION");
  const [templates, setTemplates] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [deliveryConfigured, setDeliveryConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"DRAFT" | "QUEUE" | null>(null);
  const [mailApp, setMailApp] = useState<"outlook-classic" | "system" | "outlook-web">("outlook-classic");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  const loadTemplate = useCallback(async (key: string) => {
    setLoading(true);
    setFormError("");
    try {
      const result = await api<{
        draft: { to: string; cc: string; subject: string; body: string; templateKey: string };
        templates: Row[];
        history: Row[];
        deliveryConfigured: boolean;
      }>(`/api/bugs/${bugId}/emails?template=${encodeURIComponent(key)}`);
      setTemplateKey(result.draft.templateKey);
      setTo(result.draft.to);
      setCc(result.draft.cc);
      setSubject(result.draft.subject);
      setBody(result.draft.body);
      setTemplates(result.templates);
      setHistory(result.history);
      setDeliveryConfigured(result.deliveryConfigured);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "ساخت قالب ایمیل انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, [bugId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTemplate("INCIDENT_ACTION"), 0);
    return () => window.clearTimeout(timer);
  }, [loadTemplate]);

  const persist = async (action: "DRAFT" | "QUEUE") => {
    setSaving(action);
    setMessage("");
    setFormError("");
    try {
      const result = await api<{ email: Row; message: string }>(`/api/bugs/${bugId}/emails`, {
        method: "POST",
        body: JSON.stringify({ action, to, cc, subject, body, templateKey }),
      });
      setHistory((current) => [result.email, ...current.filter((item) => Number(item.id) !== Number(result.email.id))]);
      setMessage(result.message);
    } catch (requestError) {
      setFormError(requestError instanceof Error ? requestError.message : "ثبت ایمیل انجام نشد.");
    } finally {
      setSaving(null);
    }
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(`گیرنده: ${to}\nرونوشت: ${cc || "—"}\nموضوع: ${subject}\n\n${body}`);
      setMessage("متن کامل ایمیل کپی شد.");
    } catch {
      setFormError("کپی خودکار ممکن نشد؛ متن را به‌صورت دستی انتخاب کنید.");
    }
  };

  const downloadEml = () => {
    const bytes = new TextEncoder().encode(subject);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    const encodedSubject = `=?UTF-8?B?${window.btoa(binary)}?=`;
    const eml = [
      `To: ${to}`,
      cc.trim() ? `Cc: ${cc}` : "",
      `Subject: ${encodedSubject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body.replace(/\n/g, "\r\n"),
    ].filter((line, index) => line || index > 5).join("\r\n");
    const blob = new Blob([eml], { type: "message/rfc822;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${bugCode.replace(/[^A-Za-z0-9_-]/g, "_")}.eml`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("فایل EML آماده شد؛ فایل دانلودشده را با Outlook Classic باز کنید.");
  };

  const openMailClient = () => {
    if (!to.trim()) {
      setFormError("برای باز کردن برنامه ایمیل، حداقل یک گیرنده وارد کنید.");
      return;
    }
    setFormError("");
    if (mailApp === "outlook-classic") {
      downloadEml();
      return;
    }
    if (mailApp === "outlook-web") {
      const href = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to.replace(/\s+/g, ""))}&cc=${encodeURIComponent(cc.replace(/\s+/g, ""))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    const href = `mailto:${to.replace(/\s+/g, "")}?cc=${encodeURIComponent(cc.replace(/\s+/g, ""))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  };

  if (loading) return <div className="email-composer-loading">در حال آماده‌سازی قالب ایمیل…</div>;

  return (
    <section className="email-composer">
      <div className="email-composer-intro">
        <div><span>✉</span><div><strong>ایمیل رخداد {bugCode}</strong><p>اطلاعات اولیه از رکورد خطا تکمیل شده و قبل از ارسال قابل ویرایش است.</p></div></div>
        <span className={deliveryConfigured ? "connected" : "needs-config"}><i></i>{deliveryConfigured ? "ارسال خودکار متصل" : "ارسال خودکار تنظیم نشده"}</span>
      </div>

      <div className="template-toolbar">
        <label><span>قالب پیام</span><select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)}>{templates.map((item) => <option key={String(item.key)} value={String(item.key)}>{String(item.name)}</option>)}</select></label>
        <button className="secondary-button" onClick={() => void loadTemplate(templateKey)}>↻ بازسازی از اطلاعات خطا</button>
      </div>

      <div className="email-fields">
        <label><span>گیرندگان *</span><input value={to} onChange={(event) => setTo(event.target.value)} placeholder="name@company.com, team@company.com" dir="ltr" /></label>
        <label><span>رونوشت (CC)</span><input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="manager@company.com" dir="ltr" /></label>
        <label className="full"><span>موضوع *</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label className="full"><span>متن ایمیل *</span><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={13} /></label>
      </div>

      {message && <div className="email-message success">{message}</div>}
      {formError && <div className="email-message error">{formError}</div>}

      <div className="email-actions">
        <button className="cancel-button" onClick={() => void copyEmail()}>کپی متن</button>
        <div className="mail-app-picker">
          <select value={mailApp} onChange={(event) => setMailApp(event.target.value as typeof mailApp)} aria-label="انتخاب برنامه ایمیل">
            <option value="outlook-classic">Outlook Classic (فایل EML)</option>
            <option value="system">برنامه پیش‌فرض سیستم</option>
            <option value="outlook-web">Outlook Web</option>
          </select>
          <button className="secondary-button" onClick={openMailClient}>{mailApp === "outlook-classic" ? "آماده‌سازی برای Outlook Classic" : "باز کردن برنامه"}</button>
        </div>
        {canEdit && <button className="secondary-button" disabled={Boolean(saving)} onClick={() => void persist("DRAFT")}>{saving === "DRAFT" ? "در حال ذخیره…" : "ذخیره پیش‌نویس"}</button>}
        {canEdit && <button className="primary-button" disabled={Boolean(saving)} onClick={() => void persist("QUEUE")}>{saving === "QUEUE" ? "در حال ثبت…" : deliveryConfigured ? "ارسال ایمیل" : "ثبت در صف ارسال"}</button>}
      </div>

      <div className="email-history">
        <h3>سابقه ایمیل‌های این خطا</h3>
        {history.length ? history.map((email) => (
          <article key={String(email.id)}>
            <span className="mail-icon">✉</span>
            <div><strong>{String(email.subject)}</strong><p>{String(email.recipient || "بدون گیرنده")}</p></div>
            <EmailStatus value={String(email.status)} />
            <small>{formatDate(email.created_at, true)}</small>
          </article>
        )) : <p className="empty-email-history">هنوز پیش‌نویس یا ایمیلی برای این خطا ثبت نشده است.</p>}
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

function FollowupForm({ bugId, defaultOwner, onCreated }: { bugId: number; defaultOwner: string; onCreated: () => Promise<void> }) {
  const [type, setType] = useState("بررسی فنی");
  const [scheduledAt, setScheduledAt] = useState("");
  const [ownerName, setOwnerName] = useState(defaultOwner === "تعیین نشده" ? "" : defaultOwner);
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form className="inline-form" onSubmit={async (event) => {
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
      <label><span>نوع پیگیری</span><input value={type} onChange={(event) => setType(event.target.value)} required /></label>
      <label><span>زمان</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} required /></label>
      <label><span>مسئول</span><input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required /></label>
      <label><span>اقدام مورد انتظار</span><textarea value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label>
      <button className="primary-button small" disabled={saving}>{saving ? "در حال ثبت..." : "ثبت پیگیری"}</button>
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
  return (
    <ModalShell title="خطای جدید" subtitle="موضوع، سرویس، اولویت و زمان مشاهده را وارد کنید." onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true); setFormError("");
        const values = new FormData(event.currentTarget);
        try {
          await api("/api/bugs", {
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
    <ModalShell title="کاربر جدید" subtitle="ایمیل، تیم و سطح دسترسی کاربر را مشخص کنید." onClose={onClose}>
      <SimpleCreateForm endpoint="/api/users" onCreated={onCreated} onClose={onClose} fields={[
        { name: "fullName", label: "نام و نام خانوادگی", required: true },
        { name: "email", label: "ایمیل", required: true, type: "email" },
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

function EditUserModal({ user, isCurrentUser, onClose, onUpdated }: { user: Row; isCurrentUser: boolean; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  return (
    <ModalShell title="ویرایش کاربر" subtitle="نام کاربر در خطاها و پیگیری‌های مرتبط نیز به‌روز می‌شود." onClose={onClose}>
      <form className="modal-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setSaving(true); setFormError("");
        const values = new FormData(event.currentTarget);
        try {
          await api(`/api/users/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              fullName: values.get("fullName"),
              email: values.get("email"),
              team: values.get("team"),
              role: values.get("role"),
              isActive: values.get("isActive") === "on",
            }),
          });
          await onUpdated();
        } catch (requestError) {
          setFormError(requestError instanceof Error ? requestError.message : "ویرایش مسئول انجام نشد.");
        } finally { setSaving(false); }
      }}>
        <label><span>نام و نام خانوادگی *</span><input name="fullName" required defaultValue={String(user.full_name)} /></label>
        <label><span>ایمیل *</span><input name="email" type="email" required defaultValue={String(user.email)} /></label>
        <label><span>تیم *</span><input name="team" required defaultValue={String(user.team)} /></label>
        <label><span>نقش</span><select name="role" defaultValue={String(user.role)}><option value="OPERATOR">کارشناس</option><option value="ADMIN">مدیر سامانه</option><option value="VIEWER">مشاهده‌گر</option></select></label>
        <label className="switch-field full"><input name="isActive" type="checkbox" defaultChecked={Number(user.is_active) !== 0} /><span>این مسئول فعال باشد</span></label>
        {formError && <p className="form-error">{formError}</p>}
        <footer className="split-footer">
          <button type="button" className="danger-button" disabled={deleting || isCurrentUser} title={isCurrentUser ? "حسابی که با آن وارد شده‌اید قابل حذف نیست" : undefined} onClick={async () => {
            const confirmed = window.confirm(`حساب «${String(user.full_name)}» حذف شود؟ مسئولیت خطاهای جاری برداشته می‌شود، اما سابقه تغییرات باقی می‌ماند.`);
            if (!confirmed) return;
            setDeleting(true); setFormError("");
            try {
              await api(`/api/users/${user.id}`, { method: "DELETE" });
              await onUpdated();
            } catch (requestError) {
              setFormError(requestError instanceof Error ? requestError.message : "حذف مسئول انجام نشد.");
            } finally {
              setDeleting(false);
            }
          }}>{deleting ? "در حال حذف..." : isCurrentUser ? "حساب فعال" : "حذف حساب"}</button>
          <span></span>
          <button type="button" className="cancel-button" onClick={onClose}>انصراف</button>
          <button className="primary-button" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</button>
        </footer>
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
  return <div className="empty-state"><span>◇</span><strong>{title}</strong><p>{text}</p></div>;
}

function LoadingState() {
  return <div className="loading-state"><span></span><p>در حال دریافت اطلاعات...</p></div>;
}
