"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
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
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Vazirmatn, Tahoma, sans-serif", background: "#f4f7f5", color: "#1f2b25" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(560px, 100%)", padding: 32, borderRadius: 20, background: "white", boxShadow: "0 18px 60px rgba(28, 52, 40, .12)", textAlign: "center" }}>
            <div style={{ width: 52, height: 52, margin: "0 auto 16px", borderRadius: 16, display: "grid", placeItems: "center", background: "#fff0ee", color: "#b83c35", fontSize: 28, fontWeight: 800 }}>!</div>
            <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>سامانه موقتاً قابل نمایش نیست</h1>
            <p style={{ margin: "0 0 16px", lineHeight: 1.9, color: "#607068" }}>یک خطای سراسری رخ داده است. تلاش دوباره معمولاً مشکل را برطرف می‌کند؛ اطلاعات ثبت‌شده حذف نشده‌اند.</p>
            {error.digest ? <code style={{ display: "inline-block", padding: "7px 10px", borderRadius: 8, background: "#f1f4f2", direction: "ltr" }}>{error.digest}</code> : null}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
              <button onClick={reset} style={{ border: 0, borderRadius: 10, padding: "11px 18px", background: "#246a4d", color: "white", cursor: "pointer", font: "inherit" }}>تلاش دوباره</button>
              <button onClick={() => window.location.reload()} style={{ border: "1px solid #d8e1dc", borderRadius: 10, padding: "11px 18px", background: "white", color: "#34483e", cursor: "pointer", font: "inherit" }}>بارگذاری کامل صفحه</button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
