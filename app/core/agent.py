"""HORUS agent — adaptive planning: بسيط = مباشر، معقد = خطة."""
from app.adapters.llm import router

SYSTEM = ("أنت حورس، مساعد خالد الشخصي. مصري، مباشر، عملي. "
          "مهام بسيطة: نفذ فورًا بلا أسئلة. مهام معقدة: قسّم لخطوات. "
          "لا تنتحل شخصية خالد أبدًا — عرّف نفسك 'حورس، مساعد خالد'. "
          "لا دفع/شراء/التزام مالي بدون موافقة صريحة.")


async def handle_text(user_text: str, context: list[dict] | None = None) -> tuple[str, str, float]:
    t = user_text.strip()
    # أوامر مباشرة بلا LLM (توفير tokens)
    if t.startswith("/voice"):
        from app.core import voice_state
        parts = t.split()
        if len(parts) == 1 or parts[1] == "status":
            return f"وضع الصوت: {voice_state.mode}", "local", 0.0
        if parts[1] in ("on", "off"):
            voice_state.mode = "on" if parts[1] == "on" else "off"
            return ("تمام، من دلوقتي هرد بصوت 🎙️" if parts[1] == "on"
                    else "تمام، هرجع نص بس."), "local", 0.0
    if t in ("/status", "صحتك؟", "status"):
        return await _status_reply(), "local", 0.0
    if t in ("/tasks", "المهام"):
        from app.tasks import engine
        act = engine.active_tasks()
        if not act:
            return "مفيش مهام شغالة حاليًا.", "local", 0.0
        return "\n".join(f"{x['task_id']}: {x['title']} [{x['status']}]" for x in act), "local", 0.0
    if t in ("/cost", "التكلفة"):
        from app.adapters.llm import router as r
        from app.core.config import settings
        return f"التكلفة التقديرية (30 يوم): ${r.monthly_cost():.4f} / سقف ${settings.cost_monthly_cap_usd}", "local", 0.0

    # وإلا: LLM واحد فقط
    from app.adapters.memory import store
    mem = await store.recall(t, limit=3)
    mem_txt = "\n".join(f"- {m['key']}: {m['value']}" for m in mem) if mem else "لا يوجد."
    messages = [{"role": "system", "content": SYSTEM + f"\nذاكرة ذات صلة:\n{mem_txt}"},
                *(context or []), {"role": "user", "content": t}]
    tier = "strong" if len(t) > 400 or any(w in t for w in ["خطة", "قارن", "احجز", "اتصل"]) else "fast"
    return await router.complete(messages, model_tier=tier)


async def _status_reply() -> str:
    from app.tasks import engine
    n = len(engine.active_tasks())
    return f"حورس شغال ✅ — مهام نشطة: {n} — الوضع السحابي جاهز."
