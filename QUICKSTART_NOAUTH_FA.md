# حالت No-Auth فقط برای Pilot موقت

> هشدار جدی: No-Auth به هر سیستمی که به پورت برنامه دسترسی داشته باشد سطح دسترسی مدیر می‌دهد. این حالت برای Production یا شبکه‌ی اشتراکی مجاز نیست.

روش پیشنهادی و پشتیبانی‌شده برای Production، Local Auth است:

- [`QUICKSTART_LOCAL_AUTH_FA.md`](./QUICKSTART_LOCAL_AUTH_FA.md)

اگر برای عیب‌یابی کوتاه‌مدت در یک VM ایزوله واقعاً به No-Auth نیاز است، `AUTH_MODE` را از فایل environment حذف و `AUTH_DISABLED=true` تنظیم کنید. هم‌زمان Firewall باید دسترسی را فقط به IP مدیر محدود کند. پس از پایان تست، مقدار را به `false` بازگردانید و Runtime را Restart کنید.

وجود `AUTH_MODE=LOCAL` یا `AUTH_MODE=PROXY` عمداً بر مقدار قدیمی `AUTH_DISABLED=true` اولویت دارد تا یک تنظیم باقی‌مانده نتواند احراز هویت را ناخواسته خاموش کند.
