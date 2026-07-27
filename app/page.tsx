import { headers } from "next/headers";
import IncidentHub from "./incident-hub";
import { getNoAuthAdmin, getOrProvisionAppUser, isAuthenticationDisabled } from "../lib/auth";
import { identityFromHeaders } from "../lib/identity";

export const dynamic = "force-dynamic";

function ErrorPage({ title, message, detail }: { title: string; message: string; detail?: string }) {
  return (
    <main className="access-denied" dir="rtl">
      <section>
        <span>دسترسی تأیید نشد</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {detail ? <code>{detail}</code> : null}
      </section>
    </main>
  );
}

export default async function Home() {
  if (isAuthenticationDisabled()) {
    const appUser = await getNoAuthAdmin();
    return <IncidentHub currentUser={appUser} signOutPath="" />;
  }

  if (!process.env.DASHBOARD_OWNER_EMAILS?.trim()) {
    return <ErrorPage title="مدیر اولیه تنظیم نشده است" message="متغیر DASHBOARD_OWNER_EMAILS را در .env.production تنظیم و برنامه را Restart کنید." />;
  }

  const identity = identityFromHeaders(await headers());
  if (!identity) {
    return <ErrorPage title="هویت ویندوزی دریافت نشد" message="سایت باید فقط از مسیر IIS باز شود و هدرهای احراز هویت و Proxy Secret به برنامه فرستاده شوند." />;
  }

  const appUser = await getOrProvisionAppUser({
    email: identity.email,
    displayName: identity.displayName,
  });

  if (!appUser) {
    return (
      <ErrorPage
        title="حساب شما در سامانه فعال نیست"
        message="از مدیر سامانه بخواهید این شناسه را در بخش کاربران ثبت یا فعال کند."
        detail={identity.email}
      />
    );
  }

  return <IncidentHub currentUser={appUser} signOutPath="" />;
}
