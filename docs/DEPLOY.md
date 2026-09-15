# نشر HORUS على Render المجاني (خطواتك أنت — حوالي 15 دقيقة)

## 1) تيليجرام (3 دقائق)
1. افتح @BotFather في تيليجرام → `/newbot` → اسم: `Horus` → يوزر ينتهي بـ`bot`
2. انسخ التوكن (لا ترسله في الشات)
3. اعرف معرّفك: افتح @userinfobot → انسخ رقم الـ`Id` (ده مش سرّي، ابعتهولي عادي)

## 2) GitHub + Render (7 دقائق)
1. اعمل repo جديد على github.com (خاص) وارفع مجلد `horus-core` عليه:
   - من GitHub Desktop أو: `git remote add origin <رابط الريبو>` ثم `git push -u origin master`
2. ادخل render.com ← سجّل بحساب GitHub ← New + ← Web Service ← اختر الريبو
   - Build: `pip install -r requirements.txt` — Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - الخطة: Free
3. في صفحة السروس ← Environment ← أضف (القيم من عندك، لا ترسلها شات):
   - `TELEGRAM_BOT_TOKEN` = توكن البوت
   - `TELEGRAM_ALLOWED_USER_IDS` = رقم الـId بتاعك
   - `OPENAI_API_KEY` = مفتاح OpenAI
   - `GROQ_API_KEY` = مفتاح Groq (اختياري)
   - `PUBLIC_BASE_URL` = رابط السروس (مثل `https://horus-core.onrender.com`)
4. Deploy ← لما يخلص افتح `رابطك/health` لازم تشوف `{"ok": true}`

## 3) ربط الـwebhook (2 دقيقة، من جهازك)
```
set TELEGRAM_BOT_TOKEN=التوكن_بتاعك
set PUBLIC_BASE_URL=رابط_رندر_بتاعك
python scripts/set_webhook.py
```
لازم يطبع `OK: True` — بعدها ابعت `/status` للبوت في تيليجرام.

## 4) Supabase (اختياري الآن — 5 دقائق)
1. supabase.com ← New project (Free)
2. SQL Editor ← الصق محتوى `deploy/supabase_schema.sql` ← Run
3. Settings ← API ← انسخ URL + anon key ← حطهم في Render كـ`SUPABASE_URL` و`SUPABASE_KEY`

## 5) منع نوم Render المجاني
- uptimerobot.com ← monitor مجاني كل 5 دقائق على `رابطك/health`

## ملاحظات مصر/تكلفة
- لا بطاقة مطلوبة لأي خطوة فوق (Render/Supabase/Telegram/Groq مجاني بلا كارت)
- OpenAI فقط يحتاج دفع مسبق (pay-as-you-go) — اشحن $5 تكفي شهورًا على gpt-4o-mini
