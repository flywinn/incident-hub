# راهنمای جامع اتصال PRTG به سامانه Incident Hub و ارسال خودکار به تلگرام

این ماژول به طور کامل درون سورس‌کد سامانه شما قرار داده شده است و دو قابلیت اساسی را به پروژه اضافه می‌کند:
1. **ابزار داخلی تبدیل آلارم در داشبورد:** دسترسی از طریق منوی سایدبار تحت عنوان **«ابزار PRTG»**.
2. **اندپوینت اختصاصی وب‌هوک خودکار:** در مسیر `/api/integrations/prtg` برای دریافت مستقیم خطاهای سنسور از سرور PRTG و دیسپچ مستقیم به تلگرام.

---

## ۱. فایل‌های اضافه و ویرایش شده در سورس پروژه

- **`lib/prtgParser.ts`**: کتابخانه اصلی تبدیل، پاک‌سازی خطاهای تکراری و قالب‌بندی پیام‌های تلگرام.
- **`app/api/integrations/prtg/route.ts`**: اندپوینت API برای دریافت نوتیفیکیشن‌های PRTG و ارسال خودکار به تلگرام.
- **`app/prtg-tool.tsx`**: کامپوننت گرافیکی کاربری با ۴ قالب استاندارد تلگرام و قابلیت تست زنده ارسال پیام.
- **`app/incident-hub.tsx`**: ثبت تب جدید «ابزار PRTG» (⚡) در سایدبار اصلی سامانه.

---

## ۲. تنظیم وب‌هوک در خود سرور PRTG (ارسال خودکار)

در سرور PRTG وارد شوید:
1. به مسیر زیر بروید:
   ```text
   Setup ➔ Account Settings ➔ Notification Templates ➔ Add Notification Template
   ```
2. بخش **EXECUTE HTTP ACTION** را فعال کنید:
   - **URL:**
     ```text
     https://YOUR-INCIDENT-HUB-DOMAIN/api/integrations/prtg?secret=YOUR_PRTG_SECRET&template=grouped-standard
     ```
     *(به جای `YOUR_PRTG_SECRET` مقدار `PRTG_WEBHOOK_SECRET` را قرار دهید).*
   - **HTTP Method:** `POST`
   - **SNI (Server Name Indication):** گزینه `Send SNI` را انتخاب کنید.
   - **Postdata:**
     ```text
     %device	%name	%status	%lastvalue
     ```
3. در تب **NOTIFICATION SUMMARIZATION** گزینه:
   > **Send first DOWN and UP message ASAP, then summarize**
   را با فاصله زمانی ۱ یا ۲ دقیقه بگذارید تا تمام سنسورهای هم‌زمان در یک پیام مرتب و شیک تلگرام جمع‌بندی شوند.

---

## ۳. متغیرهای محیطی اختیاری (.env)

مقادیر اتصال را در `.env.production` تعریف کنید:
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
TELEGRAM_CHAT_ID=-100123456789
PRTG_WEBHOOK_SECRET=CHANGE-THIS-TO-A-RANDOM-SECRET
```

---

## ۴. قالب‌های خروجی تلگرام

- **Standard (`grouped-standard`):** قالب پیش‌فرض دسته‌بندی‌شده بر اساس نوع سنسور (Disk, Memory, Ping, ...) با بولد بودن مقادیر.
- **Compact (`grouped-compact`):** قالب فشرده تک‌خطی مناسب گروه‌های با ترافیک بالای پیام.
- **Clean Bullets (`clean-bullets`):** نمایش تمیز همراه با ایموجی وضعیت بدون هدرهای بزرگ.
- **NOC Incident (`noc-ticket`):** تیکت رسمی شیفت مانیتورینگ با آمار تفکیک شده خطاهای Critical و Warning.
