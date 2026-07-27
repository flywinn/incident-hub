# ELK Incident Hub — نسخه On-Prem مخصوص Windows/IIS

این شاخه از پروژه برای اجرای کاملاً داخلی در دیتاسنتر آماده شده است.

## تغییرات نسبت به نسخه اولیه

- Cloudflare D1 با SQLite محلی و پایدار جایگزین شده است.
- Vinext/Cloudflare Worker حذف و اجرای استاندارد Next.js روی Node.js فعال شده است.
- ورود ChatGPT Sites با هویت Windows Authentication پشت IIS جایگزین شده است.
- برنامه فقط روی `127.0.0.1:3000` اجرا می‌شود و نباید مستقیم در شبکه منتشر شود.
- IIS روی HTTPS هویت کاربر و یک Proxy Secret را به برنامه تزریق می‌کند.
- داده‌های نمونه و گزارش داخلی به‌صورت پیش‌فرض وارد نمی‌شوند.
- Health Check، Backup دیتابیس، اجرای خودکار Windows Task Scheduler و تست Webhook اضافه شده است.

راهنمای کامل: `ONPREM_WINDOWS_ZERO_TO_HUNDRED_FA.md`
