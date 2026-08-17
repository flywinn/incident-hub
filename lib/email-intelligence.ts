export const smartEmailTemplates = {
  TECHNICAL_INCIDENT: {
    name: "اطلاع‌رسانی خطای فنی",
    description: "برای اطلاع‌رسانی خطاهای 5xx، API، Endpoint و اجزای زیرساختی",
  },
  FUNCTIONAL_ISSUE: {
    name: "اطلاع‌رسانی ایراد کاربری",
    description: "برای مشکل در ورود، تغییر رمز، پرداخت، رزرو، UI و جریان کاربر",
  },
  INTERNAL_NOTICE: {
    name: "اطلاع‌رسانی داخلی اختلال",
    description: "برای اطلاع به پشتیبانی، مرکز تماس یا تیم‌های داخلی",
  },
  FOLLOW_UP: {
    name: "اطلاع‌رسانی پیگیری",
    description: "برای اعلام آخرین وضعیت موضوعی که قبلاً اطلاع‌رسانی شده است",
  },
  RESOLUTION_RCA: {
    name: "اعلام رفع مشکل",
    description: "برای اطلاع‌رسانی رفع یا پایان رخداد بدون درخواست RCA پیش‌فرض",
  },
} as const;

export type SmartEmailTemplateKey = keyof typeof smartEmailTemplates;

type Metrics = {
  errorCount: number | null;
  errorRate: number | null;
  requestCount: number | null;
  successRate: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
};

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
  /^\/pwa-manifest(?:\.|\/|$)/i,
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

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseTechnicalJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function sourceText(bug: Record<string, unknown>) {
  const technical = parseTechnicalJson(bug.technical_context_json ?? bug.technicalContext);
  const technicalText = Object.entries(technical)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : String(value ?? "")}`)
    .join("\n");
  return collapseWhitespace(`${bug.title ?? ""}\n${bug.description ?? ""}\n${technicalText}`);
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
  const direct = normalizeDigits(String(bug.status_code ?? bug.http_status ?? "")).match(/\b([45]\d{2}|599)\b/);
  if (direct) return direct[1];
  const normalized = normalizeDigits(sourceText(bug));
  const match = normalized.match(/(?:خطا(?:ی)?|error|status|http)?\s*[:=\-]?\s*\b([45]\d{2}|599)\b/i);
  return match?.[1] ?? "";
}

function endpointLooksUseful(endpoint: string) {
  if (!endpoint || endpoint === "/") return false;
  return !endpointNoisePatterns.some((pattern) => pattern.test(endpoint));
}

export function extractUsefulEndpoints(bug: Record<string, unknown>) {
  const technical = parseTechnicalJson(bug.technical_context_json ?? bug.technicalContext);
  const directValues = [technical.endpoint, technical.path, bug.endpoint, bug.request_path]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.startsWith("/") && endpointLooksUseful(value));
  const text = sourceText(bug);
  const matches = text.match(/\/(?:api|gateway|v\d+|[A-Za-z0-9._~-]+)(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%{}\-]+)*/gi) ?? [];
  const cleaned = matches
    .map((item) => item.replace(/[،,.;:]+$/g, "").trim())
    .filter(endpointLooksUseful);
  return unique([...directValues, ...cleaned]).slice(0, 8);
}

function directTechnicalValues(bug: Record<string, unknown>, keys: string[]) {
  const technical = parseTechnicalJson(bug.technical_context_json ?? bug.technicalContext);
  return keys.flatMap((key) => {
    const values = [technical[key], bug[key]];
    return values.flatMap((value) => Array.isArray(value) ? value : [value]);
  }).map((value) => String(value ?? "").trim()).filter(Boolean);
}

export function extractLoadBalancers(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  const direct = directTechnicalValues(bug, ["loadBalancer", "load_balancer", "lb", "frontend"]);
  const matches = text.match(/\bLB-[A-Za-z0-9-]{2,}\b/g) ?? [];
  return unique([...direct, ...matches]).slice(0, 6);
}

export function extractBackends(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  const direct = directTechnicalValues(bug, ["backend", "backendName", "backend_name"]);
  const patterns = [
    /\bbk_[A-Za-z0-9_.-]+\b/g,
    /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_.-]*(?:Api|API)\b/g,
  ];
  const matches = patterns.flatMap((pattern) => text.match(pattern) ?? []);
  return unique([...direct, ...matches]).slice(0, 8);
}

export function extractServers(bug: Record<string, unknown>) {
  const text = sourceText(bug);
  const direct = directTechnicalValues(bug, ["server", "serverName", "server_name", "node", "host"]);
  const patterns = [
    /\bAPI\d+[A-Za-z0-9_-]*\b/g,
    /\b(?:WEB|SRV|APP|NODE)[-_]?[A-Za-z0-9]*\d+[A-Za-z0-9_-]*\b/g,
    /\bF\d+[A-Za-z]+[_-]\d+[A-Za-z0-9_-]*\b/g,
  ];
  const matches = patterns.flatMap((pattern) => text.match(pattern) ?? []);
  return unique([...direct, ...matches]).slice(0, 8);
}

export function extractComponents(bug: Record<string, unknown>) {
  return unique([
    ...extractLoadBalancers(bug),
    ...extractBackends(bug),
    ...extractServers(bug),
  ]).slice(0, 12);
}

function parseNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = normalizeDigits(String(value)).replace(/,/g, "").replace(/٪/g, "").trim();
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function numberFromPatterns(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = normalizeDigits(text).match(pattern);
    if (match?.[1] !== undefined) {
      const parsed = parseNumber(match[1]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

export function extractMetrics(bug: Record<string, unknown>): Metrics {
  const technical = parseTechnicalJson(bug.technical_context_json ?? bug.technicalContext);
  const text = sourceText(bug);
  const direct = (keys: string[]) => {
    for (const key of keys) {
      const parsed = parseNumber(technical[key] ?? bug[key]);
      if (parsed !== null) return parsed;
    }
    return null;
  };
  return {
    errorCount: direct(["errorCount", "error_count", "errors5xx", "errors_5xx"])
      ?? numberFromPatterns(text, [/(?:تعداد\s*خطا|error\s*count|5xx\s*errors?)\s*[:=]?\s*([\d,.]+)/i]),
    errorRate: direct(["errorRate", "error_rate", "errorRatePct", "error_rate_pct"])
      ?? numberFromPatterns(text, [/(?:نرخ\s*خطا|error\s*rate|5xx\s*error\s*rate)\s*[:=]?\s*([\d,.]+)\s*%?/i]),
    requestCount: direct(["requestCount", "request_count", "requests", "total_requests"])
      ?? numberFromPatterns(text, [/(?:تعداد\s*درخواست|requests?|request\s*count)\s*[:=]?\s*([\d,.]+)/i]),
    successRate: direct(["successRate", "success_rate"])
      ?? numberFromPatterns(text, [/(?:نرخ\s*موفقیت|success\s*rate)\s*[:=]?\s*([\d,.]+)\s*%?/i]),
    p95Ms: direct(["p95Ms", "p95_ms", "p95"])
      ?? numberFromPatterns(text, [/\bp95\s*[:=]?\s*([\d,.]+)\s*(?:ms)?/i]),
    p99Ms: direct(["p99Ms", "p99_ms", "p99"])
      ?? numberFromPatterns(text, [/\bp99\s*[:=]?\s*([\d,.]+)\s*(?:ms)?/i]),
  };
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
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Tehran",
  }).format(date);
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
  if (historyCount > 0 && ["IN_PROGRESS", "WAITING", "REOPENED", "NEW"].includes(status)) return "FOLLOW_UP";
  if (hasInternalNoticeSignals(text)) return "INTERNAL_NOTICE";
  if (errorCode || endpoints.length || extractComponents(bug).length) return "TECHNICAL_INCIDENT";
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

function componentBlock(bug: Record<string, unknown>) {
  const lines = [
    ...extractLoadBalancers(bug).map((value) => `LB: ${value}`),
    ...extractBackends(bug).map((value) => `Backend: ${value}`),
    ...extractServers(bug).map((value) => `Server: ${value}`),
  ];
  return unique(lines).join("\n");
}

function formatMetricNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function metricBlock(bug: Record<string, unknown>) {
  const metrics = extractMetrics(bug);
  const lines = [
    metrics.errorCount !== null ? `تعداد خطا: ${formatMetricNumber(metrics.errorCount)}` : "",
    metrics.errorRate !== null ? `نرخ خطا: ${formatMetricNumber(metrics.errorRate)}%` : "",
    metrics.requestCount !== null ? `تعداد درخواست: ${formatMetricNumber(metrics.requestCount)}` : "",
    metrics.successRate !== null ? `نرخ موفقیت: ${formatMetricNumber(metrics.successRate)}%` : "",
    metrics.p95Ms !== null ? `P95: ${formatMetricNumber(metrics.p95Ms)} ms` : "",
    metrics.p99Ms !== null ? `P99: ${formatMetricNumber(metrics.p99Ms)} ms` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildTechnicalDraft(bug: Record<string, unknown>, recipients: string[], defaultCc: string) {
  const text = sourceText(bug);
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  const endpoints = extractUsefulEndpoints(bug);
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

  return {
    to: recipients.join(", "),
    cc: defaultCc,
    subject,
    body: [
      "با سلام و احترام،",
      `جهت اطلاع، ${timePrefix}${location} ${errorPhrase} مشاهده شده است.`,
      endpointLed ? "" : endpointBlock(endpoints),
      componentBlock(bug),
      metricBlock(bug),
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر و احترام.",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildFunctionalDraft(bug: Record<string, unknown>, recipients: string[], defaultCc: string) {
  const code = String(bug.bug_code ?? "").trim();
  const topic = functionalTopic(bug);
  let narrative = compactFunctionalNarrative(bug);
  if (!/^(جهت\s+اطلاع|به\s+اطلاع|در\s+)/.test(narrative)) narrative = `در ${topic}، ${narrative}`;
  narrative = narrative.replace(/[،,]\s*$/, "");
  if (!/[.!؟]$/.test(narrative)) narrative += ".";

  return {
    to: recipients.join(", "),
    cc: defaultCc,
    subject: `[${code}] اختلال در ${topic}`,
    body: [
      "با سلام،",
      `جهت اطلاع، ${narrative.replace(/^جهت\s+اطلاع[،,]?\s*/i, "")}`,
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildInternalNoticeDraft(bug: Record<string, unknown>, recipients: string[], defaultCc: string) {
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  const text = sourceText(bug);
  const customerCue = /تماس\s+مشتری|مشتریان|مرکز\s*تماس|کال\s*سنتر|پشتیبانی/i.test(text);
  return {
    to: recipients.join(", "),
    cc: defaultCc,
    subject: `[${code}] اطلاع‌رسانی اختلال سرویس ${service}`,
    body: [
      "با سلام و احترام،",
      `به اطلاع می‌رساند در حال حاضر سرویس ${service} از پایداری لازم برخوردار نیست و ممکن است کاربران در فرآیند استفاده از این سرویس با اختلال یا تأخیر مواجه شوند.`,
      customerCue ? "در صورت تماس مشتریان در این خصوص، وجود اختلال اطلاع‌رسانی شود. تیم مربوطه در حال پیگیری موضوع است." : "تیم مربوطه در حال پیگیری موضوع است و پس از بازگشت سرویس به وضعیت پایدار اطلاع‌رسانی خواهد شد.",
      code ? `شناسه رخداد: ${code}` : "",
      "از همکاری و همراهی شما سپاسگزاریم.",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildFollowUpDraft(bug: Record<string, unknown>, recipients: string[], defaultCc: string, lastEmailAt: unknown) {
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  const lastSeenTime = new Date(String(bug.last_seen_at ?? "")).getTime();
  const lastEmailTime = new Date(String(lastEmailAt ?? "")).getTime();
  const observedAfterLastEmail = Number.isFinite(lastSeenTime) && Number.isFinite(lastEmailTime) && lastSeenTime > lastEmailTime;
  const statusSentence = observedAfterLastEmail
    ? "پیرو اطلاع‌رسانی قبلی، خطا در آخرین بررسی نیز مشاهده شده است."
    : "پیرو اطلاع‌رسانی قبلی، موضوع همچنان در وضعیت باز قرار دارد.";
  const lastSeen = dateTimeFromValue(bug.last_seen_at);

  return {
    to: recipients.join(", "),
    cc: defaultCc,
    subject: `[پیگیری][${code}] ${service}`,
    body: [
      "با سلام و احترام،",
      statusSentence,
      lastSeen ? `آخرین مشاهده: ${lastSeen}` : "",
      endpointBlock(extractUsefulEndpoints(bug)),
      componentBlock(bug),
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر و احترام.",
    ].filter(Boolean).join("\n\n"),
  };
}

function buildResolutionDraft(bug: Record<string, unknown>, recipients: string[], defaultCc: string) {
  const code = String(bug.bug_code ?? "").trim();
  const service = humanizeService(bug.service_label);
  return {
    to: recipients.join(", "),
    cc: defaultCc,
    subject: `[رفع][${code}] سرویس ${service}`,
    body: [
      "با سلام و احترام،",
      `جهت اطلاع، موضوع ثبت‌شده در سرویس ${service} بر اساس آخرین بررسی رفع شده است.`,
      code ? `شناسه رخداد: ${code}` : "",
      "با تشکر و احترام.",
    ].filter(Boolean).join("\n\n"),
  };
}

function recommendationReason(bug: Record<string, unknown>, intent: SmartEmailTemplateKey, historyCount: number) {
  const errorCode = extractErrorCode(bug);
  const endpoints = extractUsefulEndpoints(bug);
  const status = String(bug.status ?? "NEW");
  if (intent === "FOLLOW_UP") return `قبلاً ایمیل ثبت شده و وضعیت رخداد ${statusLabels[status] ?? status} است`;
  if (intent === "RESOLUTION_RCA") return `وضعیت رخداد ${statusLabels[status] ?? status} است`;
  if (intent === "INTERNAL_NOTICE") return "متن رخداد برای اطلاع‌رسانی داخلی مناسب است";
  if (intent === "TECHNICAL_INCIDENT") {
    const parts = [
      errorCode ? `HTTP ${errorCode}` : "",
      endpoints.length ? `${endpoints.length.toLocaleString("fa-IR")} مسیر معتبر` : "",
      extractComponents(bug).length ? `${extractComponents(bug).length.toLocaleString("fa-IR")} مؤلفه فنی` : "",
    ].filter(Boolean);
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
  options: { historyCount?: number; defaultCc?: string; lastEmailAt?: unknown } = {},
) {
  const historyCount = Math.max(0, Number(options.historyCount ?? 0));
  const defaultCc = String(options.defaultCc ?? "").trim();
  const recommended = recommendedSmartEmailTemplate(bug, { historyCount });
  const draft = templateKey === "TECHNICAL_INCIDENT"
    ? buildTechnicalDraft(bug, recipients, defaultCc)
    : templateKey === "FUNCTIONAL_ISSUE"
      ? buildFunctionalDraft(bug, recipients, defaultCc)
      : templateKey === "INTERNAL_NOTICE"
        ? buildInternalNoticeDraft(bug, recipients, defaultCc)
        : templateKey === "FOLLOW_UP"
          ? buildFollowUpDraft(bug, recipients, defaultCc, options.lastEmailAt)
          : buildResolutionDraft(bug, recipients, defaultCc);

  const endpoints = extractUsefulEndpoints(bug);
  const loadBalancers = extractLoadBalancers(bug);
  const backends = extractBackends(bug);
  const servers = extractServers(bug);
  const components = extractComponents(bug);
  const metrics = extractMetrics(bug);
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
      loadBalancers,
      backends,
      servers,
      metrics,
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
