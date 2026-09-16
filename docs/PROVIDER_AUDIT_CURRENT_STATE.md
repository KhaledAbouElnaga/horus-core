# HORUS Provider Audit — Current State

Last audited: 2026-09-16 12:05 EDT

## Backups

Timestamped backup created before provider changes:

- `backups/provider-audit-20260916_120454/`

Backed up files:

- `worker/src/index.js`
- `app/adapters/llm/router.py`
- `app/core/config.py`
- `worker/wrangler.toml`
- `.env.example`
- `docs/FREE_MATRIX.md`
- `current-state.txt` with git branch/revision/status

## Active deployment path

The live HORUS system is the Cloudflare Worker under:

- `worker/src/index.js`
- `worker/wrangler.toml`

Known live URL from project memory:

- `https://horus-core.khaled-e-abouelnaga.workers.dev`

## Current providers/models before changes

### Text LLM

Current Worker routing:

- Fast tier primary: OpenAI `gpt-4o-mini`
- Fast tier fallback: Groq `llama-3.1-8b-instant`
- Strong tier primary: OpenAI `gpt-4o`
- Strong tier fallback: Groq `llama-3.3-70b-versatile`

Python app router mirrors the same broad design in `app/adapters/llm/router.py`.

### Voice/STT/TTS

- STT primary: Groq Whisper `whisper-large-v3-turbo` when `GROQ_API_KEY` exists
- STT fallback: OpenAI `whisper-1`
- TTS: OpenAI `gpt-4o-mini-tts`

## Authentication method

Cloudflare Worker secrets are used, not committed files.

`wrangler secret list` shows these secret names only:

- `TELEGRAM_BOT_TOKEN`
- `OPENAI_API_KEY`
- `GROQ_API_KEY`

No secret values were read, printed, or written.

## Config files involved

- `worker/src/index.js` — production Worker provider calls and fallback logic
- `worker/wrangler.toml` — Worker name, KV binding, non-secret vars
- `app/adapters/llm/router.py` — Python app provider router
- `app/core/config.py` — Python environment settings
- `.env.example` — documented env var names only
- `docs/FREE_MATRIX.md` — previous infrastructure/free-provider notes

## Current failover behavior before changes

- Worker tries OpenAI first, then Groq if `GROQ_API_KEY` is present.
- Python router tries one primary and one fallback per tier.
- Only simple rate-limit cooldown exists in Python router; Worker has no provider health/cooldown state beyond try/catch.
- Failure of the Groq fallback currently ends the LLM response with a generic error.
- Current logic is a two-provider chain, not a multi-layer network.

## Verified baseline

Local Python tests before changes:

```text
4 passed in 0.05s
```

Hardware probe for local inference planning:

- CPU threads: 20
- RAM: 15.6 GB
- GPU: NVIDIA GeForce RTX 3050 Laptop GPU, 4096 MiB VRAM

## Cost risk note

OpenAI API is currently in the active chain and is paid/pay-as-you-go by nature. Per the new mission, it must not remain in the zero-cost primary production path unless explicitly isolated as a non-free/manual/emergency option.
