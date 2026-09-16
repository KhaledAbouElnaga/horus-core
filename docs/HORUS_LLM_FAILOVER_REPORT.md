# HORUS Free LLM Failover Mission Report

Date: 2026-09-16

## Executive result

HORUS has been moved from a paid-primary LLM design to a zero-cost-first failover design.

Current deployed policy:

- `PAID_LLM_MODE=off`
- OpenAI text LLM is preserved in code but blocked by default.
- OpenAI STT fallback and OpenAI TTS are blocked by default to prevent voice mode from creating charges.
- Groq Free Tier is primary.
- Cloudflare Workers AI free allocation is live fallback.
- Gemini and OpenRouter are implemented as dormant optional free-tier fallbacks, activated only if Khaled adds keys without billing.

## Totals

- Total LLM/API providers researched: 25
- Total local inference options researched: 4
- Total genuinely free / hard-free / usable-free candidates found (A-D): 14
- Total successfully configured in active production chain: 2 providers
- Total live-tested working cloud models: 2
- Total dormant optional providers in code: 2
- Total rejected / excluded from production chain: 11 providers
- Total requiring human signup/API key before testing: at least 8

## Current primary

1. GroqCloud — `openai/gpt-oss-20b` — cost: $0 on Groq Free tier

## Current fallback chain

Fast/default tier:

1. GroqCloud / `openai/gpt-oss-20b`
2. GroqCloud / `llama-3.1-8b-instant`
3. Cloudflare Workers AI / `@cf/meta/llama-3.1-8b-instruct-fast`
4. Gemini API / `gemini-2.5-flash-lite` — dormant, needs key
5. OpenRouter / `openrouter/free` — dormant, needs key
6. OpenAI / `gpt-4o-mini` — paid emergency only, blocked while `PAID_LLM_MODE=off`

Strong tier:

1. GroqCloud / `openai/gpt-oss-120b`
2. GroqCloud / `llama-3.3-70b-versatile`
3. Cloudflare Workers AI / `@cf/meta/llama-3.1-8b-instruct-fast`
4. Gemini API / `gemini-2.5-flash` — dormant, needs key
5. OpenRouter / `openrouter/free` — dormant, needs key
6. OpenAI / `gpt-4o` — paid emergency only, blocked while `PAID_LLM_MODE=off`

## Working providers

| Priority | Provider | Model(s) | Quality category | Rate/free quota | Tool support | Current status |
|---:|---|---|---|---|---|---|
| 1 | GroqCloud | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` | Fast/strong free cloud | Official free hard limits, e.g. gpt-oss 30 RPM, 1,000 RPD, 8K TPM, 200K TPD | Depends on model; gpt-oss/Groq systems support advanced capabilities per Groq docs | HEALTHY / live-tested |
| 2 | Cloudflare Workers AI | `@cf/meta/llama-3.1-8b-instruct-fast` | Emergency free cloud | Free daily Neurons allocation; avoid paid/frontier model IDs | Basic chat; no full OpenAI tools tested | HEALTHY / live-tested |

## Dormant implemented providers

| Provider | Model(s) | Why dormant |
|---|---|---|
| Gemini API | `gemini-2.5-flash-lite`, `gemini-2.5-flash` | Needs `GEMINI_API_KEY`; user must create key without enabling billing. |
| OpenRouter | `openrouter/free` | Needs `OPENROUTER_API_KEY`; low 50 RPD free limit and upstream variability. |

## Safety controls added

- Paid OpenAI text fallback is disabled unless `PAID_LLM_MODE=emergency`.
- OpenAI TTS and OpenAI STT fallback are disabled unless `PAID_LLM_MODE=emergency`.
- Provider cooldowns are stored in Cloudflare KV.
- `/health` reports non-sensitive provider health only.
- `.gitignore` now excludes `backups/` and `worker/.wrangler/`.
- `.env.example` documents free-provider keys and keeps `PAID_LLM_MODE=off`.

## Failure handling

HORUS now classifies failures and falls through intelligently:

- 429/rate limit → `RATE_LIMITED`, cooldown, next provider
- 402/quota/credit/billing → `QUOTA_EXHAUSTED`, cooldown, next provider
- model unavailable/not found/removed → `MODEL_UNAVAILABLE`, long model cooldown, next model/provider
- 401/403/auth → `AUTH_ERROR`, long cooldown, no infinite retry
- 408/5xx/timeout/overload → `OFFLINE`, short cooldown, next provider
- 400/413 → `BAD_REQUEST`, model-specific fallback without broad provider disable
- paid provider while `PAID_LLM_MODE=off` → `PAID_BLOCKED`

## Verification performed

Baseline before edits:

```text
python -m pytest -q
4 passed in 0.05s
```

Static/build checks:

```text
node --check worker/src/index.js
PASS

npx wrangler deploy --dry-run
PASS: KV, AI binding, vars all recognized
```

Router simulation tests:

```text
node worker/test-provider-router.mjs
worker provider router tests passed
```

Python regression tests after edits:

```text
python -m pytest -q
4 passed
```

Live remote provider tests with remote Cloudflare bindings/secrets:

```json
normal: {"ok":true,"provider":"groq","model":"openai/gpt-oss-20b","cost":0,"text":"HORUS_LLM_OK"}
workersai: {"ok":true,"provider":"workers_ai","model":"@cf/meta/llama-3.1-8b-instruct-fast","cost":0,"text":"HORUS_LLM_OK"}
fakegroq: {"ok":true,"provider":"workers_ai","model":"@cf/meta/llama-3.1-8b-instruct-fast","cost":0,"text":"HORUS_LLM_OK"}
```

Production deployment:

```text
Deployed horus-core
Current Version ID: 1264b6fc-929e-4235-8f33-64824bf513dc
```

Production health readback:

```json
{
  "ok": true,
  "service": "horus-worker",
  "v": "m5-free-failover",
  "llm": {
    "paid_llm_mode": "off",
    "providers": [
      {"provider":"groq","model":"openai/gpt-oss-20b","costClass":"free","status":"READY"},
      {"provider":"groq","model":"llama-3.1-8b-instant","costClass":"free","status":"READY"},
      {"provider":"workers_ai","model":"@cf/meta/llama-3.1-8b-instruct-fast","costClass":"free","status":"READY"},
      {"provider":"openai_paid_emergency","status":"PAID_BLOCKED","costClass":"paid_emergency"}
    ]
  }
}
```

## Rejected providers and why

- Cerebras — trial credits/payment method; not permanent free.
- Fireworks — starter credit only; paid after.
- Replicate — limited free runs; billing for sustained use.
- Alibaba DashScope — expiring newcomer quota; paid after.
- Nebius — promotional credits / card-payment requirements.
- Together AI — minimum credit purchase required.
- DeepInfra — paid per-token; no official permanent free LLM tier found.
- Lambda — inference API winding down; current path paid GPU.
- NVIDIA hosted NIM — no verified permanent free hosted public API tier.
- Chutes — official docs did not verify hard-free quota.
- GitHub Models — retired per official docs.
- Hugging Face Inference — only $0.10/month credits; too small for production.
- ModelScope — free but non-commercial/developer-experience, real-name binding, no production SLA.

## Human gates remaining

No billing/card action was taken.

If Khaled wants more free diversity, the next safe gates are:

1. Create Gemini API key in Google AI Studio without enabling billing.
2. Create OpenRouter API key without buying credits and use only `:free`/`openrouter/free`.
3. Create SambaNova Free Tier key without payment method.
4. Optionally test Hyperbolic/Novita only after confirming account can call free models with no billing/payment method.

## Files changed

- `worker/src/index.js`
- `worker/wrangler.toml`
- `worker/test-provider-router.mjs`
- `app/adapters/llm/router.py`
- `app/core/config.py`
- `.env.example`
- `.gitignore`
- `docs/PROVIDER_AUDIT_CURRENT_STATE.md`
- `docs/HORUS_LLM_PROVIDER_KNOWLEDGE.md`
- `docs/HORUS_LLM_FAILOVER_REPORT.md`

## Backups

Backup created before modification:

- `backups/provider-audit-20260916_120454/`

This folder is ignored by git and kept locally for rollback.
