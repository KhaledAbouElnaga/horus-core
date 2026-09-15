"""يربط Telegram webhook بالسيرفر — التوكن يُقرأ من متغير بيئة فقط، لا يطبع ولا يُسجل.
استخدام آمن (الصقه في terminal مرئي، ليس في الشات):
  set TELEGRAM_BOT_TOKEN=ضع_التوكن_هنا
  set PUBLIC_BASE_URL=https://horus-core.onrender.com
  python scripts/set_webhook.py
"""
import os
import httpx

token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
base = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
assert token, "TELEGRAM_BOT_TOKEN missing"
assert base, "PUBLIC_BASE_URL missing"

url = f"{base}/webhook/telegram"
r = httpx.post(f"https://api.telegram.org/bot{token}/setWebhook",
               json={"url": url, "allowed_updates": ["message"]}, timeout=30)
print("HTTP:", r.status_code)
print("OK:", r.json().get("ok"))
# لا نطبع التوكن أبدًا
