import { getRawDb, type LocalD1Database } from "./index";
import { importBugReport } from "./import-bug-report";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    username TEXT,
    role TEXT NOT NULL DEFAULT 'OPERATOR',
    team TEXT NOT NULL DEFAULT 'عملیات',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    path TEXT NOT NULL,
    team TEXT NOT NULL,
    manager_email TEXT NOT NULL DEFAULT '',
    alert_email TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS daily_counters (
    day TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS bugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    service_id INTEGER REFERENCES services(id),
    service_label TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'P3',
    status TEXT NOT NULL DEFAULT 'NEW',
    owner_id INTEGER REFERENCES users(id),
    owner_name TEXT NOT NULL DEFAULT 'تعیین نشده',
    source TEXT NOT NULL DEFAULT 'MANUAL',
    external_alert_id TEXT,
    fingerprint TEXT,
    dashboard_url TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    next_follow_up_at TEXT,
    resolved_at TEXT,
    closed_at TEXT,
    created_by TEXT NOT NULL DEFAULT 'سامانه',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS bug_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id INTEGER NOT NULL REFERENCES bugs(id),
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS follow_ups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id INTEGER NOT NULL REFERENCES bugs(id),
    type TEXT NOT NULL DEFAULT 'بررسی فنی',
    scheduled_at TEXT NOT NULL,
    completed_at TEXT,
    owner_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    result TEXT NOT NULL DEFAULT '',
    next_action TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS bug_assignees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id INTEGER NOT NULL REFERENCES bugs(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    assigned_by TEXT NOT NULL DEFAULT 'سامانه',
    assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bug_id, user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id INTEGER NOT NULL REFERENCES bugs(id),
    body TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS bug_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id INTEGER NOT NULL REFERENCES bugs(id),
    event_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    actor TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS email_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bug_id INTEGER REFERENCES bugs(id),
    recipient TEXT NOT NULL,
    cc TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL,
    template TEXT NOT NULL,
    body_text TEXT NOT NULL DEFAULT '',
    prepared_by TEXT NOT NULL DEFAULT 'سامانه',
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    before_value TEXT,
    after_value TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    batch_key TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    imported_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL DEFAULT '{}',
    updated_by TEXT NOT NULL DEFAULT 'سامانه',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS user_credentials (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `INSERT OR IGNORE INTO app_settings (setting_key, value_json, updated_by)
    VALUES ('main', '{}', 'سامانه')`,
  "CREATE INDEX IF NOT EXISTS bugs_status_idx ON bugs(status)",
  "CREATE INDEX IF NOT EXISTS bugs_priority_idx ON bugs(priority)",
  "CREATE INDEX IF NOT EXISTS bugs_fingerprint_idx ON bugs(fingerprint)",
  "CREATE INDEX IF NOT EXISTS bugs_next_follow_up_idx ON bugs(next_follow_up_at)",
  "CREATE INDEX IF NOT EXISTS bug_attachments_bug_idx ON bug_attachments(bug_id)",
  "CREATE INDEX IF NOT EXISTS follow_ups_bug_idx ON follow_ups(bug_id)",
  "CREATE INDEX IF NOT EXISTS follow_ups_schedule_idx ON follow_ups(scheduled_at)",
  "CREATE INDEX IF NOT EXISTS bug_assignees_bug_idx ON bug_assignees(bug_id)",
  "CREATE INDEX IF NOT EXISTS bug_assignees_user_idx ON bug_assignees(user_id)",
  "CREATE INDEX IF NOT EXISTS bug_events_bug_idx ON bug_events(bug_id)",
  "CREATE INDEX IF NOT EXISTS email_queue_status_idx ON email_queue(status)",
  "CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id)",
];

const indexStatements = [
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx
    ON users(username COLLATE NOCASE)
    WHERE username IS NOT NULL AND username <> ''`,
];

let initialized = false;
let initializationPromise: Promise<ReturnType<typeof getRawDb>> | null = null;

export async function ensureDatabase() {
  if (initialized) return getRawDb();
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const d1 = getRawDb();
    await d1.batch(schemaStatements.map((statement) => d1.prepare(statement)));
    const userColumns = (await d1.prepare("PRAGMA table_info(users)").all<Record<string, unknown>>()).results;
    if (!userColumns.some((column) => String(column.name) === "username")) {
      await d1.prepare("ALTER TABLE users ADD COLUMN username TEXT").run();
    }
    await d1.batch(indexStatements.map((statement) => d1.prepare(statement)));
    if (process.env.SEED_DEMO_DATA === "true") {
      await seedDatabase(d1);
    }
    if (process.env.IMPORT_BUNDLED_REPORT === "true") {
      await importBugReport(d1);
    }
    if (process.env.LOAD_DEFAULT_SERVICE_CATALOG !== "false") {
      await synchronizeEditableCatalog(d1);
    }
    initialized = true;
    return d1;
  })();

  try {
    return await initializationPromise;
  } catch (error) {
    initializationPromise = null;
    throw error;
  }
}

const requestedServices = [
  ["ACTM", "Activity_main"],
  ["AUTOR", "AutoReserve_main"],
  ["BUS", "Bus"],
  ["CIPM", "CIP_main"],
  ["CLUB", "Club"],
  ["DRA", "DomesticRails"],
  ["ESIM", "ESim"],
  ["FLT", "Flight"],
  ["GLM", "Global_main"],
  ["HTL", "Hotel"],
  ["INSM", "Insurance_main"],
  ["INST", "Installment"],
  ["OTH", "others"],
  ["PARTOA", "Parto Activity"],
  ["PARTO200", "Parto Activity 200"],
  ["RAI", "Rail"],
  ["RA400", "Rail Api 400 Range"],
  ["RAR200", "Rail Api Request 200"],
  ["REVREQ", "Reversal Requests"],
  ["SEL", "Selected"],
  ["USERM", "User_main"],
  ["VISAM", "Visa_main"],
] as const;

async function synchronizeEditableCatalog(d1: LocalD1Database) {
  const statements = [
    d1.prepare(`INSERT OR IGNORE INTO bug_assignees (bug_id, user_id, assigned_by)
      SELECT id, owner_id, 'مهاجرت خودکار' FROM bugs WHERE owner_id IS NOT NULL`),
  ];
  const demoUsersCleanupKey = "remove-demo-users:v1";
  const demoUsersCleanupApplied = await d1
    .prepare("SELECT batch_key FROM import_batches WHERE batch_key = ?")
    .bind(demoUsersCleanupKey)
    .first();
  if (!demoUsersCleanupApplied) {
    const demoEmails = [
      "mahdi.ahmadi@example.com",
      "sara.mohammadi@example.com",
      "ali.rezaei@example.com",
      "viewer@example.com",
    ];
    const placeholders = demoEmails.map(() => "?").join(",");
    statements.push(
      d1.prepare(`UPDATE bugs
        SET owner_id = NULL, owner_name = 'تعیین نشده', updated_at = CURRENT_TIMESTAMP
        WHERE owner_id IN (SELECT id FROM users WHERE lower(email) IN (${placeholders}))`)
        .bind(...demoEmails),
      d1.prepare(`DELETE FROM bug_assignees
        WHERE user_id IN (SELECT id FROM users WHERE lower(email) IN (${placeholders}))`)
        .bind(...demoEmails),
      d1.prepare(`UPDATE follow_ups
        SET owner_name = 'تعیین نشده'
        WHERE status = 'SCHEDULED'
          AND owner_name IN ('مهدی احمدی', 'سارا محمدی', 'علی رضایی', 'ناظر سامانه')`),
      d1.prepare(`INSERT INTO audit_logs (
        entity_type, entity_id, action, actor, before_value, after_value
      ) VALUES ('USER', 'DEMO_ACCOUNTS', 'PURGE_DEMO_USERS', 'به‌روزرسانی سامانه', ?, ?)`)
        .bind(JSON.stringify({ emails: demoEmails }), JSON.stringify({ deleted: demoEmails.length })),
      d1.prepare(`DELETE FROM users WHERE lower(email) IN (${placeholders})`).bind(...demoEmails),
      d1.prepare("INSERT INTO import_batches (batch_key, source_name, imported_count) VALUES (?, ?, ?)")
        .bind(demoUsersCleanupKey, "حذف حساب‌های آزمایشی", demoEmails.length),
    );
  }
  const catalogKey = "requested-service-catalog:v1";
  const alreadyApplied = await d1.prepare("SELECT batch_key FROM import_batches WHERE batch_key = ?").bind(catalogKey).first();
  if (!alreadyApplied) {
    statements.push(...requestedServices.map(([code, name]) =>
      d1.prepare(`INSERT INTO services (
        name, code, path, team, manager_email, alert_email, is_active
      ) VALUES (?, ?, ?, 'عملیات و مانیتورینگ', '', '', 1)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
      is_active = 1`).bind(name, code, name),
    ));
    statements.push(...requestedServices.map(([code, name]) =>
      d1.prepare(`UPDATE bugs SET service_label = ?, updated_at = CURRENT_TIMESTAMP
        WHERE service_id = (SELECT id FROM services WHERE code = ? LIMIT 1)`).bind(name, code),
    ));
    statements.push(
      d1.prepare("INSERT INTO import_batches (batch_key, source_name, imported_count) VALUES (?, ?, ?)")
        .bind(catalogKey, "فهرست سرویس‌های استاندارد", requestedServices.length),
    );
  }
  await d1.batch(statements);
}

async function seedDatabase(d1: LocalD1Database) {
  const existing = await d1.prepare("SELECT COUNT(*) AS count FROM services").first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;

  await d1.batch([
    d1.prepare("INSERT INTO teams (name, code) VALUES (?, ?)").bind("عملیات و مانیتورینگ", "OPS"),
    d1.prepare("INSERT INTO teams (name, code) VALUES (?, ?)").bind("پرداخت", "PAY"),
    d1.prepare("INSERT INTO teams (name, code) VALUES (?, ?)").bind("زیرساخت", "INFRA"),
    d1.prepare("INSERT INTO users (full_name, email, role, team) VALUES (?, ?, ?, ?)").bind("مهدی احمدی", "mahdi.ahmadi@example.com", "ADMIN", "عملیات و مانیتورینگ"),
    d1.prepare("INSERT INTO users (full_name, email, role, team) VALUES (?, ?, ?, ?)").bind("سارا محمدی", "sara.mohammadi@example.com", "OPERATOR", "پرداخت"),
    d1.prepare("INSERT INTO users (full_name, email, role, team) VALUES (?, ?, ?, ?)").bind("علی رضایی", "ali.rezaei@example.com", "OPERATOR", "زیرساخت"),
    d1.prepare("INSERT INTO users (full_name, email, role, team) VALUES (?, ?, ?, ?)").bind("ناظر سامانه", "viewer@example.com", "VIEWER", "مدیریت"),
    d1.prepare("INSERT INTO services (name, code, path, team, manager_email, alert_email) VALUES (?, ?, ?, ?, ?, ?)").bind("پرداخت", "PAY", "ELK > Pay", "پرداخت", "pay-manager@example.com", "pay-alerts@example.com"),
    d1.prepare("INSERT INTO services (name, code, path, team, manager_email, alert_email) VALUES (?, ?, ?, ?, ?, ?)").bind("درگاه API", "API", "ELK > API Gateway", "زیرساخت", "infra-manager@example.com", "api-alerts@example.com"),
    d1.prepare("INSERT INTO services (name, code, path, team, manager_email, alert_email) VALUES (?, ?, ?, ?, ?, ?)").bind("احراز هویت", "AUTH", "ELK > Auth", "زیرساخت", "infra-manager@example.com", "auth-alerts@example.com"),
    d1.prepare("INSERT INTO services (name, code, path, team, manager_email, alert_email) VALUES (?, ?, ?, ?, ?, ?)").bind("گزارش‌گیری", "REPORT", "ELK > Reports", "عملیات و مانیتورینگ", "ops-manager@example.com", "reports-alerts@example.com"),
  ]);

  await d1.batch([
    d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_id, owner_name, source, fingerprint, occurrence_count, first_seen_at,
      last_seen_at, next_follow_up_at, resolved_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      "ELK-260618-01",
      "بررسی وضعیت داده‌های داشبورد Gateway Payment",
      "عدم تطابق داده‌ی نمودار تراکنش‌های موفق با خروجی سرویس پرداخت بررسی و اصلاح شد.",
      "ELK > Pay",
      "P1",
      "RESOLVED",
      "سارا محمدی",
      "ELK",
      "gateway-payment:dashboard-data",
      7,
      "2026-06-18T07:40:00Z",
      "2026-06-18T09:18:00Z",
      "2026-06-27T06:00:00Z",
      "2026-06-20T12:10:00Z",
      "ELK Alert",
      "2026-06-18T07:42:00Z",
      "2026-06-20T12:10:00Z",
    ),
    d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_id, owner_name, source, fingerprint, occurrence_count, first_seen_at,
      last_seen_at, next_follow_up_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 2, ?, ?, ?, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      "ELK-260724-02",
      "افزایش نرخ پاسخ‌های 502 در API Gateway",
      "نرخ خطای مسیر /checkout در منطقه‌ی اصلی از حد پایه عبور کرده است.",
      "ELK > API Gateway",
      "P1",
      "IN_PROGRESS",
      "علی رضایی",
      "ELK",
      "api-gateway:502:checkout",
      43,
      "2026-07-24T08:16:00Z",
      "2026-07-26T16:30:00Z",
      "2026-07-26T18:30:00Z",
      "ELK Alert",
      "2026-07-24T08:17:00Z",
      "2026-07-26T16:30:00Z",
    ),
    d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_id, owner_name, source, fingerprint, occurrence_count, first_seen_at,
      last_seen_at, next_follow_up_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 3, ?, ?, ?, 3, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      "ELK-260725-01",
      "کندی احراز هویت در ساعات پرترافیک",
      "صدک ۹۵ زمان پاسخ Login بالاتر از ۱.۸ ثانیه ثبت شده است.",
      "ELK > Auth",
      "P2",
      "NEW",
      "علی رضایی",
      "ELK",
      "auth:p95-latency",
      16,
      "2026-07-25T14:05:00Z",
      "2026-07-26T15:54:00Z",
      "2026-07-27T07:30:00Z",
      "ELK Alert",
      "2026-07-25T14:07:00Z",
      "2026-07-26T15:54:00Z",
    ),
    d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_id, owner_name, source, occurrence_count, first_seen_at, last_seen_at,
      next_follow_up_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 4, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      "ELK-260723-03",
      "تاخیر در به‌روزرسانی گزارش روزانه فروش",
      "Job تجمیع گزارش با حدود ۲۲ دقیقه تاخیر اجرا شده است.",
      "ELK > Reports",
      "P3",
      "IN_PROGRESS",
      "مهدی احمدی",
      "MANUAL",
      1,
      "2026-07-23T05:30:00Z",
      "2026-07-23T05:30:00Z",
      "2026-07-28T06:00:00Z",
      "مهدی احمدی",
      "2026-07-23T06:00:00Z",
      "2026-07-25T09:20:00Z",
    ),
  ]);

  await d1.batch([
    d1.prepare("INSERT INTO follow_ups (bug_id, type, scheduled_at, completed_at, owner_name, status, result, next_action) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(1, "کنترل داده", "2026-06-20T06:00:00Z", "2026-06-20T12:10:00Z", "سارا محمدی", "DONE", "داده‌ی Dashboard با منبع اصلی تطبیق دارد.", "کنترل عدم تکرار در یک هفته"),
    d1.prepare("INSERT INTO follow_ups (bug_id, type, scheduled_at, owner_name, status, next_action) VALUES (?, ?, ?, ?, ?, ?)").bind(1, "کنترل عدم تکرار", "2026-06-27T06:00:00Z", "سارا محمدی", "SCHEDULED", "در صورت عدم تکرار، بستن خطا"),
    d1.prepare("INSERT INTO follow_ups (bug_id, type, scheduled_at, owner_name, status, next_action) VALUES (?, ?, ?, ?, ?, ?)").bind(2, "بررسی فنی", "2026-07-26T18:30:00Z", "علی رضایی", "SCHEDULED", "مقایسه با آخرین Deployment"),
    d1.prepare("INSERT INTO follow_ups (bug_id, type, scheduled_at, owner_name, status, next_action) VALUES (?, ?, ?, ?, ?, ?)").bind(3, "تحلیل ظرفیت", "2026-07-27T07:30:00Z", "علی رضایی", "SCHEDULED", "بررسی تعداد Connectionها در پیک"),
    d1.prepare("INSERT INTO follow_ups (bug_id, type, scheduled_at, owner_name, status, next_action) VALUES (?, ?, ?, ?, ?, ?)").bind(4, "بررسی زمان‌بندی Job", "2026-07-28T06:00:00Z", "مهدی احمدی", "SCHEDULED", "کنترل اجرای سه روز متوالی"),
    d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, created_at) VALUES (?, ?, ?, ?, ?)").bind(1, "BUG_CREATED", "خطا از هشدار ELK ساخته شد", "ELK Alert", "2026-06-18T07:42:00Z"),
    d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, created_at) VALUES (?, ?, ?, ?, ?)").bind(1, "STATUS_CHANGED", "وضعیت به RESOLVED تغییر کرد", "سارا محمدی", "2026-06-20T12:10:00Z"),
    d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, created_at) VALUES (?, ?, ?, ?, ?)").bind(2, "BUG_CREATED", "افزایش خطای 502 توسط Rule شناسایی شد", "ELK Alert", "2026-07-24T08:17:00Z"),
    d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, created_at) VALUES (?, ?, ?, ?, ?)").bind(2, "ALERT_REPEATED", "هشدار ۴۳ بار تکرار شده است", "ELK Alert", "2026-07-26T16:30:00Z"),
    d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, created_at) VALUES (?, ?, ?, ?, ?)").bind(3, "BUG_CREATED", "کندی سرویس احراز هویت ثبت شد", "ELK Alert", "2026-07-25T14:07:00Z"),
  ]);
}

const bugPrefixAliases: Record<string, string> = {
  flight: "FLT",
  flt: "FLT",
  hotel: "HTL",
  htl: "HTL",
  visa: "VSA",
  vsa: "VSA",
  visa_main: "VSA",
  visam: "VSA",
  payment: "PAY",
  pay: "PAY",
  pmt: "PAY",
  "elk > pay": "PAY",
  "reversal requests": "PAY",
  revreq: "PAY",
  insurance: "INS",
  ins: "INS",
  insurance_main: "INS",
  insm: "INS",
  rail: "RAI",
  rai: "RAI",
  domesticrails: "RAI",
  dra: "RAI",
  bus: "BUS",
  parto: "PAR",
  "parto activity": "PAR",
  "parto activity 200": "PAR",
  partoa: "PAR",
  parto200: "PAR",
  keykoja: "KJ",
  "key koja": "KJ",
  kj: "KJ",
  key: "KJ",
  elk: "ELK",
  api: "API",
  website: "WEB",
  web: "WEB",
  "mobile app": "APP",
  app: "APP",
  global: "GLB",
  global_main: "GLB",
  glm: "GLB",
  whitelabel: "WHL",
  pickreward: "PCK",
  cip: "CIP",
  cip_main: "CIP",
  cipm: "CIP",
};

function normalizedPrefix(value: unknown) {
  const text = String(value ?? "").trim();
  const alias = bugPrefixAliases[text.toLowerCase()];
  if (alias) return alias;
  const safe = text.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return safe || "ELK";
}

export function bugPrefixForService(service?: Record<string, unknown> | null) {
  if (!service) return "ELK";
  for (const candidate of [service.path, service.name, service.code]) {
    const text = String(candidate ?? "").trim();
    if (!text) continue;
    const alias = bugPrefixAliases[text.toLowerCase()];
    if (alias) return alias;
  }
  return normalizedPrefix(service.code ?? service.path ?? service.name);
}

export async function nextBugCode(prefix = "ELK") {
  const d1 = await ensureDatabase();
  const safePrefix = normalizedPrefix(prefix);
  const now = new Date();
  const day = `${String(now.getUTCFullYear()).slice(-2)}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
  // Counter key includes the service prefix. This matches the Excel pattern:
  // FLT-YYMMDD-01 and HTL-YYMMDD-01 can both exist on the same day.
  const counterKey = `${safePrefix}-${day}`;
  const counter = await d1
    .prepare(`INSERT INTO daily_counters (day, value) VALUES (?, 1)
      ON CONFLICT(day) DO UPDATE SET value = value + 1
      RETURNING value`)
    .bind(counterKey)
    .first<{ value: number }>();

  return `${safePrefix}-${day}-${String(counter?.value ?? 1).padStart(2, "0")}`;
}
