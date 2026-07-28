"use client";

import { useEffect } from "react";

function report(error: Error & { digest?: string }) {
  void fetch("/api/client-errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      page: window.location.href,
      message: error.message,
      digest: error.digest,
    }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    report(error);
  }, [error]);

  return (
    <main className="runtime-error-page" dir="rtl">
      <section>
        <span className="runtime-error-icon">!</span>
        <p className="runtime-error-kicker">خطای غیرمنتظره</p>
        <h1>نمایش این بخش با مشکل روبه‌رو شد</h1>
        <p>اطلاعات شما حذف نشده است. صفحه را دوباره بارگذاری کنید؛ در صورت تکرار، کد پیگیری را برای مدیر سامانه بفرستید.</p>
        {error.digest ? <code>{error.digest}</code> : null}
        <div>
          <button onClick={reset}>تلاش دوباره</button>
          <button className="secondary" onClick={() => window.location.assign("/")}>بازگشت به داشبورد</button>
        </div>
      </section>
    </main>
  );
}
