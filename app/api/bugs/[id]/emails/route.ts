import { ensureDatabase } from "../../../../../db/ensure";
import { apiError, cleanText } from "../../../../../lib/api";
import { authorizeRequest } from "../../../../../lib/auth";
import { MAX_EMAIL_INLINE_IMAGE_BYTES } from "../../../../../lib/incident-images";

const templateDefinitions = {
  INCIDENT_ACTION: {
    name: "درخواست بررسی رسمی",
    description: "اعلام رسمی اختلال و درخواست نتیجه، علت و اقدامات اصلاحی",
  },
  INCIDENT_SHORT: {
    name: "اطلاع‌رسانی کوتاه",
    description: "پیام کوتاه برای اطلاع سریع تیم مسئول",
  },
  API_ENDPOINT_ERROR: {
    name: "خطای API و مسیرهای درگیر",
    description: "مناسب خطاهای 4xx/5xx که یک یا چند Endpoint درگیر دارند",
  },
  HIGH_VOLUME_ERROR: {
    name: "خطای پرتکرار یا حجمی",
    description: "برای رخدادهایی با تعداد خطای زیاد یا تکرار قابل‌توجه",
  },
  UI_DISPLAY_ISSUE: {
    name: "ایراد نمایشی یا محتوایی",
    description: "برای مشکل تصویر، نظر، متن، صفحه یا مغایرت داده نمایشی",
  },
  FOLLOW_UP_PENDING: {
    name: "پیگیری مجدد و درخواست آخرین وضعیت",
    description: "برای موردی که همچنان مشاهده می‌شود یا منتظر پاسخ است",
  },
  RESOLUTION_RCA: {
    name: "تأیید رفع و درخواست RCA",
    description: "پس از رفع مشکل برای دریافت علت ریشه‌ای و اقدامات پیشگیرانه",
  },
  STATUS_UPDATE: {
    name: "درخواست گزارش وضعیت",
    description: "درخواست وضعیت فعلی، اقدام انجام‌شده و زمان‌بندی مرحله بعد",
  },
} as const;

type TemplateKey = keyof typeof templateDefinitions;

const statusLabels: Record<string, string> = {
  NEW: "جدید",
  IN_PROGRESS: "در حال پیگیری",
  WAITING: "منتظر پاسخ",
  RESOLVED: "رفع‌شده",
  CLOSED: "بسته‌شده",
  REOPENED: "بازگشایی‌شده",
};

function normalizeDigits(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
}

function faHour(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(date);
}

function faDateTime(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(date);
}

function safeHeaderText(value: unknown, max: number) {
  return cleanText(value, max).replace(/[\r\n]+/g, " ").trim();
}

function humanizeService(value: unknown) {
  return String(value ?? "سرویس مربوطه")
    .replace(/^ELK\s*>\s*/i, "")
    .replace(/_main$/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function sourceText(bug: Record<string, unknown>) {
  return `${bug.title ?? ""}\n${bug.description ?? ""}`.trim();
}

function extractErrorLabel(bug: Record<string, unknown>) {
  const match = normalizeDigits(sourceText(bug)).match(/\b([45]\d{2}|599)\b/);
  return match ? `خطای ${match[1]}` : "خطا";
}

function extractEndpoints(bug: Record<string, unknown>) {
  const matches = sourceText(bug).match(/\/(?:api|gateway|v\d+|[A-Za-z0-9._~-]+)(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%{}\-]+)*/gi) ?? [];
  return [...new Set(matches.map((item) => item.replace(/[،,.;:]+$/g, "").trim()).filter(Boolean))].slice(0, 10);
}

function extractObservedCount(bug: Record<string, unknown>) {
  const normalized = normalizeDigits(sourceText(bug));
  const explicit = normalized.match(/(?:تعداد\s*)?(\d{2,7})\s*(?:مورد\s*)?(?:خطا|error)/i);
  if (explicit) return Number(explicit[1]);
  const occurrence = Number(bug.occurrence_count ?? 0);
  return Number.isFinite(occurrence) && occurrence > 1 ? occurrence : null;
}

function incidentType(bug: Record<string, unknown>, endpoints: string[]) {
  const text = sourceText(bug).toLowerCase();
  if (/عکس|تصویر|نمایش|نظرات|مطابقت|صفحه|رابط|ui|content/.test(text)) return "ایراد نمایشی یا محتوایی";
  if (endpoints.length) return "اختلال API یا Endpoint";
  if (/کند|timeout|زمان پاسخ|latency/.test(text)) return "افت کارایی";
  return "اختلال سرویس";
}

function recommendedTemplateKey(bug: Record<string, unknown>): TemplateKey {
  const status = String(bug.status ?? "NEW");
  const endpoints = extractEndpoints(bug);
  const count = extractObservedCount(bug);
  const type = incidentType(bug, endpoints);

  if (status === "RESOLVED" || status === "CLOSED") return "RESOLUTION_RCA";
  if (status === "IN_PROGRESS" || status === "WAITING" || status === "REOPENED") return "FOLLOW_UP_PENDING";
  if (count && count >= 20) return "HIGH_VOLUME_ERROR";
  if (type === "ایراد نمایشی یا محتوایی") return "UI_DISPLAY_ISSUE";
  if (endpoints.length) return "API_ENDPOINT_ERROR";
  return "INCIDENT_ACTION";
}

function toTemplateKey(value: unknown, fallback: TemplateKey): TemplateKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(templateDefinitions, value)
    ? value as TemplateKey
    : fallback;
}

function uniqueEmails(values: unknown[]) {
  const emails = values
    .flatMap((value) => String(value ?? "").split(/[،,;\s]+/))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.includes("@") && !value.endsWith("@internal.local") && !value.endsWith("@example.com"));
  return [...new Set(emails)];
}

function listBlock(title: string, items: string[]) {
  return items.length ? `${title}\n${items.map((item) => `- ${item}`).join("\n")}` : "";
}

function buildDraft(
  bug: Record<string, unknown>,
  recipients: string[],
  templateKey: TemplateKey,
  attachments: Record<string, unknown>[],
  latestFollowUp: Record<string, unknown> | null,
) {
  const service = humanizeService(bug.service_label);
  const hour = faHour(bug.first_seen_at);
  const error = extractErrorLabel(bug);
  const endpoints = extractEndpoints(bug);
  const observedCount = extractObservedCount(bug);
  const type = incidentType(bug, endpoints);
  const status = statusLabels[String(bug.status ?? "NEW")] ?? String(bug.status ?? "نامشخص");
  const priority = String(bug.priority ?? "نامشخص");
  const bugCode = String(bug.bug_code ?? "");
  const title = String(bug.title ?? "رخداد ثبت‌شده").trim();
  const description = String(bug.description ?? "").trim();
  const endpointBlock = listBlock("مسیرهای درگیر:", endpoints);
  const evidenceBlock = attachments.length
    ? `شواهد تصویری: ${attachments.length.toLocaleString("fa-IR")} تصویر برای این رخداد ثبت شده است و تصاویر منتخب در خروجی Outlook Classic داخل ایمیل قرار می‌گیرند.`
    : "";
  const latestFollowUpBlock = latestFollowUp
    ? [
        "آخرین پیگیری ثبت‌شده:",
        `- نوع: ${String(latestFollowUp.type ?? "پیگیری")}`,
        `- وضعیت: ${String(latestFollowUp.status ?? "نامشخص")}`,
        latestFollowUp.owner_name ? `- مسئول: ${String(latestFollowUp.owner_name)}` : "",
        latestFollowUp.result ? `- نتیجه: ${String(latestFollowUp.result)}` : "",
        latestFollowUp.scheduled_at ? `- زمان: ${faDateTime(latestFollowUp.scheduled_at)}` : "",
      ].filter(Boolean).join("\n")
    : "";
  const referenceBlock = [
    `شناسه رخداد: ${bugCode}`,
    `اولویت: ${priority}`,
    `وضعیت فعلی: ${status}`,
    `اولین مشاهده: ${faDateTime(bug.first_seen_at)}`,
    `آخرین مشاهده: ${faDateTime(bug.last_seen_at)}`,
  ].join("\n");
  const closing = "با تشکر و احترام.";

  const commonIncident = `به اطلاع می‌رساند از حوالی ساعت ${hour}، در سرویس ${service} ${error} مشاهده شده و عملکرد سرویس نیازمند بررسی است.`;
  const formalRequest = "خواهشمند است دستور فرمایید موضوع در اسرع وقت بررسی شده و نتیجه بررسی، علت بروز خطا، دامنه اثر و اقدامات اصلاحی انجام‌شده اعلام شود.";

  let subject = `[${bugCode}] اعلام اختلال سرویس ${service}`;
  let paragraphs: string[] = [];

  switch (templateKey) {
    case "INCIDENT_SHORT":
      paragraphs = ["با سلام و احترام،", commonIncident, endpointBlock, evidenceBlock, referenceBlock, closing];
      break;
    case "API_ENDPOINT_ERROR":
      subject = `[${bugCode}] ${error} در Endpointهای سرویس ${service}`;
      paragraphs = [
        "با سلام و احترام،",
        commonIncident,
        endpointBlock || "مسیر درگیر در شرح رخداد ثبت نشده است.",
        description ? `شرح تکمیلی:\n${description}` : "",
        evidenceBlock,
        latestFollowUpBlock,
        "خواهشمند است علت فنی، دامنه اثر، اقدام اصلاحی و زمان تقریبی رفع اعلام شود.",
        referenceBlock,
        closing,
      ];
      break;
    case "HIGH_VOLUME_ERROR":
      subject = `[${bugCode}] افزایش تعداد ${error} در سرویس ${service}`;
      paragraphs = [
        "با سلام و احترام،",
        `در پایش سرویس ${service}${observedCount ? `، تعداد ${observedCount.toLocaleString("fa-IR")} رخداد خطا` : "، تکرار قابل‌توجه خطا"} مشاهده شده است.`,
        endpointBlock,
        description ? `شرح تکمیلی:\n${description}` : "",
        evidenceBlock,
        latestFollowUpBlock,
        "لطفاً علت افزایش خطا، میزان اثر بر کاربران، اقدام فوری انجام‌شده و برنامه جلوگیری از تکرار اعلام شود.",
        referenceBlock,
        closing,
      ];
      break;
    case "UI_DISPLAY_ISSUE":
      subject = `[${bugCode}] بررسی ایراد نمایشی در ${service}`;
      paragraphs = [
        "با سلام و احترام،",
        `در بررسی‌های انجام‌شده، موردی در بخش نمایش اطلاعات سرویس ${service} مشاهده شده است که نیازمند بررسی می‌باشد.`,
        `موضوع: ${title}`,
        description ? `شرح مشاهده:\n${description}` : "",
        evidenceBlock,
        latestFollowUpBlock,
        "خواهشمند است دامنه اثر، علت بروز مشکل و نتیجه یا اقدامات انجام‌شده در این خصوص اطلاع‌رسانی شود.",
        referenceBlock,
        closing,
      ];
      break;
    case "FOLLOW_UP_PENDING":
      subject = `[پیگیری][${bugCode}] درخواست آخرین وضعیت ${service}`;
      paragraphs = [
        "با سلام و احترام،",
        `پیرو بررسی‌های انجام‌شده درباره «${title}»، به اطلاع می‌رساند این مورد همچنان در وضعیت «${status}» قرار دارد و نیازمند پیگیری است.`,
        endpointBlock,
        description ? `آخرین شرح ثبت‌شده:\n${description}` : "",
        latestFollowUpBlock,
        evidenceBlock,
        "خواهشمند است موضوع مجدداً بررسی شده و آخرین وضعیت، اقدام انجام‌شده، مانع فعلی و زمان‌بندی مرحله بعد اعلام گردد.",
        referenceBlock,
        "پیشاپیش از پیگیری و همکاری شما سپاسگزاریم.",
      ];
      break;
    case "RESOLUTION_RCA":
      subject = `[${bugCode}] تأیید رفع و درخواست گزارش علت ریشه‌ای`;
      paragraphs = [
        "با سلام و احترام،",
        `طبق آخرین وضعیت ثبت‌شده، رخداد «${title}» در سرویس ${service} رفع یا بسته شده است.`,
        endpointBlock,
        latestFollowUpBlock,
        evidenceBlock,
        "خواهشمند است نتیجه نهایی، علت ریشه‌ای بروز مشکل (RCA)، اقدامات اصلاحی انجام‌شده و اقدامات پیشگیرانه برای جلوگیری از تکرار اعلام شود.",
        referenceBlock,
        closing,
      ];
      break;
    case "STATUS_UPDATE":
      subject = `[${bugCode}] درخواست گزارش وضعیت رخداد ${service}`;
      paragraphs = [
        "با سلام و احترام،",
        `خواهشمند است آخرین وضعیت رخداد «${title}» در سرویس ${service} اعلام شود.`,
        "لطفاً اقدام انجام‌شده، نتیجه فعلی، مانع احتمالی، مسئول مرحله بعد و زمان تقریبی تعیین تکلیف را نیز اعلام فرمایید.",
        endpointBlock,
        latestFollowUpBlock,
        evidenceBlock,
        referenceBlock,
        closing,
      ];
      break;
    case "INCIDENT_ACTION":
    default:
      paragraphs = [
        "با سلام و احترام،",
        commonIncident,
        endpointBlock,
        description ? `شرح تکمیلی:\n${description}` : "",
        latestFollowUpBlock,
        evidenceBlock,
        formalRequest,
        referenceBlock,
        closing,
      ];
      break;
  }

  return {
    to: recipients.join(", "),
    cc: "",
    subject,
    body: paragraphs.filter(Boolean).join("\n\n"),
    templateKey,
    templateName: templateDefinitions[templateKey].name,
    recommendedTemplateKey: recommendedTemplateKey(bug),
    context: {
      status,
      priority,
      incidentType: type,
      errorLabel: error,
      endpoints,
      observedCount,
      service,
      firstSeen: faDateTime(bug.first_seen_at),
      lastSeen: faDateTime(bug.last_seen_at),
      attachmentCount: attachments.length,
      latestFollowUp: latestFollowUp ? {
        type: String(latestFollowUp.type ?? "پیگیری"),
        status: String(latestFollowUp.status ?? "نامشخص"),
        owner: String(latestFollowUp.owner_name ?? ""),
        result: String(latestFollowUp.result ?? ""),
        scheduledAt: latestFollowUp.scheduled_at ? faDateTime(latestFollowUp.scheduled_at) : "",
      } : null,
    },
  };
}

async function loadEmailContext(d1: D1Database, bugId: number) {
  const bug = await d1.prepare(`SELECT b.*, s.manager_email, s.alert_email
    FROM bugs b LEFT JOIN services s ON s.id = b.service_id
    WHERE b.id = ?`).bind(bugId).first<Record<string, unknown>>();
  if (!bug) return null;

  const [assigneesResult, attachmentsResult, latestFollowUp] = await Promise.all([
    d1.prepare(`SELECT u.email
      FROM bug_assignees ba JOIN users u ON u.id = ba.user_id
      WHERE ba.bug_id = ? AND u.is_active = 1`).bind(bugId).all<Record<string, unknown>>(),
    d1.prepare(`SELECT id, bug_id, original_name, mime_type, size_bytes, created_at
      FROM bug_attachments WHERE bug_id = ? ORDER BY created_at, id`).bind(bugId).all<Record<string, unknown>>(),
    d1.prepare(`SELECT id, type, status, owner_name, result, scheduled_at, completed_at
      FROM follow_ups WHERE bug_id = ? ORDER BY COALESCE(completed_at, scheduled_at, created_at) DESC, id DESC LIMIT 1`)
      .bind(bugId).first<Record<string, unknown>>(),
  ]);

  const recipients = uniqueEmails([
    bug.manager_email,
    bug.alert_email,
    ...assigneesResult.results.map((item) => item.email),
  ]);

  return {
    bug,
    recipients,
    attachments: attachmentsResult.results,
    latestFollowUp,
  };
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
    const emailContext = await loadEmailContext(d1, bugId);
    if (!emailContext) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const recommended = recommendedTemplateKey(emailContext.bug);
    const requestedTemplate = new URL(request.url).searchParams.get("template");
    const templateKey = requestedTemplate === "AUTO"
      ? recommended
      : toTemplateKey(requestedTemplate, recommended);
    const history = (await d1.prepare("SELECT * FROM email_queue WHERE bug_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(bugId).all()).results;

    return Response.json({
      draft: buildDraft(
        emailContext.bug,
        emailContext.recipients,
        templateKey,
        emailContext.attachments,
        emailContext.latestFollowUp,
      ),
      attachments: emailContext.attachments.map((item) => ({
        ...item,
        url: `/api/bug-attachments/${item.id}`,
      })),
      maxInlineImageBytes: MAX_EMAIL_INLINE_IMAGE_BYTES,
      templates: Object.entries(templateDefinitions).map(([key, item]) => ({
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
    const recipient = safeHeaderText(payload.to, 1000);
    const cc = safeHeaderText(payload.cc, 1000);
    const subject = safeHeaderText(payload.subject, 300);
    const body = cleanText(payload.body, 12000);
    const template = toTemplateKey(payload.templateKey, "INCIDENT_ACTION");
    const requestedAttachmentIds = Array.isArray(payload.attachmentIds)
      ? [...new Set(payload.attachmentIds.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
      : [];
    if (!subject || !body || (action === "QUEUE" && !uniqueEmails([recipient]).length)) {
      return Response.json({ error: "گیرنده، عنوان و متن ایمیل برای ارسال الزامی هستند." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const emailContext = await loadEmailContext(d1, bugId);
    if (!emailContext) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const availableById = new Map(emailContext.attachments.map((item) => [Number(item.id), item]));
    const selectedAttachments = requestedAttachmentIds.map((id) => availableById.get(id)).filter(Boolean) as Record<string, unknown>[];
    if (selectedAttachments.length !== requestedAttachmentIds.length) {
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

    await d1.batch([
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, ?, ?, ?, ?)").bind(
        bugId,
        action === "DRAFT" ? "EMAIL_DRAFTED" : "EMAIL_QUEUED",
        action === "DRAFT" ? "پیش‌نویس ایمیل ذخیره شد" : "ایمیل در صف ارسال ثبت شد",
        actor,
        JSON.stringify({ emailId, recipient, subject, template, attachmentIds: requestedAttachmentIds }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('EMAIL', ?, ?, ?, ?)").bind(
        String(emailId),
        action,
        actor,
        JSON.stringify({ ...email, attachmentIds: requestedAttachmentIds }),
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
            to: uniqueEmails([recipient]),
            cc: uniqueEmails([cc]),
            subject,
            body,
            bugCode: emailContext.bug.bug_code,
            bugId,
            attachments: selectedAttachments.map((item) => ({
              id: Number(item.id),
              filename: String(item.original_name),
              mimeType: String(item.mime_type),
              sizeBytes: Number(item.size_bytes),
              inline: true,
            })),
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        email = await d1.prepare("UPDATE email_queue SET status = 'SENT', sent_at = CURRENT_TIMESTAMP, attempts = attempts + 1 WHERE id = ? RETURNING *")
          .bind(emailId).first<Record<string, unknown>>();
        await d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'EMAIL_SENT', ?, ?, ?)")
          .bind(bugId, "ایمیل از کانال متصل‌شده ارسال شد", actor, JSON.stringify({ emailId, recipient })).run();
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
