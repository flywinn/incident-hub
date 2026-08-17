import { ensureDatabase } from "../../../../../db/ensure";
import { apiError, cleanText } from "../../../../../lib/api";
import { authorizeRequest } from "../../../../../lib/auth";
import {
  buildSmartEmailDraft,
  recommendedSmartEmailTemplate,
  smartEmailTemplates,
  toSmartEmailTemplate,
} from "../../../../../lib/email-intelligence";
import { MAX_EMAIL_INLINE_IMAGE_BYTES } from "../../../../../lib/incident-images";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "../../../../../lib/settings";

function safeHeaderText(value: unknown, max: number) {
  return cleanText(value, max).replace(/[\r\n]+/g, " ").trim();
}

function emailLooksDeliverable(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && !email.endsWith("@internal.local")
    && !email.endsWith("@example.com");
}

function uniqueEmails(values: unknown[]) {
  const emails = values
    .flatMap((value) => String(value ?? "").split(/[،,;\s]+/))
    .map((value) => value.trim().toLowerCase())
    .filter(emailLooksDeliverable);
  return [...new Set(emails)];
}

function normalizeRecipientHeaders(toValue: unknown, ccValue: unknown) {
  const to = uniqueEmails([toValue]);
  const toSet = new Set(to);
  const cc = uniqueEmails([ccValue]).filter((email) => !toSet.has(email));
  return { to, cc };
}

type EmailImageMode = "ATTACH" | "INLINE";
type EmailImageSelection = { id: number; mode: EmailImageMode };

function parseImageSelections(payload: Record<string, unknown>): EmailImageSelection[] {
  const explicit = Array.isArray(payload.imageSelections)
    ? payload.imageSelections
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const row = value as Record<string, unknown>;
          const id = Number(row.id);
          const mode = String(row.mode ?? "ATTACH").toUpperCase();
          if (!Number.isInteger(id) || id <= 0 || !["ATTACH", "INLINE"].includes(mode)) return null;
          return { id, mode: mode as EmailImageMode };
        })
        .filter((value): value is EmailImageSelection => Boolean(value))
    : [];

  const fallback = !explicit.length && Array.isArray(payload.attachmentIds)
    ? payload.attachmentIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
        .map((id) => ({ id, mode: "ATTACH" as const }))
    : [];

  const unique = new Map<number, EmailImageMode>();
  for (const item of explicit.length ? explicit : fallback) unique.set(item.id, item.mode);
  return [...unique.entries()].map(([id, mode]) => ({ id, mode }));
}

async function loadMainSettings(d1: D1Database) {
  const row = await d1.prepare("SELECT value_json FROM app_settings WHERE setting_key = 'main'").first<{ value_json: string }>();
  if (!row?.value_json) return DEFAULT_APP_SETTINGS;
  try { return normalizeAppSettings(JSON.parse(row.value_json)); } catch { return DEFAULT_APP_SETTINGS; }
}

async function loadEmailContext(d1: D1Database, bugId: number) {
  const bug = await d1.prepare(`SELECT b.*, s.manager_email, s.alert_email
    FROM bugs b LEFT JOIN services s ON s.id = b.service_id
    WHERE b.id = ?`).bind(bugId).first<Record<string, unknown>>();
  if (!bug) return null;

  const [assigneesResult, attachmentsResult, latestFollowUp] = await Promise.all([
    d1.prepare(`SELECT DISTINCT u.id, u.full_name, u.username, u.email
      FROM users u
      WHERE u.is_active = 1
        AND (
          u.id IN (SELECT user_id FROM bug_assignees WHERE bug_id = ?)
          OR u.id = (SELECT owner_id FROM bugs WHERE id = ?)
        )
      ORDER BY u.full_name, u.id`).bind(bugId, bugId).all<Record<string, unknown>>(),
    d1.prepare(`SELECT id, bug_id, original_name, mime_type, size_bytes, created_at
      FROM bug_attachments WHERE bug_id = ? ORDER BY created_at, id`).bind(bugId).all<Record<string, unknown>>(),
    d1.prepare(`SELECT id, type, status, owner_name, result, scheduled_at, completed_at
      FROM follow_ups WHERE bug_id = ? ORDER BY COALESCE(completed_at, scheduled_at, created_at) DESC, id DESC LIMIT 1`)
      .bind(bugId).first<Record<string, unknown>>(),
  ]);

  const assigneeDetails = assigneesResult.results.map((item) => ({
    id: Number(item.id),
    name: String(item.full_name ?? ""),
    username: String(item.username ?? ""),
    email: String(item.email ?? "").trim().toLowerCase(),
    deliverable: emailLooksDeliverable(item.email),
  }));
  const assigneeEmails = uniqueEmails(assigneeDetails.filter((item) => item.deliverable).map((item) => item.email));
  const serviceEmails = uniqueEmails([bug.manager_email, bug.alert_email]);
  const recipients = uniqueEmails([...assigneeEmails, ...serviceEmails]);

  return {
    bug,
    recipients,
    assigneeEmails,
    assigneeDetails,
    serviceEmails,
    attachments: attachmentsResult.results,
    latestFollowUp,
  };
}

function isSystemGeneratedEmail(row: Record<string, unknown>) {
  return ["BUG_ASSIGNED", "P1_ALERT"].includes(String(row.template ?? ""));
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
    if (!Number.isInteger(bugId) || bugId <= 0) {
      return Response.json({ error: "شناسه خطا معتبر نیست." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const [emailContext, settings] = await Promise.all([
      loadEmailContext(d1, bugId),
      loadMainSettings(d1),
    ]);
    if (!emailContext) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const allHistory = (await d1.prepare("SELECT * FROM email_queue WHERE bug_id = ? ORDER BY created_at DESC LIMIT 50")
      .bind(bugId).all<Record<string, unknown>>()).results;
    const history = allHistory.filter((row) => !isSystemGeneratedEmail(row)).slice(0, 20);
    const recommended = recommendedSmartEmailTemplate(emailContext.bug, { historyCount: history.length });
    const requestedTemplate = new URL(request.url).searchParams.get("template");
    const templateKey = requestedTemplate === "AUTO"
      ? recommended
      : toSmartEmailTemplate(requestedTemplate, recommended);

    const draft = buildSmartEmailDraft(
      emailContext.bug,
      emailContext.recipients,
      templateKey,
      emailContext.attachments,
      emailContext.latestFollowUp,
      {
        historyCount: history.length,
        defaultCc: settings.email.defaultCc,
        lastEmailAt: history[0]?.created_at,
      },
    );
    const normalized = normalizeRecipientHeaders(draft.to, draft.cc);
    const missingAssigneeEmails = emailContext.assigneeDetails
      .filter((item) => !item.deliverable)
      .map((item) => item.name || item.username || `User #${item.id}`);

    return Response.json({
      draft: {
        ...draft,
        to: normalized.to.join(", "),
        cc: normalized.cc.join(", "),
      },
      recipientDefaults: {
        assignees: emailContext.assigneeEmails,
        service: emailContext.serviceEmails,
        cc: normalized.cc,
      },
      recipientDetails: {
        assignees: emailContext.assigneeDetails,
        missingAssigneeEmails,
      },
      attachments: emailContext.attachments.map((item) => ({
        ...item,
        url: `/api/bug-attachments/${item.id}`,
        defaultMode: "ATTACH",
      })),
      maxEmailImageBytes: MAX_EMAIL_INLINE_IMAGE_BYTES,
      maxInlineImageBytes: MAX_EMAIL_INLINE_IMAGE_BYTES,
      templates: Object.entries(smartEmailTemplates).map(([key, item]) => ({
        key,
        name: item.name,
        description: item.description,
        recommended: key === recommended,
      })),
      history,
      deliveryConfigured: Boolean(process.env.EMAIL_WEBHOOK_URL),
    });
  } catch (error) {
    return apiError(error, request);
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
    if (!Number.isInteger(bugId) || bugId <= 0) {
      return Response.json({ error: "شناسه خطا معتبر نیست." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const action = payload.action === "QUEUE" ? "QUEUE" : "DRAFT";
    const rawRecipient = safeHeaderText(payload.to, 1000);
    const rawCc = safeHeaderText(payload.cc, 1000);
    const normalizedHeaders = normalizeRecipientHeaders(rawRecipient, rawCc);
    const recipient = normalizedHeaders.to.join(", ");
    const cc = normalizedHeaders.cc.join(", ");
    const subject = safeHeaderText(payload.subject, 300);
    const body = cleanText(payload.body, 12000);
    const template = toSmartEmailTemplate(payload.templateKey, "TECHNICAL_INCIDENT");
    const imageSelections = parseImageSelections(payload);

    if (!subject || !body || (action === "QUEUE" && !normalizedHeaders.to.length)) {
      return Response.json({ error: "گیرنده، عنوان و متن ایمیل برای ارسال الزامی هستند." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const emailContext = await loadEmailContext(d1, bugId);
    if (!emailContext) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const availableById = new Map(emailContext.attachments.map((item) => [Number(item.id), item]));
    const selectedAttachments = imageSelections
      .map((selection) => {
        const row = availableById.get(selection.id);
        return row ? { ...row, emailMode: selection.mode } : null;
      })
      .filter(Boolean) as (Record<string, unknown> & { emailMode: EmailImageMode })[];

    if (selectedAttachments.length !== imageSelections.length) {
      return Response.json({ error: "یک یا چند تصویر انتخاب‌شده متعلق به این رخداد نیست." }, { status: 400 });
    }

    const selectedBytes = selectedAttachments.reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0);
    if (selectedBytes > MAX_EMAIL_INLINE_IMAGE_BYTES) {
      return Response.json({ error: "حجم مجموع تصاویر انتخاب‌شده برای ایمیل بیشتر از حد مجاز است." }, { status: 400 });
    }

    const actor = auth.user.fullName;
    const initialStatus = action === "DRAFT" ? "DRAFT" : "PENDING";
    let email = await d1.prepare(`INSERT INTO email_queue (
      bug_id, recipient, cc, subject, template, body_text, prepared_by, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(
      bugId, recipient, cc, subject, template, body, actor, initialStatus,
    ).first<Record<string, unknown>>();

    if (!email) {
      return Response.json({ error: "ثبت ایمیل در پایگاه داده ناموفق بود." }, { status: 500 });
    }
    const emailId = Number(email.id);

    const imageAudit = imageSelections.map((item) => ({ id: item.id, mode: item.mode }));
    await d1.batch([
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, ?, ?, ?, ?)").bind(
        bugId,
        action === "DRAFT" ? "EMAIL_DRAFTED" : "EMAIL_QUEUED",
        action === "DRAFT" ? "پیش‌نویس ایمیل ذخیره شد" : "ایمیل در صف ارسال ثبت شد",
        actor,
        JSON.stringify({ emailId, recipient, cc, subject, template, imageSelections: imageAudit }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('EMAIL', ?, ?, ?, ?)").bind(
        String(emailId),
        action,
        actor,
        JSON.stringify({ ...email, imageSelections: imageAudit }),
      ),
    ]);

    let deliveryMessage = action === "DRAFT" ? "پیش‌نویس ذخیره شد." : "ایمیل در صف ارسال ثبت شد.";
    if (action === "QUEUE" && process.env.EMAIL_WEBHOOK_URL) {
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
            to: normalizedHeaders.to,
            cc: normalizedHeaders.cc,
            subject,
            body,
            bugCode: emailContext.bug.bug_code,
            bugId,
            attachments: selectedAttachments.map((item) => ({
              id: Number(item.id),
              filename: String(item.original_name),
              mimeType: String(item.mime_type),
              sizeBytes: Number(item.size_bytes),
              inline: item.emailMode === "INLINE",
              mode: item.emailMode,
            })),
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        email = await d1.prepare("UPDATE email_queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, attempts = attempts + 1 WHERE id = ? RETURNING *")
          .bind(emailId).first<Record<string, unknown>>();
        await d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'EMAIL_SENT', ?, ?, ?)")
          .bind(bugId, "ایمیل از کانال متصل‌شده ارسال شد", actor, JSON.stringify({ emailId, recipient, cc })).run();
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
    return apiError(error, request);
  }
}
