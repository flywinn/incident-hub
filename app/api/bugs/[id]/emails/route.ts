import { ensureDatabase } from "../../../../../db/ensure";
import { apiError, cleanText } from "../../../../../lib/api";
import { authorizeRequest } from "../../../../../lib/auth";

const templateNames: Record<string, string> = {
  INCIDENT_SHORT: "اطلاع‌رسانی کوتاه",
  INCIDENT_ACTION: "درخواست بررسی رسمی",
};

function faHour(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(date);
}

function humanizeService(value: unknown) {
  return String(value ?? "سرویس مربوطه")
    .replace(/^ELK\s*>\s*/i, "")
    .replace(/_main$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function extractErrorLabel(bug: Record<string, unknown>) {
  const source = `${bug.title ?? ""} ${bug.description ?? ""}`;
  const match = source.match(/\b([45]\d{2})\b/);
  return match ? `خطای ${match[1]}` : "خطا";
}

function uniqueEmails(values: unknown[]) {
  const emails = values
    .flatMap((value) => String(value ?? "").split(/[،,;\s]+/))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@") && !value.endsWith("@internal.local") && !value.endsWith("@example.com"));
  return [...new Set(emails)];
}

function buildDraft(bug: Record<string, unknown>, recipients: string[], templateKey: string) {
  const service = humanizeService(bug.service_label);
  const hour = faHour(bug.first_seen_at);
  const error = extractErrorLabel(bug);
  const incident = `به اطلاع می‌رساند از حوالی ساعت ${hour}، در سرویس ${service} ${error} مشاهده شده و عملکرد سرویس با اختلال مواجه است.`;
  const request = "خواهشمند است دستور فرمایید موضوع در اسرع وقت بررسی شده و نتیجه بررسی، علت بروز خطا و اقدامات اصلاحی انجام‌شده اعلام شود.";
  const paragraphs = templateKey === "INCIDENT_SHORT"
    ? ["با سلام و احترام،", incident, "با تشکر و احترام"]
    : ["با سلام و احترام،", incident, request, "با تشکر و احترام"];

  return {
    to: recipients.join(", "),
    cc: "",
    subject: `[${String(bug.bug_code)}] اعلام اختلال سرویس ${service}`,
    body: paragraphs.join("\n\n"),
    templateKey,
    templateName: templateNames[templateKey],
  };
}

async function loadEmailContext(d1: D1Database, bugId: number) {
  const bug = await d1.prepare(`SELECT b.*, s.manager_email, s.alert_email
    FROM bugs b LEFT JOIN services s ON s.id = b.service_id
    WHERE b.id = ?`).bind(bugId).first<Record<string, unknown>>();
  if (!bug) return null;
  const assignees = (await d1.prepare(`SELECT u.email
    FROM bug_assignees ba JOIN users u ON u.id = ba.user_id
    WHERE ba.bug_id = ? AND u.is_active = 1`).bind(bugId).all<Record<string, unknown>>()).results;
  const recipients = uniqueEmails([
    bug.manager_email,
    bug.alert_email,
    ...assignees.map((item) => item.email),
  ]);
  return { bug, recipients };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    const d1 = await ensureDatabase();
    const emailContext = await loadEmailContext(d1, bugId);
    if (!emailContext) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const requestedTemplate = new URL(request.url).searchParams.get("template") ?? "INCIDENT_ACTION";
    const templateKey = requestedTemplate in templateNames ? requestedTemplate : "INCIDENT_ACTION";
    const history = (await d1.prepare("SELECT * FROM email_queue WHERE bug_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(bugId).all()).results;

    return Response.json({
      draft: buildDraft(emailContext.bug, emailContext.recipients, templateKey),
      templates: Object.entries(templateNames).map(([key, name]) => ({ key, name })),
      history,
      deliveryConfigured: Boolean(process.env.EMAIL_WEBHOOK_URL),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = payload.action === "QUEUE" ? "QUEUE" : "DRAFT";
    const recipient = cleanText(payload.to, 1000);
    const cc = cleanText(payload.cc, 1000);
    const subject = cleanText(payload.subject, 300);
    const body = cleanText(payload.body, 12000);
    const requestedTemplateKey =
      typeof payload.templateKey === "string" ? payload.templateKey : "";

    const template = Object.prototype.hasOwnProperty.call(
      templateNames,
      requestedTemplateKey,
    )
      ? requestedTemplateKey
      : "INCIDENT_ACTION";
    if (!subject || !body || (action === "QUEUE" && !uniqueEmails([recipient]).length)) {
      return Response.json({ error: "گیرنده، عنوان و متن ایمیل برای ارسال الزامی هستند." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const emailContext = await loadEmailContext(d1, bugId);
    if (!emailContext) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });
    const actor = auth.user.fullName;
    const initialStatus = action === "DRAFT" ? "DRAFT" : "PENDING";
    let email = await d1.prepare(`INSERT INTO email_queue (
      bug_id, recipient, cc, subject, template, body_text, prepared_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(
      bugId, recipient, cc, subject, template, body, actor, initialStatus,
    ).first<Record<string, unknown>>();
    if (!email) {
      return Response.json(
        { error: "ثبت ایمیل در پایگاه داده ناموفق بود." },
        { status: 500 },
      );
    }

    const emailId = Number(email.id);

    await d1.batch([
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, ?, ?, ?, ?)").bind(
        bugId,
        action === "DRAFT" ? "EMAIL_DRAFTED" : "EMAIL_QUEUED",
        action === "DRAFT" ? "پیش‌نویس ایمیل ذخیره شد" : "ایمیل در صف ارسال ثبت شد",
        actor,
        JSON.stringify({ emailId: email?.id, recipient, subject, template }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('EMAIL', ?, ?, ?, ?)").bind(
        String(email?.id),
        action,
        actor,
        JSON.stringify(email),
      ),
    ]);

    let deliveryMessage = action === "DRAFT" ? "پیش‌نویس ذخیره شد." : "ایمیل در صف ارسال ثبت شد.";
    if (action === "QUEUE" && process.env.EMAIL_WEBHOOK_URL && email) {
      try {
        const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(process.env.EMAIL_WEBHOOK_SECRET
              ? { authorization: `Bearer ${process.env.EMAIL_WEBHOOK_SECRET}` }
              : {}),
          },
          body: JSON.stringify({
            to: uniqueEmails([recipient]),
            cc: uniqueEmails([cc]),
            subject,
            body,
            bugCode: emailContext.bug.bug_code,
            bugId,
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        email = await d1.prepare("UPDATE email_queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, attempts = attempts + 1 WHERE id = ? RETURNING *")
          .bind(emailId).first<Record<string, unknown>>();
        await d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'EMAIL_SENT', ?, ?, ?)")
          .bind(bugId, "ایمیل از کانال متصل‌شده ارسال شد", actor, JSON.stringify({ emailId: email?.id, recipient })).run();
        deliveryMessage = "ایمیل با موفقیت ارسال شد.";
      } catch (deliveryError) {
        const message = deliveryError instanceof Error ? deliveryError.message : "خطای کانال ارسال";
        email = await d1.prepare("UPDATE email_queue SET status = 'FAILED', attempts = attempts + 1, last_error = ? WHERE id = ? RETURNING *")
          .bind(message, emailId).first<Record<string, unknown>>();
        deliveryMessage = "ایمیل ذخیره شد، اما کانال ارسال با خطا روبه‌رو شد.";
      }
    } else if (action === "QUEUE" && !process.env.EMAIL_WEBHOOK_URL) {
      deliveryMessage = "ایمیل آماده و در صف ذخیره شد؛ برای ارسال خودکار باید کانال ایمیل متصل شود.";
    }

    return Response.json({ email, message: deliveryMessage }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
