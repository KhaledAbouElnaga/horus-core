"""Model router: OpenAI primary + Groq free fallback. Single call per turn."""
import time
from collections import defaultdict

TIER_MODELS = {
    "fast": {"primary": "gpt-4o-mini", "fallback": "llama-3.1-8b-instant"},
    "strong": {"primary": "gpt-4o", "fallback": "llama-3.3-70b-versatile"},
}

PRICES_PER_1M = {  # input, output USD — للـCost Guard التقديري
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "llama-3.1-8b-instant": (0.0, 0.0),
    "llama-3.3-70b-versatile": (0.0, 0.0),
}

_cooldowns: dict[str, float] = defaultdict(float)
usage_log: list[dict] = []


def _available(model: str) -> bool:
    return time.time() >= _cooldowns.get(model, 0)


def pick_model(tier: str) -> str:
    m = TIER_MODELS.get(tier, TIER_MODELS["fast"])
    if _available(m["primary"]):
        return m["primary"]
    return m["fallback"]


def mark_rate_limited(model: str, cooldown_s: int = 3600) -> None:
    _cooldowns[model] = time.time() + cooldown_s


async def complete(messages: list[dict], model_tier: str = "fast") -> tuple[str, str, float]:
    """يرجع (text, model_used, est_cost_usd). يحاول primary ثم fallback."""
    from app.core.config import settings

    tier = TIER_MODELS.get(model_tier, TIER_MODELS["fast"])
    candidates = [tier["primary"], tier["fallback"]]
    last_err: Exception | None = None
    for model in candidates:
        if not _available(model):
            continue
        try:
            if model.startswith("gpt-"):
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=settings.openai_api_key)
                r = await client.chat.completions.create(model=model, messages=messages)
                text = r.usage and r.usage.completion_tokens is not None and r.choices[0].message.content or ""
                inp = r.usage.prompt_tokens if r.usage else 0
                out = r.usage.completion_tokens if r.usage else 0
                pi, po = PRICES_PER_1M.get(model, (0, 0))
                cost = inp / 1e6 * pi + out / 1e6 * po
            else:
                from groq import AsyncGroq
                if not settings.groq_api_key:
                    raise RuntimeError("no groq key")
                client = AsyncGroq(api_key=settings.groq_api_key)
                r = await client.chat.completions.create(model=model, messages=messages)
                text = r.choices[0].message.content or ""
                cost = 0.0
            usage_log.append({"model": model, "cost": cost, "ts": time.time()})
            return text, model, cost
        except Exception as e:  # noqa: BLE001
            last_err = e
            if "429" in str(e) or "rate" in str(e).lower():
                mark_rate_limited(model)
            continue
    raise RuntimeError(f"all LLM providers failed: {last_err}")


def monthly_cost() -> float:
    now = time.time()
    return sum(u["cost"] for u in usage_log if now - u["ts"] < 30 * 86400)
