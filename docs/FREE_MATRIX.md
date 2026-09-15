# Free Infrastructure Matrix (مصادر رسمية، سبتمبر 2026)

| Component | Selected | Free limits (موثقة) | Card؟ | مصر؟ | API؟ | OSS/بديل | Limitation | Status |
|---|---|---|---|---|---|---|---|---|
| Messaging | Telegram Bot API | غير محدود رسائل/بوتات؛ 30msg/s | لا | ✅ | ✅ رسمي | n/a | يحتاج سيرفر webhook | VERIFIED (بحث) |
| Compute | Render Free | 750h/شهر؛ sleep بعد خمول | لا | ✅ | ✅ | بديل: Oracle Always Free | sleep → يُعالج بـUptimeRobot ping | CONFIGURED |
| DB/Memory | Supabase Free | 500MB DB + 1GB storage + 5GB egress؛ pause بعد أسبوع خمول | لا | ✅ | ✅ Postgres | بديل: SQLite محلي | pause → cron ping يومي | CONFIGURED |
| Edge/webhook | Cloudflare Workers Free | 100k req/يوم؛ 10ms CPU؛ KV 100k read/يوم | لا | ✅ | ✅ | n/a | 10ms CPU → للراوتر الخفيف فقط | DESIGNED |
| LLM primary | OpenAI gpt-4o-mini | $0.15/$0.60 لكل 1M token (الدفع الوحيد المسموح) | نعم للـAPI | ✅ | ✅ | — | تكلفة ~$1-3/شهر للاستخدام الشخصي | DESIGNED |
| LLM fallback | Groq Free | 30 RPM / ~1000 req/يوم / بلا بطاقة | لا | ✅ | OpenAI-compatible | OSS models | حدود يومية → fallback فقط | DESIGNED |
| STT عربي | Groq Whisper turbo | 2000 طلب صوتي/يوم مجانًا | لا | ✅ | ✅ | faster-whisper محلي | دقة مصرية ~جيدة (WER 25-35%) | DESIGNED |
| TTS مصري | Edge-TTS ar-EG | مجاني بلا مفتاح/بلا كوتا معلنة (Salma/Shakir) | لا | ✅ | غير رسمي | Coqui XTTS محلي | غير رسمي قد يتغير | DESIGNED |
| Browser cloud | Steel Hobby | 100h متصفح/شهر مجانًا | لا (hobby) | ✅ | Playwright | self-host Playwright مجانًا | 100h تكفي شخصيًا | DESIGNED |
| Browser local | Playwright Chromium | مجاني تمامًا | لا | ✅ | ✅ | ✅ OSS | يحتاج جهاز شغال | TESTED (تُختبر الآن) |
| Scheduler | APScheduler + CF Cron | مجاني داخل التطبيق (5 cron/account في CF) | لا | ✅ | ✅ | ✅ | لا LLM polling | CONFIGURED |
| Telephony | Twilio Trial | 75 دقيقة مجانًا ثم ~$0.21/دقيقة مصر | نعم لاحقًا | ⚠️ أسعار مصر مرتفعة | ✅ | SIP محلي للـPoC | PSTN مستحيل مجاني دائمًا → معزول | DESIGNED (PoC محاكاة) |
| Email/Calendar | Gmail/Calendar API | مجاني ضمن كوتا جوجل | لا (OAuth) | ✅ | ✅ رسمي | n/a | يحتاج OAuth consent (Human Gate واحدة) | DESIGNED |

**الخلاصة المالية:** كل شيء $0 دائم عدا (1) OpenAI ~دولارات شهريًا، (2) مكالمات PSTN مصر ~$0.21/دقيقة بعد نفاد الـtrial.
