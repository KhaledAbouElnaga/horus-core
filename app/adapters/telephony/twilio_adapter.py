"""Telephony adapter — Twilio trial معزول. PSTN الحقيقي مدفوع (~$0.21/دقيقة مصر).
STATUS: DESIGNED + CONFIGURED (يحتاج Twilio trial keys للـTESTED). PoC المجاني: محاكاة سحابية."""
from app.core.config import settings


def status() -> dict:
    configured = bool(settings.twilio_account_sid and settings.twilio_auth_token)
    return {"provider": "twilio", "state": "CONFIGURED" if configured else "DESIGNED",
            "trial_minutes_free": 75, "eg_mobile_per_min_usd": 0.209,
            "note": "PSTN مدفوع بعد الـtrial — معزول خلف هذا الـadapter"}


async def place_call(to: str, script: str) -> dict:
    s = status()
    if s["state"] == "DESIGNED":
        return {"ok": False, "simulated": True,
                "message": f"[PoC محاكاة] كنت هتصل بـ{to}: {script[:80]}… — فعّل Twilio trial للمكالمة الحقيقية."}
    import httpx
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Calls.json",
            auth=(settings.twilio_account_sid, settings.twilio_auth_token),
            data={"To": to, "From": settings.twilio_from_number,
                  "Twiml": f"<Response><Say language='ar-EG'>{script}</Say></Response>"})
        return {"ok": r.status_code < 300, "sid": r.text[:100]}
