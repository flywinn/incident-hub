# هماهنگ‌سازی Dev، Production و GitHub

نسخهٔ پایدار این بسته `1.15.1` است. ابزار PRTG و ورود محلی با username/password در همین نسخه قرار دارند.

## مدل نهایی

- سورس مرجع Dev و Release: `D:\IncidentHub-GitHub`
- GitHub: `flywinn/incident-hub`
- Production: Release ساخته‌شده از همان Git commit
- دیتابیس Production: `D:\IncidentHub\Data\Prod\incident-hub.sqlite`
- Production Task: `ELK Incident Hub`
- Production Port: `3000`
- Dev Port: `3001`

همگام‌سازی فقط برای کد و نسخه انجام می‌شود. دیتابیس، تصاویر رخداد، فایل‌های env، backup و log وارد Git نمی‌شوند.

## اجرا

PowerShell را با Run as Administrator باز کنید و دستور زیر را اجرا کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass

& "D:\IncidentHub\Dev-1.15-fixed-v3\scripts\Stabilize-Dev-Prod-Git.ps1" `
  -ReleaseSource "D:\IncidentHub\Dev-1.15-fixed-v3" `
  -RepoPath "D:\IncidentHub-GitHub" `
  -Root "D:\IncidentHub"
```

پس از نمایش Git diff، فقط در صورت درست بودن مخزن، branch، version و تغییرات، عبارت `PUSH` را وارد کنید.

اسکریپت به‌ترتیب این موارد را کنترل می‌کند:

1. تمیز بودن Git و درست بودن remote مخزن
2. دریافت آخرین تغییرات GitHub فقط به روش fast-forward
3. انتقال سورس تأییدشده بدون env، دیتابیس و فایل‌های runtime
4. اجرای lint، TypeScript، تمام تست‌های متمرکز و production build
5. جلوگیری از stage شدن فایل‌های حساس
6. commit و tag نسخهٔ `v1.15.1`
7. Push اتمیک branch و tag به GitHub
8. deploy از همان Git commit و rollback خودکار در صورت خطا
9. تطبیق version و commit از مسیر `/api/health`

گزارش نهایی در مسیر زیر ذخیره می‌شود:

```text
D:\IncidentHub\State\GitSync\sync-YYYYMMDD-HHMMSS.json
```

## اجرای Dev هماهنگ

بعد از Sync، مسیر Dev مرجع همان مخزن Git است. برای اجرای Dev ابتدا `.env.local` معتبر را در مخزن نگه دارید و سپس اجرا کنید:

```powershell
& "D:\IncidentHub-GitHub\scripts\Start-LocalAuth-Dev.ps1" `
  -ProjectPath "D:\IncidentHub-GitHub" `
  -Port 3001
```

Telegram در این مرحله عمداً تست نمی‌شود و تنظیم یا شبکهٔ آن تغییر نمی‌کند.
