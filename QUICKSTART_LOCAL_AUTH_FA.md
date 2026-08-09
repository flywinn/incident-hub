# راه‌اندازی و ارتقای IncidentHub با Local Auth روی Windows Server

این راهنما برای نسخه‌ی Stable `1.14.0` و دیتابیس Production موجود نوشته شده است. دستورات PowerShell مربوط به Configure و Install را با **Run as Administrator** اجرا کنید.

## 1. پیش‌نیازها

- Windows Server 2022 یا 2025
- Node.js `22.13.0` یا جدیدتر از شاخه‌ی سازگار Node 22
- Git for Windows برای دریافت و به‌روزرسانی سورس (GitHub CLI برای اجرای Production لازم نیست)
- سورس شاخه‌ی `feature/document-images` در `D:\IncidentHub\Dev`
- دیتابیس موجود در `D:\IncidentHub\Data\Prod\incident-hub.sqlite`
- حداقل 4 GB فضای آزاد برای build، release و backup

قبل از ادامه:

```powershell
node --version
npm --version
Get-Item D:\IncidentHub\Data\Prod\incident-hub.sqlite
```

## 2. دریافت و اعتبارسنجی سورس

```powershell
Set-Location D:\IncidentHub\Dev
git fetch origin
git switch feature/document-images
git pull --ff-only origin feature/document-images
npm ci
npm run verify
```

هر چهار مرحله‌ی lint، tests، build و audit باید بدون خطا تمام شوند.

## 3. تهیه‌ی Backup دستی قبل از تغییر احراز هویت

```powershell
$env:DB_PATH = "D:\IncidentHub\Data\Prod\incident-hub.sqlite"
$env:BACKUP_DIR = "D:\IncidentHub\Backups\Prod"
npm run db:backup
```

آخرین فایل backup را روی دیسک یا مقصد مستقل دیگری هم نگه دارید.

## 4. تنظیم Super Admin و Secretهای Production

برای دسترسی مستقیم HTTP داخل LAN:

```powershell
.\scripts\Configure-Production-Auth.ps1
```

اگر کاربران از طریق HTTPS وارد می‌شوند، Cookie امن را فعال کنید:

```powershell
.\scripts\Configure-Production-Auth.ps1 -SecureCookie
```

اسکریپت رمز را با `SecureString` دریافت می‌کند، Secret نشست و Health را تصادفی می‌سازد و Password متنی را ذخیره نمی‌کند.

## 5. ساخت و نصب Stable با Rollback خودکار

```powershell
.\scripts\Install-Stable-Production.ps1
```

این اسکریپت:

1. سورس را در workspace جداگانه کپی می‌کند.
2. lint، build و تست‌ها را اجرا می‌کند.
3. از دیتابیس و تصاویر Backup می‌گیرد.
4. migrationهای شماره‌دار را بعد از توقف Runtime قبلی اجرا می‌کند.
5. Release immutable و Scheduled Task را فعال می‌کند.
6. Health محافظت‌شده را بررسی می‌کند و در صورت شکست، Runtime قبلی را بازمی‌گرداند.

گزینه‌های `-SkipLint` و `-SkipTests` فقط برای عیب‌یابی اضطراری هستند و در انتشار عادی نباید استفاده شوند.

## 6. اعتبارسنجی بعد از نصب

```powershell
.\scripts\Validate-Stable-Production.ps1
.\scripts\smoke-production.ps1
Get-ScheduledTaskInfo -TaskName "ELK Incident Hub"
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

سپس از یک سیستم کاربر:

1. صفحه‌ی `/login` را باز کنید.
2. با Super Admin وارد شوید.
3. یک Incident موجود را باز کنید.
4. بارگذاری تصویر، ساخت SmartMail و Download فایل EML را بررسی کنید.
5. یک کاربر آزمایشی بسازید، ورود او را بررسی کنید و سپس رمز او را تغییر دهید؛ نشست قبلی آن کاربر باید نامعتبر شود.

## 7. نکات امنیتی

- `AUTH_DISABLED` در Production باید `false` باشد.
- اگر `AUTH_TRUST_PROXY_HEADERS=true` می‌شود، دسترسی مستقیم به Node باید با Firewall مسدود باشد.
- مقدار `HEALTH_DETAILS_SECRET` را در URL، Git یا ابزارهای عمومی ثبت نکنید.
- برای HTTPS حتماً `AUTH_COOKIE_SECURE=true` باشد.
- پورت 3000 را فقط برای Subnetهای لازم باز کنید؛ در حالت Reverse Proxy بهتر است فقط Loopback به آن دسترسی داشته باشد.
