export const smartEmailTemplates = {
  TECHNICAL_INCIDENT: {
    name: "خطای فنی / سرویس",
    description: "برای خطاهای 5xx، API، Endpoint و اختلال زیرساختی",
  },
  FUNCTIONAL_ISSUE: {
    name: "ایراد فرآیندی / کاربری",
    description: "برای مشکل در ورود، تغییر رمز، پرداخت، رزرو، UI و جریان کاربر",
  },
  INTERNAL_NOTICE: {
    name: "اطلاع‌رسانی داخلی اختلال",
    description: "برای اطلاع به پشتیبانی، مرکز تماس یا تیم‌های داخلی",
  },
  FOLLOW_UP: {
    name: "پیگیری مجدد",
    description: "برای موضوعی که قبلاً اعلام شده و هنوز رفع نشده است",
  },
  RESOLUTION_RCA: {
    name: "رفع مشکل / RCA",
    description: "برای اعلام رفع و دریافت علت ریشه‌ای یا اقدام نهایی",
  },
} as const;

export type SmartEmailTemplateKey = keyof typeof smartEmailTemplates;

const legacyTemplateAliases: Record<string, SmartEmailTemplateKey> = {
  INCIDENT_ACTION: "TECHNICAL_INCIDENT",
  INCIDENT_SHORT: "TECHNICAL_INCIDENT",
  API_ENDPOINT_ERROR: "TECHNICAL_INCIDENT",
  HIGH_VOLUME_ERROR: "TECHNICAL_INCIDENT",
  UI_DISPLAY_ISSUE: "FUNCTIONAL_ISSUE",
  FOLLOW_UP_PENDING: "FOLLOW_UP",
  STATUS_UPDATE: "FOLLOW_UP",
  RESOLUTION_RCA: "RESOLUTION_RCA",
};

const statusLabels: Record<string, string> = {
  NEW: "جدید",
  IN_PROGRESS: "در حال پیگیری",
  WAITING: "منتظر پاسخ",
  RESOLVED: "رفع‌شده",
  CLOSED: "بسته‌شده",
  REOPENED: "بازگشایی‌شده",
};

const endpointNoisePatterns = [
  /^\/favicon(?:\.ico)?(?:$|[?#])/i,
  /^\/robots\.txt(?:$|[?#])/i,
  /^\/manifest(?:\.json)?(?:$|[?#])/i,
  /^\/site\.webmanifest(?:$|[?#])/i,
  /^\/apple-touch-icon/i,
  /^\/_next(?:\/|$)/i,
  /^\/static(?:\/|$)/i,
  /^\/assets?(?:\/|$)/i,
  /^\/healthz?(?:\/|$|[?#])/i,
  /^\/readyz?(?:\/|$|[?#])/i,
  /^\/metrics(?:\/|$|[?#])/i,
];

function normalizeDigits(value: string) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)));
}

function collapseWhitespace(value: string) {
  return value.replace(/[\t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function sourceText(bug: Record<string, unknown>) {
  return collapseWhitespace(`${bug.title ?? ""}\n${bug.description ?? ""}`);
}

export function humanizeService(value: unknown) {
  const raw = String(value ?? "")
    .replace(/^ELK\s*>\s*/i, "")
    .replace(/_main$/i, "")
    .replace(/_/g, " ")
    .trim();
  return raw || "سرویس مربوطه";
}

export function extractErrorCode(bug: Record<string, unknown>) {
  const normalized = normalizeDigits(sourceText(bug));
  const match = normalized.match(/(?:خطا(?:ی)?|error|status|http)?\s*[:=\-]?\s*\b([45]\d{2}|599)\b/i);
  return match?.[1] ?? "";
}

function endpointLooksUseful(endpoint: string) {
  if (!endpoint || endpoint === "/") return false;
  return !endpointNoisePatterns.some((pattern) => pattern.test(endpoint));
}

export function extractUsefulEndpoints(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  const matches = text.match(/\/(?:api|gateway|v\d+|[A-Za-z0-9._~-]+)(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%{}\-]+)*/gi) ?? [];
  const cleaned = matches
    .map((item) => item.replace(/[،,.;:]+$/g, "").trim())
    .filter(endpointLooksUseful);
  return [...new Set(cleaned)].slice(0, 8);
}

export function extractComponents(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  const patterns = [
    /\bLB-[A-Za-z0-9-]{2,}\b/g,
    /\bbk_[A-Za-z0-9_.-]+\b/g,
    /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_.-]*(?:Api|API)\b/g,
  ];
  const values = patterns.flatMap((pattern) => text.match(pattern) ?? []);
  return [...new Set(values.map((value) => value.trim()))].slice(0, 6);
}

export function detectOrigin(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  if (/از\s+سمت\s+چری|\bcherry\b/i.test(text)) return "چری";
  return "";
}

function hasFunctionalSignals(text: string) {
  return /تغییر\s*رمز|رمز\s*عبور|ورود\s*(?:به|کاربر|سامانه)?|لاگین|ثبت\s*نام|فرآیند|عملیات\s+.*(?:تکمیل|انجام)\s+نمی|دکمه|فرم|صفحه|نمایش\s+پیام|متأسفانه\s+خطایی|پرداخت|رزرو|خرید|ثبت\s+درخواست|ui\b|frontend/i.test(text);
}

function hasInternalNoticeSignals(text: string) {
  return /پایداری\s+لازم|تماس\s+مشتری|مشتریان|مرکز\s*تماس|کال\s*سنتر|پشتیبانی|اطلاع[‌\s-]*رسانی|صبوری|همراهی\s+کنند|در\s+حال\s+پیگیری\s+موضوع/i.test(text);
}

function explicitTimeFromText(text: string) {
  const match = normalizeDigits(text).match(/(?:ساعت|حوالی)\s*([0-2]?\d)\s*[:：]\s*([0-5]\d)/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function timeFromValue(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(date);
}

function dateTimeFromValue(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
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

function observedMoreThanOnce(bug: Record<string, unknown>) {
  const count = Number(bug.occurrence_count ?? 0);
  if (Number.isFinite(count) && count > 1) return true;
  const first = new Date(String(bug.first_seen_at ?? "")).getTime();
  const last = new Date(String(bug.last_seen_at ?? "")).getTime();
  return Number.isFinite(first) && Number.isFinite(last) && last - first >= 5 * 60_000;
}

function isEndpointLed(text: string, endpoints: string[]) {
  return endpoints.length === 1 && /(?:در\s+مسیر|مسیر\s+[^\n]*خطا)/i.test(text);
}

function compactFunctionalNarrative(bug: Record<string, unknown>) {
  const description = collapseWhitespace(String(bug.description ?? ""));
  const title = collapseWhitespace(String(bug.title ?? ""));
  let text = description || title;
  if (!text) return "در یکی از فرآیندهای سامانه اختلال مشاهده شده و عملیات موردنظر تکمیل نمی‌شود.";

  for (const endpoint of extractUsefulEndpoints(bug)) text = text.replaceAll(endpoint, "");
  for (const component of extractComponents(bug)) text = text.replaceAll(component, "");
  text = text
    .replace(/شناسه\s+رخداد\s*[:：]?\s*[A-Za-z0-9-]+/gi, "")
    .replace(/^(با\s+سلام(?:\s+و\s+احترام)?[،,]?\s*)/i, "")
    .replace(/(?:با\s+تشکر(?:\s+و\s+احترام)?[.]?)$/i, "")
    .trim();

  const sentences = text.split(/(?<=[.!؟])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  const picked = sentences.slice(0, 3).join(" ");
  return (picked || title).slice(0, 700).trim();
}

function functionalTopic(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  if (/تغییر\s*رمز|رمز\s*عبور/i.test(text)) return "فرآیند تغییر رمز عبور";
  if (/ورود|لاگین/i.test(text)) return "فرآیند ورود به سامانه";
  if (/پرداخت/i.test(text)) return "فرآیند پرداخت";
  if (/رزرو/i.test(text)) return "فرآیند رزرو";
  if (/خرید/i.test(text)) return "فرآیند خرید";
  const title = String(bug.title ?? "").replace(/\[[^\]]+\]/g, "").trim();
  return title ? title.slice(0, 90) : humanizeService(bug.service_label);
}

export function recommendedSmartEmailTemplate(
  bug: Record<string, unknown>,
  options: { historyCount?: number } = {},
): SmartEmailTemplateKey {
  const status = String(bug.status ?? "NEW");
  const historyCount = Math.max(0, Number(options.historyCount ?? 0));
  const text = sourceText(bug);
  const endpoints = extractUsefulEndpoints(bug);
  const errorCode = extractErrorCode(bug);

  if (["RESOLVED", "CLOSED"].includes(status)) return "RESOLUTION_RCA";
  if (historyCount > 0 && ["IN_PROGRESS", "WAITING", "REOPENED"].includes(status)) return "FOLLOW_UP";
  if (hasInternalNoticeSignals(text)) return "INTERNAL_NOTICE";
  if (errorCode || endpoints.length) return "TECHNICAL_INCIDENT";
  if (hasFunctionalSignals(text)) return "FUNCTIONAL_ISSUE";
  return "FUNCTIONAL_ISSUE";
}

export function toSmartEmailTemplate(value: unknown, fallback: SmartEmailTemplateKey): SmartEmailTemplateKey {
  if (typeof value !== "string") return fallback;
  if (Object.prototype.hasOwnProperty.call(smartEmailTemplates, value)) return value as SmartEmailTemplateKey;
  return legacyTemplateAliases[value] ?? fallback;
}

function endpointBlock(endpoints: string[]) {
  if (!endpoints.length) return "";
  if (endpoints.length === 1) return `مسیر درگیر:\n${endpoints[0]}`;
  return `مسیرهای درگیر:\n${endpoints.map((endpoint) => `- ${endpoint}`).join("\n")}`;
}

function buildTechnicalDraft(bug: Record<string, unknown>, recipients: string[]) {
  const text = sourceText(bug);
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  const endpoints = extractUsefulEndpoints(bug);
  const components = extractComponents(bug);
  const errorCode = extractErrorCode(bug);
  const origin = detectOrigin(bug);
  const endpointLed = isEndpointLed(text, endpoints);
  const explicitTime = explicitTimeFromText(text);
  const hour = explicitTime || (/(?:ساعت|حوالی)/.test(text) ? timeFromValue(bug.first_seen_at) : "");
  const timePrefix = hour ? `از حوالی ساعت ${hour}، ` : "";
  const errorPhrase = errorCode ? `خطای ${errorCode}` : "اختلال";
  const originPhrase = origin ? ` از سمت ${origin}` : "";
  const location = endpointLed
    ? `در مسیر ${endpoints[0]}`
    : `در سرویس ${service}${originPhrase}`;

  const subjectTarget = endpointLed ? endpoints[0] : `سرویس ${service}`;
  const subject = errorCode
    ? `[${code}] خطای ${errorCode} در ${subjectTarget}`
    : `[${code}] اختلال در ${subjectTarget}`;

  const paragraphs = [
    "با سلام و احترام،",
    `به اطلاع می‌رساند ${timePrefix}${location} ${errorPhrase} مشاهده شده و عملکرد سرویس نیازمند بررسی است.`,
    endpointLed ? "" : endpointBlock(endpoints),
    components.length ? components.join("\n") : "",
    "خواهشمند است علت فنی، اقدام انجام‌شده و وضعیت فعلی سرویس اعلام شود.",
    code ? `شناسه رخداد: ${code}` : "",
    "با تشکر و احترام.",
  ].filter(Boolean);

  return { to: recipients.join(", "), cc: "", subject, body: paragraphs.join("\n\n") };
}

function buildFunctionalDraft(bug: Record<string, unknown>, recipients: string[]) {
  const code = String(bug.bug_code ?? "").trim();
  const topic = functionalTopic(bug);
  let narrative = compactFunctionalNarrative(bug);
  if (!/^(جهت\s+اطلاع|به\s+اطلاع|در\s+)/.test(narrative)) narrative = `در ${topic}، ${narrative}`;
  narrative = narrative.replace(/[،,]\s*$/, "");
  if (!/[.!؟]$/.test(narrative)) narrative += ".";

  return {
    to: recipients.join(", "),
    cc: "",
    subject: `[${code}] اختلال در ${topic}`,
    body: [
      "با سلام،",
      `جهت اطلاع، ${narrative.replace(/^جهت\s+اطلاع[،,]?\s*/i, "")}`,
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildInternalNoticeDraft(bug: Record<string, unknown>, recipients: string[]) {
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  const text = sourceText(bug);
  const customerCue = /تماس\s+مشتری|مشتریان|مرکز\s*تماس|کال\s*سنتر|پشتیبانی/i.test(text);
  const paragraphs = [
    "با سلام و احترام،",
    `به اطلاع می‌رساند در حال حاضر سرویس ${service} از پایداری لازم برخوردار نیست و ممکن است کاربران در فرآیند استفاده از این سرویس با اختلال یا تأخیر مواجه شوند.`,
    customerCue
      ? "خواهشمند است در صورت تماس مشتریان در این خصوص، ضمن اطلاع‌رسانی درباره وجود اختلال، از آن‌ها درخواست شود تا با صبوری همراهی کنند."
      : "تیم مربوطه در حال پیگیری موضوع است و پس از بازگشت سرویس به وضعیت پایدار اطلاع‌رسانی خواهد شد.",
    customerCue ? "تیم مربوطه در حال پیگیری موضوع است و به محض بازگشت سرویس به وضعیت پایدار، اطلاع‌رسانی انجام خواهد شد." : "",
    code ? `شناسه رخداد: ${code}` : "",
    "از همکاری و همراهی شما سپاسگزاریم.",
  ].filter(Boolean);

  return {
    to: recipients.join(", "),
    cc: "",
    subject: `[${code}] اطلاع‌رسانی اختلال سرویس ${service}`,
    body: paragraphs.join("\n\n"),
  };
}

function buildFollowUpDraft(bug: Record<string, unknown>, recipients: string[]) {
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  const stillObserved = observedMoreThanOnce(bug);
  const followUpSentence = stillObserved
    ? "پیرو مکاتبات قبلی، به اطلاع می‌رساند موضوع مطرح‌شده همچنان مرتفع نشده و در آخرین بررسی نیز مشاهده شده است."
    : "پیرو مکاتبات قبلی، به اطلاع می‌رساند موضوع مطرح‌شده همچنان مرتفع نشده است.";

  return {
    to: recipients.join(", "),
    cc: "",
    subject: `[پیگیری][${code}] ${service}`,
    body: [
      "با سلام و احترام،",
      followUpSentence,
      "ممنون می‌شوم دستور فرمایید پیگیری‌های لازم انجام شود.",
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildResolutionDraft(bug: Record<string, unknown>, recipients: string[]) {
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  return {
    to: recipients.join(", "),
    cc: "",
    subject: `[رفع][${code}] سرویس ${service}`,
    body: [
      "با سلام و احترام،",
      `به اطلاع می‌رساند موضوع ثبت‌شده در سرویس ${service} بر اساس آخرین وضعیت سامانه رفع شده است.`,
      "خواهشمند است در صورت امکان علت ریشه‌ای بروز مشکل و اقدام انجام‌شده جهت جلوگیری از تکرار اعلام شود.",
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر و احترام.",
    ].filter(Boolean).join("\n\n"),
  };
}

function recommendationReason(
  bug: Record<string, unknown>,
  intent: SmartEmailTemplateKey,
  historyCount: number,
) {
  const errorCode = extractErrorCode(bug);
  const endpoints = extractUsefulEndpoints(bug);
  const status = String(bug.status ?? "NEW");
  if (intent === "FOLLOW_UP") return `قبلاً ایمیل ثبت شده و وضعیت رخداد ${statusLabels[status] ?? status} است`;
  if (intent === "RESOLUTION_RCA") return `وضعیت رخداد ${statusLabels[status] ?? status} است`;
  if (intent === "INTERNAL_NOTICE") return "متن رخداد نشانه‌های اطلاع‌رسانی داخلی/مشتری دارد";
  if (intent === "TECHNICAL_INCIDENT") {
    const parts = [errorCode ? `HTTP ${errorCode}` : "", endpoints.length ? `${endpoints.length.toLocaleString("fa-IR")} مسیر معتبر` : ""].filter(Boolean);
    return parts.join(" · ") || "نشانه فنی در رخداد ثبت شده است";
  }
  if (historyCount > 0) return "رخداد ماهیت فرآیندی/کاربری دارد";
  return "نشانه فنی معتبر یا Endpoint عملیاتی در متن پیدا نشد";
}

export function buildSmartEmailDraft(
  bug: Record<string, unknown>,
  recipients: string[],
  templateKey: SmartEmailTemplateKey,
  attachments: Record<string, unknown>[],
  latestFollowUp: Record<string, unknown> | null,
  options: { historyCount?: number } = {},
) {
  const historyCount = Math.max(0, Number(options.historyCount ?? 0));
  const recommended = recommendedSmartEmailTemplate(bug, { historyCount });
  const draft = templateKey === "TECHNICAL_INCIDENT"
    ? buildTechnicalDraft(bug, recipients)
    : templateKey === "FUNCTIONAL_ISSUE"
      ? buildFunctionalDraft(bug, recipients)
      : templateKey === "INTERNAL_NOTICE"
        ? buildInternalNoticeDraft(bug, recipients)
        : templateKey === "FOLLOW_UP"
          ? buildFollowUpDraft(bug, recipients)
          : buildResolutionDraft(bug, recipients);

  const endpoints = extractUsefulEndpoints(bug);
  const components = extractComponents(bug);
  const errorCode = extractErrorCode(bug);
  const status = String(bug.status ?? "NEW");

  return {
    ...draft,
    templateKey,
    templateName: smartEmailTemplates[templateKey].name,
    recommendedTemplateKey: recommended,
    context: {
      intent: templateKey,
      intentLabel: smartEmailTemplates[templateKey].name,
      recommendationReason: recommendationReason(bug, recommended, historyCount),
      status: statusLabels[status] ?? status,
      priority: String(bug.priority ?? ""),
      errorCode,
      errorLabel: errorCode ? `خطای ${errorCode}` : "",
      endpoints,
      components,
      origin: detectOrigin(bug),
      service: humanizeService(bug.service_label),
      firstSeen: dateTimeFromValue(bug.first_seen_at),
      lastSeen: dateTimeFromValue(bug.last_seen_at),
      attachmentCount: attachments.length,
      historyCount,
      latestFollowUp: latestFollowUp ? {
        type: String(latestFollowUp.type ?? "پیگیری"),
        status: String(latestFollowUp.status ?? ""),
        owner: String(latestFollowUp.owner_name ?? ""),
        result: String(latestFollowUp.result ?? ""),
        scheduledAt: latestFollowUp.scheduled_at ? dateTimeFromValue(latestFollowUp.scheduled_at) : "",
      } : null,
    },
  };
}
