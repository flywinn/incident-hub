# IncidentHub v1.15 — NOC Workflow

این نسخه برای جریان واقعی NOC طراحی شده است: مشاهده رخداد در Elastic/Kibana، ثبت Incident، انتخاب مسئول، اطلاع‌رسانی کوتاه، ثبت پیگیری همان روز و اعلام رفع.

## اصل ایمیل

ایمیل پیش‌فرض «اطلاع‌رسانی» است، نه درخواست علت یا RCA.

عبارت‌هایی مانند موارد زیر در قالب‌های پیش‌فرض استفاده نمی‌شوند:

- خواهشمند است علت فنی اعلام شود.
- علت عدم رفع چیست؟
- اقدام اصلاحی اعلام شود.
- RCA اعلام شود.

اطلاعات فقط در صورت وجود داده معتبر وارد متن می‌شوند.

## اطلاعات مفید از Kibana

IncidentHub می‌تواند این داده‌ها را در SmartMail تشخیص دهد:

- HTTP Status Code
- Endpoint / Path
- Load Balancer
- Backend
- Server / Node
- 5XX Error Count
- Error Rate
- Request Count
- Success Rate
- P95 / P99 در رخدادهای Latency

نمودار کامل Timeline و جدول‌های بزرگ Top-N در Kibana باقی می‌مانند و داخل IncidentHub تکرار نمی‌شوند.

## نمونه ایمیل فنی

```text
با سلام و احترام،

جهت اطلاع، در سرویس Flight خطای 503 مشاهده شده است.

مسیر درگیر:
/api/V1/Flight/AllPassengerETicket

LB: LB-FL-C-1
Backend: bk_TravelIranianApi
Server: API1AF

تعداد خطا: 174
نرخ خطا: 0.53%
تعداد درخواست: 11,119

شناسه رخداد: FLT-260804-01

با تشکر و احترام.
```

## نمونه ایمیل پیگیری

```text
با سلام و احترام،

پیرو اطلاع‌رسانی قبلی، خطا در آخرین بررسی نیز مشاهده شده است.

آخرین مشاهده: ۱۴۰۵/۰۵/۲۶، ۱۳:۱۸

مسیر درگیر:
/api/V1/Flight/AllPassengerETicket

LB: LB-FL-C-1

شناسه رخداد: FLT-260804-01

با تشکر و احترام.
```

جمله «در آخرین بررسی نیز مشاهده شده است» فقط وقتی استفاده می‌شود که زمان آخرین مشاهده از زمان آخرین ایمیل جدیدتر باشد.

## نمونه اعلام رفع

```text
با سلام و احترام،

جهت اطلاع، موضوع ثبت‌شده در سرویس Flight بر اساس آخرین بررسی رفع شده است.

شناسه رخداد: FLT-260804-01

با تشکر و احترام.
```

## گیرندگان

- ایمیل مسئولان انتخاب‌شده Incident به‌صورت خودکار در `To` قرار می‌گیرد.
- ایمیل‌های معتبر سرویس در صورت تنظیم همچنان در گیرندگان لحاظ می‌شوند.
- `noc@flytoday.ir` به‌صورت پیش‌فرض در CC قرار می‌گیرد.
- آدرس تکراری هم‌زمان در To و CC حذف می‌شود.
- آدرس‌های placeholder مانند `@internal.local` و `@example.com` وارد ایمیل واقعی نمی‌شوند.

## پیگیری

پیگیری جدید به‌صورت پیش‌فرض برای زمان فعلی همان روز ساخته می‌شود، نه 24 ساعت بعد.

Defaults قدیمی زیر به‌صورت سازگار مهاجرت می‌شوند:

```text
بررسی فنی + 24 hours
```

به:

```text
پیگیری امروز + 0 hours
```

اگر Administrator قبلاً تنظیمات پیگیری اختصاصی ساخته باشد، آن تنظیمات به زور overwrite نمی‌شوند.

## Kibana / ELK Webhook پیشنهادی

Webhook موجود همچنان با Payload فعلی کار می‌کند. برای SmartMail غنی‌تر، در `message` یا Payload قابل ثبت می‌توان این اطلاعات را ارسال کرد:

```json
{
  "alert_id": "{{alert.id}}",
  "title": "HTTP 503 - Flight",
  "service": "Flight",
  "service_code": "FLT",
  "priority": "P2",
  "fingerprint": "{{rule.id}}:{{context.group}}",
  "message": "HTTP 503\n/api/V1/Flight/AllPassengerETicket\nLB-FL-C-1\nbk_TravelIranianApi\nAPI1AF\nerror count: 174\nerror rate: 0.53%\nrequests: 11119",
  "dashboard_url": "{{context.link}}"
}
```

SmartMail از متن و داده Incident اطلاعات معتبر را استخراج می‌کند و فیلدهای ناموجود را در ایمیل نمایش نمی‌دهد.

## Endpoint Noise

موارد عمومی زیر به‌صورت پیش‌فرض از SmartMail حذف می‌شوند:

```text
/favicon.ico
/robots.txt
/manifest.json
/site.webmanifest
/pwa-manifest...
/_next
/static
/assets
/health
/healthz
/ready
/metrics
```

## Safety

قبل از Cutover روی Production اجرا شود:

```powershell
powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File "D:\IncidentHub\Dev\scripts\Preflight-v1.15.ps1"
```

این اسکریپت Read-only است و Build، Migration، Stop، Restart یا تغییر Config انجام نمی‌دهد.
