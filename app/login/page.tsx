import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authenticationMode, getLocalSessionUser, isAuthenticationDisabled } from "../../lib/auth";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (isAuthenticationDisabled()) redirect("/");
  if (authenticationMode() !== "LOCAL") redirect("/");

  const requestHeaders = await headers();
  const currentUser = await getLocalSessionUser(requestHeaders.get("cookie"));
  if (currentUser) redirect("/");

  const params = await searchParams;
  const error = params.error === "invalid"
    ? "نام کاربری، ایمیل یا رمز عبور نادرست است."
    : params.error === "config"
      ? "ورود در حال حاضر در دسترس نیست."
      : "";

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.ambient} aria-hidden="true"><i></i><b></b></div>
      <section className={styles.card} aria-label="ورود به IncidentHub">
        <header className={styles.brand}>
          <span className={styles.signal} aria-hidden="true"><i></i><b></b><em></em></span>
          <div><strong>IncidentHub</strong><small>مدیریت خطا</small></div>
        </header>

        <div className={styles.heading}>
          <h1>ورود</h1>
        </div>

        {error && <div className={styles.error} role="alert"><span>!</span>{error}</div>}

        <form className={styles.form} action="/api/auth/login" method="post">
          <label className={styles.field}>
            <span className={styles.srOnly}>نام کاربری یا ایمیل</span>
            <i className={styles.userIcon} aria-hidden="true"></i>
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              required
              autoFocus
              maxLength={180}
              placeholder="نام کاربری یا ایمیل"
              dir="ltr"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.srOnly}>رمز عبور</span>
            <i className={styles.lockIcon} aria-hidden="true"></i>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              maxLength={200}
              placeholder="رمز عبور"
              dir="ltr"
            />
          </label>
          <button type="submit"><span>ورود به سامانه</span><b aria-hidden="true">←</b></button>
        </form>
      </section>
    </main>
  );
}
