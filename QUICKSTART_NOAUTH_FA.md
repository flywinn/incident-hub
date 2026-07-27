# راه‌اندازی سریع بدون احراز هویت روی Windows Server 2022

> هشدار: در این حالت هر سیستمی که به TCP/3000 دسترسی شبکه داشته باشد، دسترسی کامل ADMIN دارد. این حالت فقط برای Pilot شبکه داخلی است.

## مشخصات این سرور

- IP: `172.25.3.8`
- Domain: `AF.HADC.me`
- پورت برنامه: `3000`
- URL اولیه: `http://172.25.3.8:3000`
- Subnet پیش‌فرض مجاز: `172.25.3.0/24`

## 1. نصب Node.js

Node.js 22 x64 را نصب کنید و سپس PowerShell جدید باز کنید:

```powershell
node --version
npm --version
```

نسخه Node باید حداقل `22.13.0` باشد.

## 2. استخراج پروژه

```powershell
New-Item -ItemType Directory -Force C:\Apps
Expand-Archive C:\Temp\elk-incident-hub-onprem-windows-noauth.zip C:\Apps -Force
Set-Location C:\Apps\elk-incident-hub-onprem-windows-noauth
```

## 3. ساخت تنظیمات و Firewall

PowerShell را با **Run as Administrator** اجرا کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
Set-Location C:\Apps\elk-incident-hub-onprem-windows-noauth

.\scripts\configure-noauth-pilot.ps1 `
  -AllowedRemoteAddress "172.25.3.0/24" `
  -AdminEmail "monitoring-admin@af.hadc.me"
```

اگر کل شبکه `172.25.0.0/16` باید دسترسی داشته باشد، مقدار `AllowedRemoteAddress` را با تأیید تیم شبکه به `172.25.0.0/16` تغییر دهید. برای چند subnet از آرایه استفاده کنید یا Rule جداگانه بسازید.

## 4. نصب و Build

```powershell
npm install
npm run lint
npm run build
```

اگر `better-sqlite3` خطای build داد، Visual Studio Build Tools با workload مربوط به C++ و Python 3 x64 را نصب کنید و دوباره `npm install` را اجرا کنید.

## 5. اجرای آزمایشی

```powershell
npm start
```

روی خود سرور:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

از ماشین دیگری در subnet مجاز:

```powershell
Test-NetConnection 172.25.3.8 -Port 3000
Invoke-RestMethod http://172.25.3.8:3000/api/health
```

مرورگر:

```text
http://172.25.3.8:3000
```

## 6. اجرای خودکار بعد از Restart

پس از اینکه اجرای دستی موفق بود، پنجره `npm start` را ببندید و اجرا کنید:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows-task.ps1
```

بررسی:

```powershell
Get-ScheduledTaskInfo -TaskName "ELK Incident Hub"
Get-NetTCPConnection -LocalPort 3000 -State Listen
Get-Content .\logs\application.log -Tail 100
```

## 7. Endpoint مربوط به ELK

```text
POST http://172.25.3.8:3000/api/integrations/elk/alerts
Authorization: Bearer <ELK_WEBHOOK_SECRET>
Content-Type: application/json
```

Secret داخل `.env.production` است. این فایل را در اختیار کاربران عادی قرار ندهید.

تست:

```powershell
$secret = (Get-Content .env.production | Where-Object { $_ -like 'ELK_WEBHOOK_SECRET=*' }) -replace '^ELK_WEBHOOK_SECRET=', ''
.\scripts\test-elk-webhook.ps1 -BaseUrl "http://172.25.3.8:3000" -Secret $secret
```

## 8. Backup

```powershell
$env:DB_PATH="C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite"
$env:BACKUP_DIR="C:\ProgramData\ElkIncidentHub\backups"
npm run db:backup
npm run db:check
```

## 9. توقف یا حذف اجرای خودکار

```powershell
Stop-ScheduledTask -TaskName "ELK Incident Hub"
.\scripts\uninstall-windows-task.ps1
```

## 10. فعال کردن احراز هویت در آینده

در `.env.production` مقدار زیر را تغییر دهید:

```env
AUTH_DISABLED=false
```

سپس IIS/Reverse Proxy و Windows Authentication را طبق راهنمای اصلی نصب کنید و برنامه را Restart کنید.
