# IncidentHub 1.15.1 - راهنمای استقرار Production با PRTG

این بسته با Local Auth (نام کاربری و رمز عبور)، Webpack و runtime مستقل Next.js آماده شده است.

## نصب وابستگی‌ها و بررسی

```powershell
Set-Location D:\IncidentHub\Dev-1.15-fixed
npm ci --include=dev --no-audit --no-fund
npm run lint
npm run build
```

## استقرار

اگر `D:\IncidentHub\Config\Prod\.env.production` قبلاً با `Configure-Production-Auth.ps1` ساخته شده و رمز Super Admin تنظیم شده است، تنظیم Auth را دوباره اجرا نکنید.

```powershell
& "D:\IncidentHub\Dev-1.15-fixed\scripts\Install-Stable-Production.ps1" `
  -Root "D:\IncidentHub" `
  -SourcePath "D:\IncidentHub\Dev-1.15-fixed"
```

اسکریپت قبل از cutover، تنظیمات Local Auth، دیتابیس و health secret را کنترل می‌کند؛ سپس backup می‌گیرد، migrationها را اجرا می‌کند و در صورت خطای بعد از cutover تلاش می‌کند نسخه قبلی را برگرداند.

## بررسی نهایی

```powershell
Get-ScheduledTask -TaskName "ELK Incident Hub" | Select-Object TaskName,State
Get-NetTCPConnection -LocalPort 3000 -State Listen
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

سایت از URL تنظیم‌شده در IIS باز می‌شود و صفحه `/login` باید نام کاربری و رمز عبور دریافت کند.

## فعال‌سازی PRTG و Telegram

بعد از Deploy، از منوی اصلی گزینه «ابزار PRTG» در دسترس است. برای ثبت Bot Token، Chat ID و ساخت Webhook Secret اجرا کنید:

```powershell
& "D:\IncidentHub\Dev-1.15.1-prtg\scripts\Configure-Prtg-Telegram.ps1" `
  -Root "D:\IncidentHub"
```

اگر دسترسی `api.telegram.org:443` در شبکه بسته باشد، تبدیل و کپی گزارش PRTG کار می‌کند ولی ارسال مستقیم تلگرام تا زمان بازشدن مسیر شبکه ناموفق خواهد بود.
