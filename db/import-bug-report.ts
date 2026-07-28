type ImportRow = {
  bugCode: string;
  originalBugCode?: string;
  registeredAt: string;
  title: string;
  service: string;
  priority: "P1" | "P2" | "P3" | "P4";
  status: "NEW" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  followUp2?: string;
  followUp3?: string;
  recipients?: string;
  notes?: string;
  fixedAt?: string;
};

const BATCH_KEY = "bug-report(1).xlsx:issues-a1-k26:v3-status-and-id-normalized";

const importedUsers = [
  { fullName: "Abuzar Gashtasebi", email: "abuzar.gashtasebi@internal.local", team: "عملیات و مانیتورینگ" },
  { fullName: "Arezou Kazazi", email: "arezou.kazazi@internal.local", team: "محصول" },
  { fullName: "Nikoo Asadnejad", email: "nikoo.asadnejad@internal.local", team: "محصول" },
  { fullName: "Ali Sahebi", email: "ali.sahebi@internal.local", team: "عملیات و مانیتورینگ" },
  { fullName: "Amin Nazari", email: "amin.nazari@internal.local", team: "زیرساخت" },
  { fullName: "Mahdi Alimohammadi", email: "mahdi.alimohammadi@internal.local", team: "زیرساخت" },
  { fullName: "h.hatamian", email: "h.hatamian@internal.local", team: "محصول" },
  { fullName: "Amirhossein Sanei", email: "amirhossein.sanei@internal.local", team: "محصول" },
  { fullName: "yademellat", email: "yademellat@internal.local", team: "عملیات" },
] as const;

const serviceDefinitions = [
  { path: "ELK > Pay", code: "PAY", name: "پرداخت", team: "پرداخت" },
  { path: "ELK > Visa", code: "VISA", name: "ویزا", team: "عملیات" },
  { path: "Hotel", code: "HTL", name: "هتل", team: "محصول" },
  { path: "Keykoja", code: "KEY", name: "کی‌کجا", team: "محصول" },
  { path: "Flight", code: "FLT", name: "پرواز", team: "محصول" },
  { path: "Whitelabel", code: "WHL", name: "وایت‌لیبل", team: "محصول" },
  { path: "PickReward", code: "PCK", name: "PickReward", team: "محصول" },
  { path: "General > FlyToday", code: "GEN", name: "عمومی فلای‌تودی", team: "عملیات" },
  { path: "Rail-Bus", code: "RB", name: "قطار و اتوبوس", team: "محصول" },
  { path: "Payment", code: "PMT", name: "پرداخت عمومی", team: "پرداخت" },
  { path: "Rail", code: "RAI", name: "قطار", team: "محصول" },
  { path: "Bus", code: "BUS", name: "اتوبوس", team: "محصول" },
  { path: "CIP", code: "CIP", name: "CIP", team: "محصول" },
] as const;

const rows: ImportRow[] = [
  {
    bugCode: "ELK-260618-01",
    registeredAt: "1405/03/28",
    title: "بررسی وضعیت داده‌های داشبورد Gateway Payment",
    service: "ELK > Pay",
    priority: "P1",
    status: "RESOLVED",
    followUp2: "1405/03/30",
    followUp3: "1405/04/06",
    recipients: "Abuzar Gashtasebi; Arezou Kazazi",
  },
  {
    bugCode: "VSA-260620-01",
    registeredAt: "1405/03/30",
    title: "مشکل نمایش لاگ‌های Visa در ELK",
    service: "ELK > Visa",
    priority: "P3",
    status: "RESOLVED",
    recipients: "Abuzar Gashtasebi; Arezou Kazazi; Nikoo Asadnejad; Ali Sahebi",
  },
  {
    bugCode: "HTL-260620-01",
    registeredAt: "1405/03/30",
    title: "مشکل هدایت در بخش‌های صفحه مشخصات هتل",
    service: "Hotel",
    priority: "P3",
    status: "RESOLVED",
    recipients: "Arezou Kazazi",
    notes: "اعلام شده تا تاریخ 4/16 رفع می‌شود.",
  },
  {
    bugCode: "HTL-260620-02",
    registeredAt: "1405/03/30",
    title: "مشکل نمایش تصاویر هتل در نتایج جستجو",
    service: "Hotel",
    priority: "P3",
    status: "RESOLVED",
    recipients: "Arezou Kazazi",
    fixedAt: "1405/04/02",
  },
  {
    bugCode: "KEY-260621-01",
    registeredAt: "1405/03/31",
    title: "خطای 500 در سرویس کی‌کجا",
    service: "Keykoja",
    priority: "P1",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi; Amin Nazari; Mahdi Alimohammadi",
  },
  {
    bugCode: "FLT-260621-01",
    registeredAt: "1405/03/31",
    title: "خطاهای 502 در سرویس Flight",
    service: "Flight",
    priority: "P1",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi; Amin Nazari; Mahdi Alimohammadi; h.hatamian",
  },
  {
    bugCode: "WHL-260621-01",
    originalBugCode: "ELK-260618-01",
    registeredAt: "1405/03/31",
    title: "Whitelabel: FlightDestinia 5xx Errors",
    service: "Whitelabel",
    priority: "P3",
    status: "RESOLVED",
    followUp2: "1405/04/06",
    followUp3: "1405/04/07",
    recipients: "Amin Nazari; Mahdi Alimohammadi; Abuzar Gashtasebi",
  },
  {
    bugCode: "PCK-260622-01",
    registeredAt: "1405/04/01",
    title: "PickReward",
    service: "PickReward",
    priority: "P2",
    status: "RESOLVED",
    recipients: "Abuzar Gashtasebi; Arezou Kazazi",
  },
  {
    bugCode: "FLT-260623-01",
    registeredAt: "1405/04/02",
    title: "نمایش پرواز داخلی FlyTodayIR.com",
    service: "Flight",
    priority: "P2",
    status: "RESOLVED",
    recipients: "Abuzar Gashtasebi; Arezou Kazazi; Amirhossein Sanei",
  },
  {
    bugCode: "FLT-260625-03",
    registeredAt: "1405/04/04",
    title: "خطای 500 در بخش‌های فلای‌تودی",
    service: "General > FlyToday",
    priority: "P3",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi; Amin Nazari; Mahdi Alimohammadi",
  },
  {
    bugCode: "HTL-260628-01",
    registeredAt: "1405/04/07",
    title: "خطای 500 در هتل",
    service: "Hotel",
    priority: "P3",
    status: "RESOLVED",
  },
  {
    bugCode: "FLT-260625-01",
    registeredAt: "1405/04/07",
    title: "خطاهای 500 SearchPopularPrices",
    service: "Flight",
    priority: "P1",
    status: "RESOLVED",
    fixedAt: "1405/04/07",
  },
  {
    bugCode: "RAI-260701-01",
    registeredAt: "1405/04/10",
    title: "عدم هدایت به فیلدهای ناقص در فرایند خرید",
    service: "Rail-Bus",
    priority: "P3",
    status: "RESOLVED",
    followUp2: "1405/04/16",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
  {
    bugCode: "PAY-260701-01",
    registeredAt: "1405/04/10",
    title: "ReversalRequest over 20",
    service: "Payment",
    priority: "P2",
    status: "RESOLVED",
    followUp2: "1405/04/10",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
  {
    bugCode: "RAI-260701-02",
    registeredAt: "1405/04/10",
    title: "اختلال در صدور بلیت قطار",
    service: "Rail",
    priority: "P2",
    status: "RESOLVED",
    recipients: "Abuzar Gashtasebi; Arezou Kazazi; Nikoo Asadnejad",
  },
  {
    bugCode: "BUS-260707-01",
    registeredAt: "1405/04/16",
    title: "هدایت به صفحه 404 در بخش مسیرهای پرتردد اتوبوس",
    service: "Bus",
    priority: "P2",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
  {
    bugCode: "ELK-260618-02",
    registeredAt: "1405/04/20",
    title: "عدم نمایش دیتا در پنل Gateway Payment",
    service: "ELK > Pay",
    priority: "P1",
    status: "RESOLVED",
    followUp2: "1405/04/21",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
    fixedAt: "1405/04/21",
  },
  {
    bugCode: "FLT-260625-02",
    registeredAt: "1405/04/21",
    title: "اختلال در جستجوی پرواز فلای‌تودی",
    service: "Flight",
    priority: "P1",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
    fixedAt: "1405/04/21",
  },
  {
    bugCode: "FLT-260714-01",
    registeredAt: "1405/04/23",
    title: "خطا در جستجوی پرواز تهران",
    service: "Flight",
    priority: "P2",
    status: "NEW",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi; h.hatamian",
  },
  {
    bugCode: "HTL-260719-01",
    registeredAt: "1405/04/28",
    title: "عدم تطابق تعداد نظرات نمایش‌داده‌شده",
    service: "Hotel",
    priority: "P3",
    status: "NEW",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
  {
    bugCode: "HTL-260719-02",
    registeredAt: "1405/04/28",
    title: "خطای 400 در سرویس ثبت اقامتگاه (Hotel Contract)",
    service: "Hotel",
    priority: "P2",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
  {
    bugCode: "PAY-260725-01",
    registeredAt: "1405/05/03",
    title: "خطای 500 در Endpoint /api/V1/wallets/2/balance",
    service: "Payment",
    priority: "P2",
    status: "IN_PROGRESS",
    followUp2: "1405/05/04",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
  {
    bugCode: "RAI-260725-01",
    registeredAt: "1405/05/03",
    title: "خطای 599 در سرویس Rail",
    service: "Rail",
    priority: "P2",
    status: "RESOLVED",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi; Nikoo Asadnejad",
    fixedAt: "1405/05/04",
  },
  {
    bugCode: "CIP-260725-01",
    registeredAt: "1405/05/03",
    title: "خطای 500 در CIP",
    service: "CIP",
    priority: "P2",
    status: "NEW",
    followUp2: "1405/05/04",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi; yademellat",
  },
  {
    bugCode: "HTL-260725-01",
    registeredAt: "1405/05/03",
    title: "عدم نمایش عکس اتاق در بخش هتل ir.com",
    service: "Hotel",
    priority: "P2",
    status: "IN_PROGRESS",
    followUp2: "1405/05/04",
    recipients: "Arezou Kazazi; Abuzar Gashtasebi",
  },
];

function persianDateToIso(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("/").map(Number);
  if (year !== 1405 || !month || !day) {
    throw new Error(`Unsupported Persian date in bug import: ${value}`);
  }

  const monthLengths = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];
  const daysBeforeMonth = monthLengths
    .slice(0, month - 1)
    .reduce((sum, length) => sum + length, 0);
  const timestamp = Date.UTC(2026, 2, 21) + (daysBeforeMonth + day - 1) * 86_400_000;
  return new Date(timestamp).toISOString();
}

function firstRecipient(value?: string) {
  return value?.split(";").map((name) => name.trim()).find(Boolean) ?? "تعیین نشده";
}

function descriptionFor(row: ImportRow) {
  const parts = ["واردشده از فایل bug-report(1).xlsx."];
  if (row.originalBugCode) {
    parts.push(`شناسه تکراری اولیه در فایل: ${row.originalBugCode}.`);
  }
  if (row.recipients) {
    parts.push(`ارسال‌شده به: ${row.recipients}.`);
  }
  if (row.notes) {
    parts.push(`توضیحات: ${row.notes}`);
  }
  if (row.fixedAt) {
    parts.push(`تاریخ رفع ثبت‌شده: ${row.fixedAt}.`);
  }
  return parts.join(" ");
}

export async function importBugReport(d1: D1Database) {
  await d1.prepare(`CREATE TABLE IF NOT EXISTS import_batches (
    batch_key TEXT PRIMARY KEY,
    source_name TEXT NOT NULL,
    imported_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  const imported = await d1
    .prepare("SELECT batch_key FROM import_batches WHERE batch_key = ?")
    .bind(BATCH_KEY)
    .first();
  if (imported) return;

  // Remove the three starter-only demo incidents so operational metrics are
  // based on the uploaded report rather than synthetic examples.
  for (const demoCode of ["ELK-260724-02", "ELK-260725-01", "ELK-260723-03"]) {
    const demo = await d1
      .prepare("SELECT id FROM bugs WHERE bug_code = ?")
      .bind(demoCode)
      .first<{ id: number }>();
    if (!demo) continue;
    await d1.batch([
      d1.prepare("DELETE FROM follow_ups WHERE bug_id = ?").bind(demo.id),
      d1.prepare("DELETE FROM comments WHERE bug_id = ?").bind(demo.id),
      d1.prepare("DELETE FROM bug_events WHERE bug_id = ?").bind(demo.id),
      d1.prepare("DELETE FROM email_queue WHERE bug_id = ?").bind(demo.id),
      d1.prepare("DELETE FROM audit_logs WHERE entity_type = 'BUG' AND entity_id = ?").bind(String(demo.id)),
      d1.prepare("DELETE FROM bugs WHERE id = ?").bind(demo.id),
    ]);
  }

  await d1.batch(
    importedUsers.map((user) =>
      d1.prepare(`INSERT OR IGNORE INTO users
        (full_name, email, role, team, is_active)
        VALUES (?, ?, 'OPERATOR', ?, 1)`)
        .bind(user.fullName, user.email, user.team),
    ),
  );

  await d1.batch(
    serviceDefinitions.map((service) =>
      d1.prepare(`INSERT OR IGNORE INTO services
        (name, code, path, team, manager_email, alert_email)
        VALUES (?, ?, ?, ?, '', '')`)
        .bind(service.name, service.code, service.path, service.team),
    ),
  );

  for (const row of rows) {
    const service = await d1
      .prepare("SELECT id FROM services WHERE lower(path) = lower(?) LIMIT 1")
      .bind(row.service)
      .first<{ id: number }>();
    const registeredAt = persianDateToIso(row.registeredAt)!;
    const ownerName = firstRecipient(row.recipients);
    const owner = ownerName === "تعیین نشده"
      ? null
      : await d1
        .prepare("SELECT id FROM users WHERE lower(full_name) = lower(?) LIMIT 1")
        .bind(ownerName)
        .first<{ id: number }>();
    const followUpDates = [row.followUp2, row.followUp3].filter(Boolean) as string[];
    const nextFollowUpAt = row.status === "RESOLVED"
      ? null
      : persianDateToIso(followUpDates[0]);
    const resolvedAt = row.status === "RESOLVED"
      ? persianDateToIso(row.fixedAt)
      : null;

    await d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_id, owner_name, source, occurrence_count, first_seen_at, last_seen_at,
      next_follow_up_at, resolved_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SPREADSHEET', 1, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(bug_code) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      service_id = excluded.service_id,
      service_label = excluded.service_label,
      priority = excluded.priority,
      status = excluded.status,
      owner_id = excluded.owner_id,
      owner_name = excluded.owner_name,
      source = excluded.source,
      first_seen_at = excluded.first_seen_at,
      last_seen_at = excluded.last_seen_at,
      next_follow_up_at = excluded.next_follow_up_at,
      resolved_at = COALESCE(excluded.resolved_at, bugs.resolved_at),
      updated_at = excluded.updated_at`)
      .bind(
        row.bugCode,
        row.title,
        descriptionFor(row),
        service?.id ?? null,
        row.service,
        row.priority,
        row.status,
        owner?.id ?? null,
        ownerName,
        registeredAt,
        registeredAt,
        nextFollowUpAt,
        resolvedAt,
        "Import bug-report(1).xlsx",
        registeredAt,
        registeredAt,
      )
      .run();

    const bug = await d1
      .prepare("SELECT id FROM bugs WHERE bug_code = ?")
      .bind(row.bugCode)
      .first<{ id: number }>();
    if (!bug) throw new Error(`Imported bug was not found: ${row.bugCode}`);

    for (const [index, followUpDate] of followUpDates.entries()) {
      const scheduledAt = persianDateToIso(followUpDate)!;
      const type = `پیگیری ${index + 2} فایل Excel`;
      const existingFollowUp = await d1.prepare(
        "SELECT id FROM follow_ups WHERE bug_id = ? AND type = ? AND scheduled_at = ?",
      ).bind(bug.id, type, scheduledAt).first();
      if (!existingFollowUp) {
        const isDone = row.status === "RESOLVED" || row.status === "CLOSED";
        await d1.prepare(`INSERT INTO follow_ups
          (bug_id, type, scheduled_at, completed_at, owner_name, status, result, next_action)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(
            bug.id,
            type,
            scheduledAt,
            isDone ? scheduledAt : null,
            firstRecipient(row.recipients),
            isDone ? "DONE" : "SCHEDULED",
            isDone ? "پیگیری تاریخی، واردشده از فایل Excel" : "",
            row.notes ?? "",
          )
          .run();
      }
    }

    const existingEvent = await d1.prepare(
      "SELECT id FROM bug_events WHERE bug_id = ? AND event_type = 'SPREADSHEET_IMPORTED'",
    ).bind(bug.id).first();
    if (!existingEvent) {
      await d1.batch([
        d1.prepare(`INSERT INTO bug_events
          (bug_id, event_type, summary, actor, metadata, created_at)
          VALUES (?, 'SPREADSHEET_IMPORTED', ?, 'Import Service', ?, ?)`)
          .bind(
            bug.id,
            "رکورد از فایل bug-report(1).xlsx وارد شد",
            JSON.stringify({
              registeredAt: row.registeredAt,
              originalBugCode: row.originalBugCode ?? row.bugCode,
            }),
            registeredAt,
          ),
        d1.prepare(`INSERT INTO audit_logs
          (entity_type, entity_id, action, actor, after_value, created_at)
          VALUES ('BUG', ?, 'IMPORT', 'Import Service', ?, ?)`)
          .bind(String(bug.id), JSON.stringify(row), registeredAt),
      ]);
    }
  }

  await d1.prepare(`INSERT INTO import_batches
    (batch_key, source_name, imported_count) VALUES (?, ?, ?)`)
    .bind(BATCH_KEY, "bug-report(1).xlsx", rows.length)
    .run();
}

export const bugReportImportCount = rows.length;
