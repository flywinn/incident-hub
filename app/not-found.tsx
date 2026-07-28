import Link from "next/link";

export default function NotFound() {
  return (
    <main className="runtime-error-page" dir="rtl">
      <section>
        <span className="runtime-error-icon">۴۰۴</span>
        <p className="runtime-error-kicker">مسیر نامعتبر</p>
        <h1>صفحه موردنظر پیدا نشد</h1>
        <p>ممکن است نشانی تغییر کرده باشد یا لینک به‌درستی کپی نشده باشد.</p>
        <div>
          <Link className="runtime-error-link" href="/">بازگشت به داشبورد</Link>
        </div>
      </section>
    </main>
  );
}
