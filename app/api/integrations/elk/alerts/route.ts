import { ensureDatabase, nextBugCode } from "../../../../../db/ensure";
import { apiError, cleanText, isOneOf } from "../../../../../lib/api";

const priorities = ["P1", "P2", "P3", "P4"] as const;

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.ELK_WEBHOOK_SECRET;
    if (!configuredSecret) {
      return Response.json({ error: "کلید Webhook در تنظیمات سرور ثبت نشده است." }, { status: 503 });
    }
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (supplied !== configuredSecret) {
      return Response.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const fingerprint = cleanText(payload.fingerprint, 220);
    const title = cleanText(payload.title ?? payload.rule_name, 180);
    const serviceLabel = cleanText(payload.service, 160) || "ELK > Unknown";
    const priority = isOneOf(payload.priority, priorities) ? payload.priority : "P2";
    const now = new Date().toISOString();
    const firstSeenAt = cleanText(payload.first_seen, 40) || now;
    const lastSeenAt = cleanText(payload.last_seen, 40) || now;
    if (!fingerprint || !title) {
      return Response.json({ error: "fingerprint و title الزامی هستند." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const duplicate = await d1.prepare(`SELECT * FROM bugs
      WHERE fingerprint = ? AND status != 'CLOSED'
      ORDER BY id DESC LIMIT 1`).bind(fingerprint).first<Record<string, unknown>>();

    if (duplicate) {
      const nextStatus = duplicate.status === "RESOLVED" ? "REOPENED" : String(duplicate.status);
      const bug = await d1.prepare(`UPDATE bugs SET
        occurrence_count = occurrence_count + 1,
        last_seen_at = ?,
        status = ?,
        updated_at = ?
        WHERE id = ? RETURNING *`).bind(lastSeenAt, nextStatus, now, duplicate.id).first();
      await d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'ALERT_REPEATED', ?, 'ELK Alert', ?)")
        .bind(
          duplicate.id,
          nextStatus === "REOPENED" ? "خطا پس از رفع دوباره مشاهده و بازگشایی شد" : "هشدار مشابه دوباره مشاهده شد",
          JSON.stringify(payload),
        ).run();
      return Response.json({ bug, deduplicated: true });
    }

    const service = await d1.prepare("SELECT * FROM services WHERE path = ? OR code = ? LIMIT 1")
      .bind(serviceLabel, cleanText(payload.service_code, 24)).first<Record<string, unknown>>();
    const bugCode = await nextBugCode("ELK");
    const bug = await d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_name, source, external_alert_id, fingerprint, dashboard_url,
      occurrence_count, first_seen_at, last_seen_at, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'NEW', 'تعیین نشده', 'ELK', ?, ?, ?, 1, ?, ?, 'ELK Alert', ?, ?)
    RETURNING *`).bind(
      bugCode,
      title,
      cleanText(payload.message, 4000),
      service?.id ?? null,
      service?.path ?? serviceLabel,
      priority,
      cleanText(payload.alert_id, 180) || null,
      fingerprint,
      cleanText(payload.dashboard_url, 800) || null,
      firstSeenAt,
      lastSeenAt,
      now,
      now,
    ).first<Record<string, unknown>>();

    const queue = [
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'BUG_CREATED', ?, 'ELK Alert', ?)")
        .bind(bug?.id, "خطا به‌صورت خودکار از ELK ساخته شد", JSON.stringify(payload)),
    ];
    if (priority === "P1" && service?.manager_email) {
      queue.push(
        d1.prepare("INSERT INTO email_queue (bug_id, recipient, subject, template) VALUES (?, ?, ?, 'P1_ALERT')")
          .bind(bug?.id, service.manager_email, `[P1][${bugCode}] ${title}`),
      );
    }
    await d1.batch(queue);
    return Response.json({ bug, deduplicated: false }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
