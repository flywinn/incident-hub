export type AppPageKey =
  | "dashboard"
  | "bugs"
  | "followups"
  | "services"
  | "users"
  | "audit"
  | "automation"
  | "prtg"
  | "settings"
  | "help";

export type AppSettings = {
  brand: {
    name: string;
    subtitle: string;
  };
  pageTitles: Record<AppPageKey, { title: string; kicker: string }>;
  dashboard: {
    welcomeTitle: string;
    welcomeText: string;
    widgetTitles: Record<string, string>;
  };
  followups: {
    types: string[];
    defaultType: string;
    defaultDelayHours: number;
    nextDelayHours: number;
    staleAfterHours: number;
    requireResult: boolean;
  };
  email: {
    defaultCc: string;
  };
  help: {
    contactName: string;
    contactText: string;
  };
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  brand: {
    name: "دیدبان",
    subtitle: "مدیریت خطا و پیگیری",
  },
  pageTitles: {
    dashboard: { title: "وضعیت خطاها", kicker: "خلاصه آخرین اطلاعات ثبت‌شده" },
    bugs: { title: "خطاها", kicker: "ثبت، بررسی و پیگیری موارد" },
    followups: { title: "پیگیری‌ها", kicker: "پیگیری‌های امروز، باز و عقب‌افتاده" },
    services: { title: "سرویس‌ها", kicker: "مسیر مانیتورینگ و تیم مسئول" },
    users: { title: "کاربران", kicker: "نقش و سطح دسترسی" },
    audit: { title: "سوابق تغییرات", kicker: "چه کسی، چه چیزی را تغییر داده است" },
    automation: { title: "اتصال‌ها", kicker: "ELK و کانال ارسال ایمیل" },
    prtg: { title: "ابزار PRTG", kicker: "تبدیل آلارم‌ها به گزارش و ارسال به تلگرام" },
    settings: { title: "تنظیمات", kicker: "نمایش، متن‌ها و قواعد پیگیری" },
    help: { title: "راهنما و مستندات", kicker: "روش استفاده روزمره از سامانه" },
  },
  dashboard: {
    welcomeTitle: "خلاصه وضعیت ثبت و پیگیری",
    welcomeText: "آمار براساس تاریخ ثبت خطا و آخرین اطلاعات موجود نمایش داده می‌شود.",
    widgetTitles: {
      kpis: "شاخص‌های کلیدی",
      critical: "هشدار بحرانی",
      attention: "صف نیازمند اقدام",
      overview: "ترکیب وضعیت‌ها",
      services: "سرویس‌های پرتکرار",
      incidents: "آخرین خطاهای ثبت‌شده",
      followups: "پیگیری‌های نزدیک",
      quality: "کامل‌بودن اطلاعات",
      growth: "رکوردهای جدید",
      activity: "جریان فعالیت",
    },
  },
  followups: {
    types: ["پیگیری امروز", "بررسی وضعیت", "پیگیری با تیم سرویس", "منتظر پاسخ", "تأیید رفع", "پیگیری مجدد"],
    defaultType: "پیگیری امروز",
    defaultDelayHours: 0,
    nextDelayHours: 24,
    staleAfterHours: 48,
    requireResult: true,
  },
  email: {
    defaultCc: "noc@flytoday.ir",
  },
  help: {
    contactName: "تیم مانیتورینگ",
    contactText: "برای اصلاح دسترسی، اشکال در داده یا پیشنهاد تغییر با تیم مانیتورینگ هماهنگ کنید.",
  },
};

const LEGACY_FOLLOWUP_TYPES = ["بررسی فنی", "پیگیری با تیم سرویس", "درخواست نتیجه", "درخواست RCA", "تأیید رفع", "پیگیری مجدد"];

function cleanString(value: unknown, fallback: string, maxLength = 160) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, maxLength);
  return cleaned || fallback;
}

function cleanOptionalString(value: unknown, fallback: string, maxLength = 160) {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function sameStringSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x.localeCompare(y, "fa"));
  const b = [...right].sort((x, y) => x.localeCompare(y, "fa"));
  return a.every((value, index) => value === b[index]);
}

export function normalizeAppSettings(input: unknown): AppSettings {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const brand = source.brand && typeof source.brand === "object" ? source.brand as Record<string, unknown> : {};
  const dashboard = source.dashboard && typeof source.dashboard === "object" ? source.dashboard as Record<string, unknown> : {};
  const followups = source.followups && typeof source.followups === "object" ? source.followups as Record<string, unknown> : {};
  const email = source.email && typeof source.email === "object" ? source.email as Record<string, unknown> : {};
  const help = source.help && typeof source.help === "object" ? source.help as Record<string, unknown> : {};
  const inputPageTitles = source.pageTitles && typeof source.pageTitles === "object" ? source.pageTitles as Record<string, unknown> : {};
  const inputWidgetTitles = dashboard.widgetTitles && typeof dashboard.widgetTitles === "object" ? dashboard.widgetTitles as Record<string, unknown> : {};

  const pageTitles = Object.fromEntries(
    Object.entries(DEFAULT_APP_SETTINGS.pageTitles).map(([key, fallback]) => {
      const candidate = inputPageTitles[key] && typeof inputPageTitles[key] === "object"
        ? inputPageTitles[key] as Record<string, unknown>
        : {};
      return [key, {
        title: cleanString(candidate.title, fallback.title, 80),
        kicker: cleanString(candidate.kicker, fallback.kicker, 140),
      }];
    }),
  ) as AppSettings["pageTitles"];

  const widgetTitles = Object.fromEntries(
    Object.entries(DEFAULT_APP_SETTINGS.dashboard.widgetTitles).map(([key, fallback]) => [
      key,
      cleanString(inputWidgetTitles[key], fallback, 80),
    ]),
  );

  const rawTypes = Array.isArray(followups.types) ? followups.types : DEFAULT_APP_SETTINGS.followups.types;
  const cleanedTypes = [...new Set(rawTypes
    .map((item) => cleanString(item, "", 80))
    .filter(Boolean))]
    .slice(0, 20);
  const legacyFollowupDefaults = sameStringSet(cleanedTypes, LEGACY_FOLLOWUP_TYPES)
    && cleanString(followups.defaultType, "بررسی فنی", 80) === "بررسی فنی"
    && cleanNumber(followups.defaultDelayHours, 24, 0, 720) === 24;
  const finalTypes = legacyFollowupDefaults
    ? DEFAULT_APP_SETTINGS.followups.types
    : cleanedTypes.length ? cleanedTypes : DEFAULT_APP_SETTINGS.followups.types;
  const defaultTypeCandidate = legacyFollowupDefaults
    ? DEFAULT_APP_SETTINGS.followups.defaultType
    : cleanString(followups.defaultType, DEFAULT_APP_SETTINGS.followups.defaultType, 80);

  return {
    brand: {
      name: cleanString(brand.name, DEFAULT_APP_SETTINGS.brand.name, 50),
      subtitle: cleanString(brand.subtitle, DEFAULT_APP_SETTINGS.brand.subtitle, 90),
    },
    pageTitles,
    dashboard: {
      welcomeTitle: cleanString(dashboard.welcomeTitle, DEFAULT_APP_SETTINGS.dashboard.welcomeTitle, 100),
      welcomeText: cleanString(dashboard.welcomeText, DEFAULT_APP_SETTINGS.dashboard.welcomeText, 220),
      widgetTitles,
    },
    followups: {
      types: finalTypes,
      defaultType: finalTypes.includes(defaultTypeCandidate) ? defaultTypeCandidate : finalTypes[0],
      defaultDelayHours: legacyFollowupDefaults
        ? 0
        : cleanNumber(followups.defaultDelayHours, DEFAULT_APP_SETTINGS.followups.defaultDelayHours, 0, 720),
      nextDelayHours: cleanNumber(followups.nextDelayHours, DEFAULT_APP_SETTINGS.followups.nextDelayHours, 1, 720),
      staleAfterHours: cleanNumber(followups.staleAfterHours, DEFAULT_APP_SETTINGS.followups.staleAfterHours, 1, 2160),
      requireResult: typeof followups.requireResult === "boolean" ? followups.requireResult : DEFAULT_APP_SETTINGS.followups.requireResult,
    },
    email: {
      defaultCc: cleanOptionalString(email.defaultCc, DEFAULT_APP_SETTINGS.email.defaultCc, 240),
    },
    help: {
      contactName: cleanString(help.contactName, DEFAULT_APP_SETTINGS.help.contactName, 80),
      contactText: cleanString(help.contactText, DEFAULT_APP_SETTINGS.help.contactText, 260),
    },
  };
}
