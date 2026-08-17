import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import "./v115.css";

export const metadata: Metadata = {
  title: "دیدبان | مدیریت خطا و پیگیری",
  description: "ثبت، پیگیری و گزارش خطاهای سرویس‌ها",
};

const preferenceBootScript = `
(() => {
  try {
    document.documentElement.dataset.theme = "dark";
    const current = localStorage.getItem("elk-app-preferences-v4");
    const legacy = current ? null : localStorage.getItem("elk-app-preferences-v3");
    const raw = current || legacy;
    if (!raw) return;
    const value = JSON.parse(raw);
    if (value && typeof value === "object") {
      if (current && typeof value.theme === "string") document.documentElement.dataset.theme = value.theme;
      if (typeof value.fontSize === "string") document.documentElement.dataset.fontSize = value.fontSize;
      if (typeof value.tableDensity === "string") document.documentElement.dataset.tableDensity = value.tableDensity;
      if (typeof value.contrast === "string") document.documentElement.dataset.contrast = value.contrast;
    }
  } catch {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferenceBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
