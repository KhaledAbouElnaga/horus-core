"""HORUS Cloud Core — FastAPI: webhook تيليجرام + API + صحة + تكلفة."""
from fastapi import FastAPI, Request, HTTPException
from app.core.config import settings
from app.core import agent, voice_state
from app.tasks import engine

app = FastAPI(title="HORUS", version="0.1.0")


@app.get("/health")
async def health():
    return {"ok": True, "service": "horus-core", "voice": voice_state.mode,
            "active_tasks": len(engine.active_tasks())}


@app.get("/cost")
async def cost():
    from app.adapters.llm import router
    return {"month_usd": round(router.monthly_cost(), 4), "cap": settings.cost_monthly_cap_usd}


@app.post("/webhook/telegram")
async def telegram_webhook(req: Request):
    if not settings.telegram_bot_token:
        raise HTTPException(500, "bot not configured")
    data = await req.json()
    msg = data.get("message") or {}
    chat = msg.get("chat", {})
    chat_id = str(chat.get("id", ""))
    user_id = msg.get("from", {}).get("id")
    text = msg.get("text", "")
    if settings.allowed_users and user_id not in settings.allowed_users:
        return {"ok": False, "reason": "unauthorized"}
    if not text:
        return {"ok": True, "skipped": "non-text (voice/files M4)"}
    reply, model, cost = await agent.handle_text(text)
    import httpx
    async with httpx.AsyncClient() as c:
        await c.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                     json={"chat_id": chat_id, "text": reply[:4000]})
        if voice_state.mode == "on":
            try:
                path = await voice_state.speak(reply[:500])
                with open(path, "rb") as f:
                    await c.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendVoice",
                                 data={"chat_id": chat_id}, files={"voice": f})
            except Exception:
                pass
    return {"ok": True, "model": model, "cost": cost}
