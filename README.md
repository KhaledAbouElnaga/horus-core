# HORUS — مساعد شخصي ذكي (Cloud-First, بأقل تكلفة)
Personal AI Agent + Executive Assistant + Browser + Voice + Automation.

## التشغيل السريع (محلي للتجربة)
```bash
cd D:/HORUS/horus-core
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt
copy .env.example .env   # ثم املأ المفاتيح
uvicorn app.main:app --port 8000
```

## الإنتاج (مجاني)
- Compute: Render Free Web Service (مع UptimeRobot ping ضد الـsleep) — بديل: Fly.io / Oracle Always Free
- DB/Memory: Supabase Free Postgres (500MB, pause بعد أسبوع خمول — يُمنع بـcron ping)
- Webhook edge: Cloudflare Workers Free (يستقبل Telegram webhook ويحوّله)
- Messaging: Telegram Bot API (مجاني غير محدود)
- LLM primary: OpenAI (gpt-4o-mini يومي + gpt-4o/gpt-5-mini للمعقد) — الدفع الوحيد المسموح
- LLM fallback: Groq Free (Llama 3.1 8B, بلا بطاقة)
- STT: Groq Whisper Free (2000 طلب/يوم) ← OpenAI Whisper fallback
- TTS: Edge-TTS (ar-EG-SalmaNeural/ShakirNeural) مجاني بلا مفتاح ← OpenAI TTS fallback
- Browser cloud: Steel Hobby (100h/شهر مجانًا) + Playwright محلي/self-hosted
- Scheduler: APScheduler داخل التطبيق + Cloudflare Cron Triggers
- Calls: Twilio Trial (75 دقيقة) ثم دفع لمصر ~$0.21/دقيقة — معزول خلف TelephonyProvider

## أوامر التحكم (عربي طبيعي أو /commands)
- `/status` `صحّتك؟` — حالة النظام
- `/voice on|off|status` أو "رد عليّ بصوت"
- `/tasks` `إيه المهام الشغالة؟` — المهام النشطة
- `/cost` `صرفت كام؟` — التكلفة
- `/forget X` `انسى X` — حذف ذاكرة
- `/cancel <task_id>` — إلغاء مهمة

## HUMAN GATE
يتوقف فقط عند: CAPTCHA/2FA/passkey/OAuth/password حساس/دفع/التزام مالي-قانوني/قرار حساس غامض.
صيغة التصعيد موحدة في `app/core/gates.py`.
