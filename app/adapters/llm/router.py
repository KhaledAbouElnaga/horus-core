"""Zero-cost-first model router with cooldown failover.

Production HORUS currently runs on the Cloudflare Worker. This Python router is
kept compatible for local/Render use and mirrors the same safety policy:
free providers first, paid OpenAI only when PAID_LLM_MODE=emergency.
"""
import time
from collections import defaultdict
from typing import Any

FREE_TIERS = {
    "fast": [
        {"provider": "groq", "model": "openai/gpt-oss-20b", "base_url": "https://api.groq.com/openai/v1"},
        {"provider": "groq", "model": "llama-3.1-8b-instant", "base_url": "https://api.groq.com/openai/v1"},
        {"provider": "sambanova", "model": "Meta-Llama-3.3-70B-Instruct", "base_url": "https://api.sambanova.ai/v1"},
        {"provider": "sambanova", "model": "DeepSeek-V3.1", "base_url": "https://api.sambanova.ai/v1"},
        {"provider": "gemini", "model": "gemini-2.5-flash-lite", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/"},
        {"provider": "openrouter", "model": "openrouter/free", "base_url": "https://openrouter.ai/api/v1"},
    ],
    "strong": [
        {"provider": "groq", "model": "openai/gpt-oss-120b", "base_url": "https://api.groq.com/openai/v1"},
        {"provider": "groq", "model": "llama-3.3-70b-versatile", "base_url": "https://api.groq.com/openai/v1"},
        {"provider": "sambanova", "model": "gpt-oss-120b", "base_url": "https://api.sambanova.ai/v1"},
        {"provider": "sambanova", "model": "Meta-Llama-3.3-70B-Instruct", "base_url": "https://api.sambanova.ai/v1"},
        {"provider": "gemini", "model": "gemini-2.5-flash", "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/"},
        {"provider": "openrouter", "model": "openrouter/free", "base_url": "https://openrouter.ai/api/v1"},
    ],
}

PAID_EMERGENCY = {
    "fast": {"provider": "openai_paid_emergency", "model": "gpt-4o-mini", "base_url": None},
    "strong": {"provider": "openai_paid_emergency", "model": "gpt-4o", "base_url": None},
}

PRICES_PER_1M = {  # input, output USD; only used for paid emergency accounting
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
}

_cooldowns: dict[str, float] = defaultdict(float)
usage_log: list[dict[str, Any]] = []


def _available(key: str) -> bool:
    return time.time() >= _cooldowns.get(key, 0)


def _cooldown(key: str, seconds: int) -> None:
    _cooldowns[key] = time.time() + seconds


def _api_key(provider: str, settings: Any) -> str:
    if provider == "groq":
        return settings.groq_api_key
    if provider == "sambanova":
        return getattr(settings, "sambanova_api_key", "")
    if provider == "gemini":
        return getattr(settings, "gemini_api_key", "")
    if provider == "openrouter":
        return getattr(settings, "openrouter_api_key", "")
    if provider == "openai_paid_emergency":
        return settings.openai_api_key
    return ""


def _classify_cooldown(error: Exception) -> int:
    s = str(error).lower()
    if "401" in s or "403" in s or "auth" in s:
        return 21600
    if "404" in s or "model" in s and ("unavailable" in s or "not found" in s):
        return 86400
    if "429" in s or "rate" in s:
        return 3600
    if any(x in s for x in ["500", "502", "503", "504", "timeout", "overload"]):
        return 300
    return 120


def _candidates(tier: str) -> list[dict[str, Any]]:
    from app.core.config import settings

    rows = list(FREE_TIERS.get(tier, FREE_TIERS["fast"]))
    if getattr(settings, "paid_llm_mode", "off").lower() == "emergency":
        rows.append(PAID_EMERGENCY.get(tier, PAID_EMERGENCY["fast"]))
    return [r for r in rows if _api_key(r["provider"], settings)]


def pick_model(tier: str) -> str:
    for c in _candidates(tier):
        key = f"{c['provider']}:{c['model']}"
        if _available(key):
            return c["model"]
    return "none"


def mark_rate_limited(model: str, cooldown_s: int = 3600) -> None:
    _cooldown(model, cooldown_s)


async def complete(messages: list[dict], model_tier: str = "fast") -> tuple[str, str, float]:
    """Return (text, model_used, est_cost_usd), falling through free providers first."""
    from openai import AsyncOpenAI
    from app.core.config import settings

    last_err: Exception | None = None
    for c in _candidates(model_tier):
        key = f"{c['provider']}:{c['model']}"
        if not _available(key):
            continue
        try:
            client_kwargs = {"api_key": _api_key(c["provider"], settings)}
            if c.get("base_url"):
                client_kwargs["base_url"] = c["base_url"]
            client = AsyncOpenAI(**client_kwargs)
            r = await client.chat.completions.create(model=c["model"], messages=messages)
            text = r.choices[0].message.content or ""
            cost = 0.0
            if c["provider"] == "openai_paid_emergency":
                inp = r.usage.prompt_tokens if r.usage else 0
                out = r.usage.completion_tokens if r.usage else 0
                pi, po = PRICES_PER_1M.get(c["model"], (0, 0))
                cost = inp / 1e6 * pi + out / 1e6 * po
            usage_log.append({"model": c["model"], "provider": c["provider"], "cost": cost, "ts": time.time()})
            return text, c["model"], cost
        except Exception as e:  # noqa: BLE001
            last_err = e
            _cooldown(key, _classify_cooldown(e))
            continue
    raise RuntimeError(f"all free LLM providers failed: {last_err}")


def monthly_cost() -> float:
    now = time.time()
    return sum(u["cost"] for u in usage_log if now - u["ts"] < 30 * 86400)
