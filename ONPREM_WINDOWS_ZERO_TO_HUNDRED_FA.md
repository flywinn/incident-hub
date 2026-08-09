# راهنمای صفر تا صد استقرار ELK Incident Hub داخل دیتاسنتر روی Windows

> این سند مسیر اختیاری `AUTH_MODE=PROXY` با IIS/Windows Authentication را توضیح می‌دهد. مسیر فعلی و ساده‌تر Production برای تیم کوچک، `AUTH_MODE=LOCAL` است و در [`QUICKSTART_LOCAL_AUTH_FA.md`](./QUICKSTART_LOCAL_AUTH_FA.md) مستند شده است.

## 1. نتیجه بررسی پروژه اولیه

پروژه اولیه برای ChatGPT Sites و Cloudflare ساخته شده بود. دو وابستگی آن برای دیتاسنتر داخلی مناسب نبود:

1. پایگاه‌داده Cloudflare D1
2. احراز هویت با هدرهای ChatGPT Sites

در این نسخه On-Prem تغییرات زیر انجام شده است:

- D1 با SQLite محلی جایگزین شده است.
- برنامه با Next.js استاندارد و Node.js اجرا می‌شود.
- هویت کاربر از IIS Windows Authentication دریافت می‌شود.
- IIS به‌عنوان Reverse Proxy و نقطه TLS استفاده می‌شود.
- برنامه فقط روی `127.0.0.1:3000` گوش می‌دهد.
- سایر سیستم‌های دیتاسنتر فقط از HTTPS روی IIS به برنامه دسترسی دارند.
- Endpoint مربوط به ELK در IIS به‌صورت Anonymous عبور می‌کند، ولی داخل برنامه همچنان Bearer Secret اجباری است.
- داده‌های نمونه به‌صورت پیش‌فرض وارد نمی‌شوند.

---

## 2. معماری نهایی پیشنهادی

```text
کاربران Domain یا Local Windows
            |
            | HTTPS 443
            v
Windows Server + IIS
- TLS Certificate
- Windows Authentication
- URL Rewrite + ARR
- Inject X-Authenticated-User
- Inject X-Auth-Proxy-Secret
            |
            | HTTP 127.0.0.1:3000
            v
Next.js / Node.js
            |
            v
SQLite روی NTFS محلی
C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite

ELK/Kibana ---- HTTPS 443 + Bearer Secret ----> IIS ----> Webhook API
Node.js ------ HTTPS + Optional Bearer --------> Internal Mail Gateway
```

### قانون مهم امنیتی

پورت 3000 نباید در شبکه باز شود. تنها IIS باید بتواند به `127.0.0.1:3000` دسترسی داشته باشد. اعتماد برنامه به هدر کاربر فقط زمانی امن است که برنامه مستقیماً از شبکه قابل دسترس نباشد و مقدار `AUTH_PROXY_SECRET` نیز صحیح باشد.

---

## 3. انتخاب سیستم‌عامل

### مناسب برای Production

- Windows Server 2019 x64
- Windows Server 2022 x64
- Windows Server 2025 x64

Windows Server 2022 یا 2025 ترجیح دارد.

### فقط برای Pilot یا تست

- Windows 10 Pro/Enterprise
- Windows 11 Pro/Enterprise

Windows Home برای IIS Windows Authentication و میزبانی سازمانی انتخاب مناسبی نیست.

### در این راهنما WSL یا Docker لازم نیست

نسخه On-Prem به‌صورت Native روی Windows اجرا می‌شود. در صورت نیاز به جداسازی بیشتر می‌توان بعداً همین سرویس را به Linux VM روی Hyper-V منتقل کرد.

---

## 4. منابع سخت‌افزاری

### حداقل Pilot

- 2 vCPU
- 4 GB RAM
- 10 GB فضای آزاد
- کارت شبکه 1 Gbps

### پیشنهاد Production تک‌سرور

- 4 vCPU
- 8 GB RAM
- 40 GB فضای NTFS
- دیسک SSD
- Snapshot یا Backup خارج از همان سرور

### برای حجم بیشتر

اگر تعداد کاربران زیاد، نرخ هشدار بسیار بالا یا چند Instance برنامه نیاز است، SQLite باید با PostgreSQL جایگزین شود. فایل SQLite نباید بین چند سرور روی SMB Share مشترک شود.

---

## 5. اطلاعاتی که قبل از نصب باید تعیین شوند

نمونه مقادیر:

```text
Server Name:        APP-INCIDENT-01
Server IP:          10.20.30.40
Internal DNS:       incidenthub.corp.local
AD NetBIOS Domain:  CORP
AD/Email Domain:    corp.local
Initial Admin:      CORP\incident.admin
Normalized Admin:  incident.admin@corp.local
ELK Source IP:      10.20.40.15
Mail Gateway URL:   https://mail-gateway.corp.local/api/incident
```

موارد زیر باید از تیم‌های مربوطه گرفته شوند:

- IP ثابت
- رکورد DNS
- Certificate دارای نام DNS سامانه
- Subnet کاربران مجاز
- IP سرورهای ELK/Kibana
- نام کاربر مدیر اولیه
- URL و روش احراز هویت Mail Gateway
- مسیر مقصد Backup

---

## 6. پورت‌ها و Firewall

| مبدأ | مقصد | پورت | کاربرد |
|---|---|---:|---|
| کاربران داخلی | Windows/IIS | TCP 443 | رابط کاربری |
| ELK/Kibana | Windows/IIS | TCP 443 | ارسال Webhook |
| Monitoring | Windows/IIS | TCP 443 | Health Check |
| Node.js | Mail Gateway | TCP 443 | ارسال ایمیل اختیاری |
| IIS | Node.js | TCP 3000 روی Loopback | Reverse Proxy داخلی |

پورت 3000 را Inbound باز نکنید.

در صورت نیاز به محدود کردن 443 به Subnet داخلی، PowerShell را با Administrator اجرا کنید:

```powershell
New-NetFirewallRule `
  -DisplayName "ELK Incident Hub HTTPS" `
  -Direction Inbound `
  -Action Allow `
  -Protocol TCP `
  -LocalPort 443 `
  -RemoteAddress 10.0.0.0/8
```

مقدار `RemoteAddress` را با شبکه واقعی سازمان جایگزین کنید.

---

## 7. نصب IIS و Windows Authentication

PowerShell را با Run as Administrator باز کنید:

```powershell
Install-WindowsFeature `
  Web-Server, `
  Web-Windows-Auth, `
  Web-Mgmt-Tools `
  -IncludeManagementTools
```

بررسی نصب:

```powershell
Get-WindowsFeature Web-Server,Web-Windows-Auth
```

هر دو مورد باید Installed باشند.

### نصب URL Rewrite و ARR

دو Installer رسمی x64 را تهیه و به همین ترتیب نصب کنید:

1. IIS URL Rewrite 2.1 x64
2. IIS Application Request Routing 3.0 x64

ARR به URL Rewrite وابسته است؛ ترتیب نصب مهم است.

بعد از نصب:

1. IIS Manager را باز کنید.
2. روی نام Server کلیک کنید.
3. `Application Request Routing Cache` را باز کنید.
4. از سمت راست `Server Proxy Settings` را انتخاب کنید.
5. گزینه `Enable proxy` را فعال کنید.
6. Apply را بزنید.

### ثبت Server Variableهای مجاز

در IIS Manager:

1. روی نام Server کلیک کنید.
2. `URL Rewrite` را باز کنید.
3. از Actions گزینه `View Server Variables` را بزنید.
4. این سه مقدار را اضافه کنید:

```text
HTTP_X_AUTHENTICATED_USER
HTTP_X_AUTH_PROXY_SECRET
HTTP_X_FORWARDED_PROTO
```

اگر این مرحله انجام نشود، IIS اجازه تغییر هدرها را به Rule سایت نمی‌دهد.

---

## 8. نصب Node.js

نسخه موردنیاز پروژه:

```text
Node.js >= 22.13.0
```

Node.js 22 LTS x64 یا نسخه LTS جدیدتر سازگار نصب شود. هنگام نصب گزینه اضافه شدن Node به PATH فعال باشد.

PowerShell جدید باز کنید:

```powershell
node --version
npm --version
where.exe node
where.exe npm
```

خروجی Node باید حداقل `v22.13.0` باشد.

### احتمال خطای better-sqlite3

این بسته معمولاً Binary آماده برای Windows x64 دارد. اگر هنگام `npm install` خطای `node-gyp` دیده شد، موارد زیر لازم می‌شوند:

- Visual Studio Build Tools
- Desktop development with C++
- Windows SDK
- Python 3 x64

بعد از نصب Build Tools، PowerShell جدید باز کرده و `npm install` را تکرار کنید.

---

## 9. ساخت پوشه‌ها

```powershell
New-Item -ItemType Directory -Force C:\Apps\ElkIncidentHub
New-Item -ItemType Directory -Force C:\ProgramData\ElkIncidentHub\data
New-Item -ItemType Directory -Force C:\ProgramData\ElkIncidentHub\backups
New-Item -ItemType Directory -Force C:\inetpub\ElkIncidentHubProxy
```

ACL پیشنهادی:

```powershell
icacls C:\ProgramData\ElkIncidentHub /inheritance:r
icacls C:\ProgramData\ElkIncidentHub /grant "SYSTEM:(OI)(CI)F"
icacls C:\ProgramData\ElkIncidentHub /grant "Administrators:(OI)(CI)F"
```

کاربران عادی نباید به فایل دیتابیس و Secretها دسترسی مستقیم داشته باشند.

---

## 10. انتقال و استخراج پروژه

ZIP نسخه On-Prem را روی Server کپی کنید، سپس:

```powershell
Expand-Archive `
  -Path C:\Temp\elk-incident-hub-onprem-windows.zip `
  -DestinationPath C:\Apps\ElkIncidentHub `
  -Force
```

اگر ZIP یک پوشه داخلی ایجاد کرد، مطمئن شوید `package.json` دقیقاً در مسیر زیر باشد:

```text
C:\Apps\ElkIncidentHub\package.json
```

بررسی:

```powershell
Set-Location C:\Apps\ElkIncidentHub
Get-ChildItem
```

---

## 11. نصب Dependencyها

اگر سرور به npm Registry یا Registry داخلی دسترسی دارد:

```powershell
Set-Location C:\Apps\ElkIncidentHub
npm install
```

سپس:

```powershell
npm run lint
npm run build
node --test tests\*.test.mjs
```

### نصب در دیتاسنتر بدون اینترنت

یکی از این مسیرها لازم است:

- استفاده از npm Registry داخلی مانند Nexus/Artifactory
- باز کردن دسترسی محدود HTTPS به Registry رسمی
- ساخت Artifact روی یک Windows Build Machine با همان معماری و نسخه Node

کپی کردن `node_modules` از Linux به Windows مجاز نیست، چون `better-sqlite3` Native Binary سیستم‌عامل دارد. Build آفلاین باید روی Windows x64 و ترجیحاً همان نسخه Node انجام شود.

---

## 12. ساخت Secretها

PowerShell:

```powershell
function New-RandomHex([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buffer)
  $rng.Dispose()
  return (($buffer | ForEach-Object { $_.ToString("x2") }) -join "")
}

$AuthProxySecret = New-RandomHex 32
$ElkWebhookSecret = New-RandomHex 32
$EmailWebhookSecret = New-RandomHex 32

$AuthProxySecret
$ElkWebhookSecret
$EmailWebhookSecret
```

هر Secret باید متفاوت باشد. خروجی را در Password Vault سازمان ذخیره کنید.

---

## 13. تنظیم فایل Environment

```powershell
Copy-Item .env.example .env.production
notepad.exe .env.production
```

نمونه:

```env
DB_PATH=C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite

DASHBOARD_OWNER_EMAILS=incident.admin@corp.local

AUTH_USER_HEADER=x-authenticated-user
AUTH_NAME_HEADER=x-authenticated-name
AUTH_EMAIL_DOMAIN=corp.local
AUTH_PROXY_SECRET=PUT_AUTH_PROXY_SECRET_HERE

ELK_WEBHOOK_SECRET=PUT_ELK_SECRET_HERE

EMAIL_WEBHOOK_URL=https://mail-gateway.corp.local/api/incident
EMAIL_WEBHOOK_SECRET=PUT_EMAIL_SECRET_HERE

SEED_DEMO_DATA=false
IMPORT_BUNDLED_REPORT=false
LOAD_DEFAULT_SERVICE_CATALOG=true
```

### نحوه تبدیل کاربر Windows به ایمیل داخلی

اگر IIS مقدار زیر را بفرستد:

```text
CORP\ali.rezaei
```

و این مقدار تنظیم باشد:

```env
AUTH_EMAIL_DOMAIN=corp.local
```

برنامه شناسه زیر را می‌سازد:

```text
ali.rezaei@corp.local
```

بنابراین مقدار `DASHBOARD_OWNER_EMAILS` و کاربران پنل باید دقیقاً با همین الگو ثبت شوند.

### داده‌های قبلی پروژه

برای Production تمیز:

```env
SEED_DEMO_DATA=false
IMPORT_BUNDLED_REPORT=false
```

اگر عمداً می‌خواهید داده ثابت گزارش قبلی یک بار وارد شود:

```env
IMPORT_BUNDLED_REPORT=true
```

این گزینه را بعد از Import موفق دوباره `false` کنید. Import با Batch Key از تکرار عادی جلوگیری می‌کند، اما بهتر است تنظیم Production روشن باقی نماند.

---

## 14. تست مستقیم Node.js قبل از IIS

```powershell
Set-Location C:\Apps\ElkIncidentHub
npm start
```

در یک PowerShell دیگر:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

خروجی مورد انتظار:

```json
{
  "status": "ok",
  "database": "ok"
}
```

فایل دیتابیس باید ساخته شود:

```powershell
Test-Path C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite
```

باز کردن صفحه اصلی مستقیم روی پورت 3000 باید پیام «هویت ویندوزی دریافت نشد» نشان دهد. این رفتار درست است، چون هویت فقط باید توسط IIS تزریق شود.

با `Ctrl+C` برنامه را متوقف کنید.

---

## 15. ساخت IIS Site

### ایجاد Application Pool

در IIS Manager:

1. Application Pools
2. Add Application Pool
3. Name: `ElkIncidentHubProxy`
4. .NET CLR Version: `No Managed Code`
5. Managed pipeline: `Integrated`

### ساخت Site

1. Sites → Add Website
2. Site name: `ElkIncidentHub`
3. Application Pool: `ElkIncidentHubProxy`
4. Physical Path: `C:\inetpub\ElkIncidentHubProxy`
5. Binding اولیه: HTTPS
6. Hostname: `incidenthub.corp.local`
7. Certificate: Certificate داخلی معتبر

### کپی web.config

```powershell
Copy-Item `
  C:\Apps\ElkIncidentHub\deploy\iis\web.config.template `
  C:\inetpub\ElkIncidentHubProxy\web.config

notepad.exe C:\inetpub\ElkIncidentHubProxy\web.config
```

داخل فایل این مقدار را پیدا کنید:

```text
REPLACE_WITH_AUTH_PROXY_SECRET
```

و دقیقاً با همان مقدار `AUTH_PROXY_SECRET` از `.env.production` جایگزین کنید.

### Authentication

در IIS Site → Authentication:

- Anonymous Authentication: Disabled
- Windows Authentication: Enabled

فایل `web.config` برای دو مسیر زیر استثنا ایجاد می‌کند:

```text
/api/integrations/elk/alerts
/api/health
```

این دو مسیر در IIS Anonymous هستند. مسیر ELK داخل برنامه با `ELK_WEBHOOK_SECRET` محافظت می‌شود.

### فعال کردن HTTPS فقط

پس از تست، Binding HTTP را حذف کنید یا فقط برای Redirect به HTTPS نگه دارید.

---

## 16. DNS و Certificate

در DNS داخلی رکورد زیر ایجاد شود:

```text
incidenthub.corp.local  ->  10.20.30.40
```

Certificate باید حداقل SAN زیر را داشته باشد:

```text
DNS: incidenthub.corp.local
```

Root CA و Intermediate CA باید روی Clientها و سرور ELK Trusted باشند.

تست DNS:

```powershell
Resolve-DnsName incidenthub.corp.local
```

تست TLS:

```powershell
Invoke-WebRequest https://incidenthub.corp.local/api/health -UseDefaultCredentials
```

---

## 17. اجرای دائمی با Windows Task Scheduler

ابتدا Build باید موفق شده باشد.

PowerShell Administrator:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
Set-Location C:\Apps\ElkIncidentHub
.\scripts\install-windows-task.ps1
```

بررسی:

```powershell
Get-ScheduledTask -TaskName "ELK Incident Hub"
Get-ScheduledTaskInfo -TaskName "ELK Incident Hub"
```

بررسی Process و پورت:

```powershell
Get-Process node -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

LocalAddress باید Loopback باشد، نه `0.0.0.0`.

Log برنامه:

```text
C:\Apps\ElkIncidentHub\logs\application.log
```

Restart:

```powershell
Stop-ScheduledTask -TaskName "ELK Incident Hub"
Start-ScheduledTask -TaskName "ELK Incident Hub"
```

حذف Task:

```powershell
.\scripts\uninstall-windows-task.ps1
```

---

## 18. اولین ورود مدیر

از یک سیستم Domain-Joined آدرس زیر را باز کنید:

```text
https://incidenthub.corp.local
```

اگر Windows Integrated Authentication درست باشد، مرورگر بدون ورود دستی یا با یک Prompt سازمانی وارد می‌شود.

اولین کاربری که شناسه نرمال‌شده او در `DASHBOARD_OWNER_EMAILS` باشد به‌صورت خودکار ADMIN می‌شود.

بعد از ورود:

1. بخش کاربران را باز کنید.
2. کاربران واقعی را با ایمیل نرمال‌شده ثبت کنید.
3. نقش ADMIN، OPERATOR یا VIEWER بدهید.
4. کاربران آزمایشی و ایمیل‌های `example.com` را وارد نکنید.
5. سرویس‌ها، مدیر سرویس و Alert Email را اصلاح کنید.

### اگر مرورگر مدام Username/Password می‌خواهد

- Client و Server باید در Domain یا Trust معتبر باشند.
- نام DNS را در Local Intranet Zone قرار دهید.
- از FQDN صحیح استفاده کنید.
- ساعت Client، Server و Domain Controller همگام باشد.
- Windows Authentication در Browser و IIS فعال باشد.
- IIS Log و Event Viewer را برای 401.x بررسی کنید.

---

## 19. تست ELK Webhook

PowerShell:

```powershell
Set-Location C:\Apps\ElkIncidentHub

.\scripts\test-elk-webhook.ps1 `
  -BaseUrl "https://incidenthub.corp.local" `
  -Secret "PUT_ELK_SECRET_HERE"
```

درخواست معادل:

```http
POST /api/integrations/elk/alerts
Authorization: Bearer <ELK_WEBHOOK_SECRET>
Content-Type: application/json
```

Payload نمونه در این فایل است:

```text
examples\elk-payload.json
```

دو بار همان Payload را ارسال کنید:

- بار اول باید Incident جدید بسازد.
- بار دوم باید با همان Fingerprint تجمیع شود و `occurrence_count` افزایش یابد.

### تنظیم Connector در Kibana

- Method: POST
- URL: `https://incidenthub.corp.local/api/integrations/elk/alerts`
- Header: `Authorization: Bearer <secret>`
- Header: `Content-Type: application/json`
- Certificate داخلی باید برای Java/Kibana قابل اعتماد باشد.

### محدودیت امنیتی پیشنهادی

علاوه بر Secret، دسترسی Endpoint از نظر Network ACL یا Firewall فقط به IPهای ELK/Kibana محدود شود.

---

## 20. اتصال Mail Gateway

برنامه این JSON را به `EMAIL_WEBHOOK_URL` ارسال می‌کند:

```json
{
  "to": ["receiver@corp.local"],
  "cc": ["copy@corp.local"],
  "subject": "عنوان ایمیل",
  "body": "متن ایمیل",
  "bugCode": "ELK-260727-01",
  "bugId": 123
}
```

اگر `EMAIL_WEBHOOK_SECRET` تنظیم شود، Header زیر نیز ارسال می‌شود:

```http
Authorization: Bearer <EMAIL_WEBHOOK_SECRET>
```

Mail Gateway می‌تواند به Exchange، Microsoft Graph، SMTP Relay یا سرویس داخلی متصل باشد.

اگر URL تنظیم نشده باشد، Draft و Queue در سامانه ثبت می‌شوند ولی ارسال واقعی انجام نمی‌شود.

---

## 21. Backup دیتابیس

Backup آنلاین با SQLite Backup API:

```powershell
Set-Location C:\Apps\ElkIncidentHub
$env:DB_PATH = "C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite"
$env:BACKUP_DIR = "C:\ProgramData\ElkIncidentHub\backups"
npm run db:backup
```

بررسی سلامت:

```powershell
npm run db:check
```

Backup باید به یک مقصد خارج از همان Server نیز کپی شود.

### ساخت Task روزانه Backup

نمونه اجرای روزانه ساعت 02:00:

```powershell
$action = New-ScheduledTaskAction `
  -Execute "C:\Windows\System32\cmd.exe" `
  -Argument '/c "cd /d C:\Apps\ElkIncidentHub && set DB_PATH=C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite && set BACKUP_DIR=C:\ProgramData\ElkIncidentHub\backups && npm.cmd run db:backup"'

$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask `
  -TaskName "ELK Incident Hub Backup" `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Force
```

### Restore

1. برنامه را Stop کنید.
2. از دیتابیس فعلی یک کپی اضطراری بگیرید.
3. فایل‌های `incident-hub.sqlite-wal` و `incident-hub.sqlite-shm` را بعد از Stop کنار بگذارید.
4. فایل Backup سالم را به نام `incident-hub.sqlite` جایگزین کنید.
5. Task برنامه را Start کنید.
6. Health Check و چند رکورد را بررسی کنید.

فرمان‌ها:

```powershell
Stop-ScheduledTask -TaskName "ELK Incident Hub"

Rename-Item `
  C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite `
  incident-hub.before-restore.sqlite

Copy-Item `
  C:\ProgramData\ElkIncidentHub\backups\incident-hub-SELECTED.sqlite `
  C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite

Remove-Item C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite-wal -ErrorAction SilentlyContinue
Remove-Item C:\ProgramData\ElkIncidentHub\data\incident-hub.sqlite-shm -ErrorAction SilentlyContinue

Start-ScheduledTask -TaskName "ELK Incident Hub"
```

---

## 22. Monitoring

Health URL:

```text
https://incidenthub.corp.local/api/health
```

موارد پیشنهادی برای مانیتورینگ:

- HTTP status باید 200 باشد.
- JSON باید `status=ok` داشته باشد.
- Task Scheduler باید Running باشد.
- Port 3000 باید فقط روی Loopback Listen باشد.
- فضای درایو دیتابیس کمتر از 20 درصد نشود.
- اندازه Log کنترل شود.
- Backup روزانه و Copy خارج از سرور بررسی شود.
- Event Viewer و IIS Logs برای 401، 502 و 500 بررسی شوند.

---

## 23. روش Update

1. Backup بگیرید.
2. نسخه فعلی و `.env.production` را نگه دارید.
3. Task برنامه را Stop کنید.
4. فایل‌های Source جدید را جایگزین کنید؛ پوشه `data` داخل ProgramData است و حذف نمی‌شود.
5. `npm install` اجرا کنید.
6. `npm run lint` و `npm run build` اجرا کنید.
7. Task را Start کنید.
8. Health، Login، ثبت Incident و Webhook را تست کنید.
9. در صورت خطا به نسخه قبلی Rollback کنید.

```powershell
Stop-ScheduledTask -TaskName "ELK Incident Hub"
Set-Location C:\Apps\ElkIncidentHub
npm install
npm run lint
npm run build
Start-ScheduledTask -TaskName "ELK Incident Hub"
Invoke-RestMethod https://incidenthub.corp.local/api/health
```

---

## 24. خطاهای محتمل و راه‌حل

### `npm` شناخته نمی‌شود

- Node نصب نشده یا PATH در Shell فعلی Refresh نشده است.
- PowerShell را بسته و دوباره باز کنید.

### خطای `node-gyp` یا نصب `better-sqlite3`

- نسخه Node خیلی جدید یا معماری متفاوت است.
- Build Tools C++ و Python نصب کنید.
- از Node x64 LTS استفاده کنید.
- Proxy یا Registry داخلی را بررسی کنید.

### IIS خطای 500.19 می‌دهد

- URL Rewrite یا ARR نصب نشده است.
- Section مربوط به Authentication یا Rewrite Lock شده است.
- Server Variableها در Allowed list ثبت نشده‌اند.
- `web.config` از نظر XML خراب است.

### IIS خطای 502.3 می‌دهد

- Node اجرا نیست.
- Build انجام نشده است.
- Port 3000 Listen نیست.
- Task با خطا بسته شده است.
- Log برنامه را بررسی کنید.

### صفحه پیام «هویت ویندوزی دریافت نشد» نشان می‌دهد

- سایت مستقیم از Port 3000 باز شده است.
- IIS هدر `X-Authenticated-User` را تزریق نکرده است.
- `AUTH_PROXY_SECRET` در IIS و `.env.production` یکسان نیست.
- Windows Authentication فعال نیست.

### کاربر 403 می‌گیرد

- مدیر اولیه نیست و هنوز در پنل کاربران ثبت نشده است.
- مقدار `AUTH_EMAIL_DOMAIN` اشتباه است.
- IIS کاربر را با قالب متفاوت می‌فرستد.
- کاربر Disabled است.

### ELK در IIS خطای 401 می‌گیرد

- استثنای Anonymous برای مسیر Webhook اعمال نشده است.
- Configuration در Parent Site قفل است.
- URL اشتباه است.

### ELK از برنامه خطای 401 می‌گیرد

- Bearer Secret اشتباه یا Header حذف شده است.

### ELK خطای 503 می‌گیرد

- `ELK_WEBHOOK_SECRET` در Environment تنظیم نشده است.

### خطای Certificate

- SAN با DNS یکی نیست.
- Root CA روی Client یا ELK Trusted نیست.
- ساعت سیستم اشتباه است.

### خطای `database is locked`

- بیش از یک Instance برنامه اجرا شده است.
- فایل دیتابیس روی Network Share قرار دارد.
- Antivirus یا Backup Agent فایل را Lock کرده است.
- DB باید روی NTFS محلی باشد و تنها یک Process برنامه اجرا شود.

### فضای دیسک زیاد مصرف می‌شود

- Log بدون Rotation رشد کرده است.
- Backupهای قدیمی حذف نشده‌اند.
- Audit و Eventها زیاد شده‌اند.
- سیاست Retention تعریف کنید.

### تاریخ و ساعت اشتباه است

- ساعت Windows و Domain/NTP را اصلاح کنید.
- داده‌ها در DB به UTC ذخیره می‌شوند؛ نمایش ایمیل فعلی روی Asia/Tehran است.

---

## 25. چک‌لیست Go-Live

- [ ] Windows به‌روز و دارای IP ثابت است.
- [ ] Server عضو Domain یا دارای روش احراز هویت جایگزین است.
- [ ] DNS داخلی ساخته شده است.
- [ ] Certificate معتبر نصب شده است.
- [ ] IIS، Windows Authentication، URL Rewrite و ARR نصب هستند.
- [ ] ARR Proxy فعال است.
- [ ] Allowed Server Variables ثبت شده‌اند.
- [ ] Node LTS x64 نصب شده است.
- [ ] `npm install`، lint و build موفق هستند.
- [ ] `.env.production` با Secretهای متفاوت تنظیم شده است.
- [ ] DB روی NTFS محلی و ACL آن محدود است.
- [ ] برنامه روی `127.0.0.1:3000` اجرا می‌شود.
- [ ] Port 3000 در شبکه باز نیست.
- [ ] IIS فقط HTTPS ارائه می‌کند.
- [ ] مدیر اولیه با شناسه صحیح وارد شده است.
- [ ] کاربران واقعی و Roleها ثبت شده‌اند.
- [ ] ایمیل‌های نمونه حذف یا استفاده نشده‌اند.
- [ ] ELK Webhook با Payload واقعی تست شده است.
- [ ] Deduplication با ارسال دوباره تست شده است.
- [ ] Mail Gateway تست شده است.
- [ ] Backup و Restore آزمایشی موفق است.
- [ ] Health Check در Monitoring ثبت شده است.
- [ ] Rollback Plan مستند شده است.

---

## 26. مسیر جایگزین بدون Active Directory

اگر Server عضو Domain نیست، برای Pilot می‌توان IIS Basic Authentication را با Local Windows Account فعال کرد:

- HTTPS اجباری است.
- Anonymous غیرفعال باشد.
- Windows Authentication غیرفعال شود.
- Basic Authentication فعال شود.
- `AUTH_USER` همچنان توسط IIS به Rule داده می‌شود.

این مسیر از SSO دامنه ضعیف‌تر است. برای Production سازمانی، Domain Authentication یا یک Identity Provider داخلی ترجیح دارد.

---

## 27. مسیر توسعه آینده

برای High Availability یا چند App Server:

- SQLite به PostgreSQL داخلی منتقل شود.
- Session/Identity پشت Load Balancer استاندارد شود.
- دو App Server با Reverse Proxy یا Load Balancer اجرا شوند.
- Backup دیتابیس به ابزار مرکزی سازمان منتقل شود.
- Secretها از Vault داخلی خوانده شوند.
- Logها به ELK مرکزی ارسال شوند.
- Rate Limit و IP Allowlist اختصاصی برای Webhook اضافه شود.
