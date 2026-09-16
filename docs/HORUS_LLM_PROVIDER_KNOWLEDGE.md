# HORUS Free LLM Provider Knowledge Base

Last verified: 2026-09-16

Mission rule: HORUS must prefer $0 operation. Do not enter credit cards, enable billing, buy credits, subscribe, or activate pay-as-you-go for any provider in the production chain.

## Active zero-cost production chain

Current deployed Worker: `https://horus-core.khaled-e-abouelnaga.workers.dev`

`PAID_LLM_MODE=off` is deployed, so OpenAI is blocked from text LLM, STT fallback, and TTS unless Khaled deliberately switches to `emergency`.

### Tier order, fast/default

1. Groq — `openai/gpt-oss-20b`
2. Groq — `llama-3.1-8b-instant`
3. Cloudflare Workers AI — `@cf/meta/llama-3.1-8b-instruct-fast`
4. Gemini — `gemini-2.5-flash-lite`, dormant until `GEMINI_API_KEY` is added
5. OpenRouter — `openrouter/free`, dormant until `OPENROUTER_API_KEY` is added
6. OpenAI — `gpt-4o-mini`, paid emergency only, blocked while `PAID_LLM_MODE=off`

### Tier order, strong

1. Groq — `openai/gpt-oss-120b`
2. Groq — `llama-3.3-70b-versatile`
3. Cloudflare Workers AI — `@cf/meta/llama-3.1-8b-instruct-fast`
4. Gemini — `gemini-2.5-flash`, dormant until `GEMINI_API_KEY` is added
5. OpenRouter — `openrouter/free`, dormant until `OPENROUTER_API_KEY` is added
6. OpenAI — `gpt-4o`, paid emergency only, blocked while `PAID_LLM_MODE=off`

## Implemented provider status

| Provider | Class | Active? | Models | API compatibility | Free limits / notes | Test status |
|---|---:|---:|---|---|---|---|
| GroqCloud | B | Yes | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `llama-3.1-8b-instant`, `llama-3.3-70b-versatile` | OpenAI-compatible `/openai/v1/chat/completions` | Free tier has hard 429s. gpt-oss free example: 30 RPM, 1,000 RPD, 8K TPM, 200K TPD. No card unless upgraded. | PASS live remote self-test: `openai/gpt-oss-20b` returned `HORUS_LLM_OK` at cost 0. |
| Cloudflare Workers AI | B | Yes | `@cf/meta/llama-3.1-8b-instruct-fast` | Worker AI binding + OpenAI-compatible REST exists | Free daily Neurons allocation. Avoid paid/frontier model IDs requiring paid billing/prepaid credits. | PASS live remote self-test: returned `HORUS_LLM_OK`; deprecated `@cf/meta/llama-3.1-8b-instruct` failed and was replaced. |
| Gemini API / AI Studio | B | Dormant | `gemini-2.5-flash-lite`, `gemini-2.5-flash` | OpenAI-compatible beta endpoint | Free tier available; billing required only for paid tiers. Free-tier data may be used to improve Google products. | NOT TESTED: no key present. Human gate: Khaled must create key without enabling billing. |
| OpenRouter free router | C/D | Dormant | `openrouter/free` / `*:free` variants | OpenAI-compatible | Free variants: 20 RPM, 50 RPD for accounts with <$10 credits purchased. Free models depend on upstream availability; negative balance can block even free. | NOT TESTED: no key present. Human gate: create key, do not add credits/billing. |

## Researched provider classifications

A-D are potentially usable for $0 if account/key conditions are satisfied. E-G are excluded from the production chain.

| Provider | Class | Decision | Reason |
|---|---:|---|---|
| GroqCloud | B | Active | Strongest existing free key, no card on Free tier, hard quotas. |
| Cloudflare Workers AI | B | Active | Already deployed on Cloudflare; AI binding works; free allocation. |
| Google Gemini API / AI Studio | B | Dormant candidate | OpenAI-compatible beta; free tier, no billing needed for free usage. Needs user key. |
| SambaNova Cloud | B | Candidate, not active | OpenAI-compatible; no card for Free tier; very low 20 RPD/model. Needs signup/key. |
| SiliconFlow | B | Candidate, not active | Free models and OpenAI-compatible, but identity verification and regional/account uncertainty. |
| Mistral La Plateforme | B | Candidate, not active | Free mode exists but exact allowance is account-console dependent; most general LLMs paid. |
| Cohere | B | Candidate, not active | Evaluation/trial keys have hard call limits; not ideal production. |
| Vercel AI Gateway | B | Candidate, not active | Included monthly free credits, but model eligibility/promotions change. |
| Modal | B | Candidate, not active | $30/month free compute can host local-style inference but requires deployment work and metered compute. |
| OpenRouter free models | C/D | Dormant candidate | Good emergency aggregator; low free limits and upstream variability. |
| Novita AI | C | Candidate, not active | Has currently free model rows, but free models/promos can change. |
| Hyperbolic | D | Candidate, not active | Basic account claims free/no minimum spend but token pricing ambiguity requires account test. |
| Hugging Face Inference Providers | D | Rejected for main chain | $0.10/month free credits are too small for production; possible smoke-test fallback only. |
| ModelScope API-Inference | D | Rejected for production | Free/non-commercial/developer experience, real-name/AliCloud binding; no SLA/high concurrency. |
| Cerebras | E | Rejected | Trial credits only; verified payment method/free trial expiry. |
| Fireworks AI | E | Rejected | $1 starter credit only; prepaid/pay-per-token after. |
| Replicate | E | Rejected | Limited free runs, then billing setup. |
| Alibaba DashScope | E | Rejected | Newcomer quotas expire; paid token pricing after. |
| Nebius / Token Factory | E | Rejected | Promotional credits / card-payment requirements; not permanent. |
| Together AI | F | Rejected | No free trial; minimum credit purchase. |
| DeepInfra | F | Rejected | Paid per-token; no official permanent free LLM tier found. |
| Lambda | F | Rejected | Inference API winding down; paid GPU cloud. |
| NVIDIA-hosted NIM | G | Rejected | NIM API is OpenAI-compatible but no verified permanent free hosted tier. |
| Chutes | G | Rejected | Official docs emphasize adding money/plans; no verified hard-free quota. |
| GitHub Models | G | Rejected | Official docs say GitHub Models retired July 30, 2026. |

## Failure classification used by HORUS

- `HEALTHY`: last call succeeded.
- `RATE_LIMITED`: HTTP 429 or rate-limit text. Cooldown default: 3600s, honors `Retry-After` when present.
- `QUOTA_EXHAUSTED`: HTTP 402 or quota/credit/billing text. Cooldown: 21600s.
- `MODEL_UNAVAILABLE`: model removed/not found/unavailable. Cooldown: 86400s.
- `AUTH_ERROR`: missing/invalid credentials, 401, 403. Cooldown: 21600s.
- `OFFLINE`: network/timeout/408/5xx/overload. Cooldown: 120-300s.
- `BAD_REQUEST`: payload/client-size errors; fail over model-specific but do not broad-disable the provider.
- `PAID_BLOCKED`: paid OpenAI emergency is present but deliberately blocked by `PAID_LLM_MODE=off`.

Cooldown state is stored in Cloudflare KV under non-secret keys:

- `llm:cooldown:<provider>:<model>`
- `llm:last_status:<provider>:<model>`

## Known provider quirks and fixes

- Cloudflare model `@cf/meta/llama-3.1-8b-instruct` is deprecated and returns error 5028. Use `@cf/meta/llama-3.1-8b-instruct-fast`.
- OpenAI remains in code only as a preserved paid emergency provider. It is not used while `PAID_LLM_MODE=off`.
- OpenAI TTS and OpenAI STT fallback are also blocked while `PAID_LLM_MODE=off` to prevent voice mode from creating charges.
- Remote Worker `/health` exposes provider names/models/status only. It must never expose API keys, Authorization headers, request bodies, or user data.
- Do not commit `backups/`, `.env`, or `worker/.wrangler/`.

## Human gates remaining

To expand beyond the active two-provider chain, Khaled must manually create API keys without billing/card for:

1. Gemini API free tier (`GEMINI_API_KEY`)
2. OpenRouter free models (`OPENROUTER_API_KEY`)
3. SambaNova Free Tier (future optional integration after key exists)
4. Other candidates only after verifying no card/no billing in that account

No provider requiring billing, card, paid credits, trial credits, or pay-as-you-go should be added to the active zero-cost chain.
