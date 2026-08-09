# IncidentHub On-Prem

سامانه‌ی داخلی مدیریت Incident با رابط فارسی RTL، Next.js، SQLite محلی و احراز هویت Local برای تیم‌های کوچک عملیات و مانیتورینگ.

## وضعیت نسخه

- نسخه: `1.14.0`
- شاخه‌ی توسعه: `feature/document-images`
- Runtime: Node.js `>= 22.13.0` و خروجی Next.js standalone
- پایگاه‌داده: SQLite با WAL، backup و migration شماره‌دار
- احراز هویت پیش‌فرض: `LOCAL` با نقش‌های `SUPER_ADMIN`، `ADMIN`، `OPERATOR` و `VIEWER`

## کنترل‌های امنیتی اصلی

- Password hash با `scrypt` و salt تصادفی
- Cookie امضاشده، `HttpOnly` و `SameSite=Lax`
- ابطال نشست‌های قبلی بعد از تغییر رمز عبور
- محدودسازی تلاش‌های ناموفق ورود به تفکیک حساب و منبع
- RBAC در APIهای Backend
- پاسخ عمومی حداقلی Health و جزئیات محافظت‌شده با Secret
- Webhook مستقل ELK با Bearer Secret

## شروع سریع Production

برای نصب یا ارتقای نسخه‌ی Local Auth روی Windows Server، راهنمای زیر را دنبال کنید:

- [`QUICKSTART_LOCAL_AUTH_FA.md`](./QUICKSTART_LOCAL_AUTH_FA.md)

حالت IIS/Windows Authentication همچنان به‌عنوان گزینه‌ی `AUTH_MODE=PROXY` پشتیبانی می‌شود و راهنمای قدیمی آن در فایل زیر باقی مانده است:

- [`ONPREM_WINDOWS_ZERO_TO_HUNDRED_FA.md`](./ONPREM_WINDOWS_ZERO_TO_HUNDRED_FA.md)

راهنمای `QUICKSTART_NOAUTH_FA.md` فقط برای Pilot موقت و شبکه‌ی ایزوله است و برای Production توصیه نمی‌شود.

## بررسی سورس

```powershell
npm ci
npm run verify
```

`npm run verify` به‌ترتیب lint، تست‌ها، Production build و dependency audit را اجرا می‌کند.

## مسیرهای داده‌ی Production

داده‌ها و Secretها نباید داخل پوشه‌ی سورس یا Git قرار بگیرند. اسکریپت‌های Stable به‌صورت پیش‌فرض از این ساختار استفاده می‌کنند:

```text
D:\IncidentHub\Config\Prod\.env.production
D:\IncidentHub\Data\Prod\incident-hub.sqlite
D:\IncidentHub\Data\Prod\IncidentImages
D:\IncidentHub\Backups\Prod
D:\IncidentHub\Releases
```
