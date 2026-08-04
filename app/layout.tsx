import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn";
import "./globals.css";

export const metadata: Metadata = {
  title: "دیدبان | مدیریت خطا و پیگیری",
  description: "ثبت، پیگیری و گزارش خطاهای سرویس‌ها",
};

const preferenceBootScript = `
(() => {
  try {
    const raw = localStorage.getItem("elk-app-preferences-v3");
    if (!raw) return;
    const value = JSON.parse(raw);
    if (value && typeof value === "object") {
      if (typeof value.theme === "string") document.documentElement.dataset.theme = value.theme;
      if (typeof value.fontSize === "string") document.documentElement.dataset.fontSize = value.fontSize;
      if (typeof value.tableDensity === "string") document.documentElement.dataset.tableDensity = value.tableDensity;
      if (typeof value.contrast === "string") document.documentElement.dataset.contrast = value.contrast;
    }
  } catch {}
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferenceBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
