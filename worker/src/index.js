/* HORUS Cloud Core — Cloudflare Worker (built free-first, no card, 24/7).
   Telegram webhook -> allowlist -> commands -> FREE LLM failover -> reply.
   Secrets via Cloudflare only. Never commit or print API keys. */
const SYSTEM = `أنت حورس، مساعد خالد الشخصي. مصري، مباشر، عملي. مهام بسيطة: نفذ فورًا بلا أسئلة. لا تنتحل شخصية خالد أبدًا — عرّف نفسك 'حورس، مساعد خالد'. لا دفع/شراء/التزام مالي بدون موافقة صريحة.`;

const PRICES = { "gpt-4o-mini": [0.15, 0.6], "gpt-4o": [2.5, 10.0] };
const LLM_TIMEOUT_MS = 25000;
const PAID_LLM_OFF = "off";
const PAID_LLM_EMERGENCY = "emergency";

const FREE_PROVIDER_NOTES = {
  groq: "Groq Free tier: no billing unless account is upgraded; hard 429 limits.",
  workers_ai: "Cloudflare Workers AI free daily allocation; avoid paid/frontier models.",
  sambanova: "SambaNova Free Tier: no payment method linked; 20 RPD/model hard quota.",
  gemini: "Gemini API free tier; requires user-provided key and no billing upgrade.",
  openrouter: "OpenRouter :free models; low free limits and upstream availability vary.",
};

async function tg(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.json();
}

async function jget(env, key, fallback) {
  try { return JSON.parse((await env.KV.get(key)) || JSON.stringify(fallback)); }
  catch { return fallback; }
}

// M4: صوت داخل (ملف صوتي → نص عبر Groq Whisper) وصوت خارج (نص → صوت عبر OpenAI TTS)
async function tgSendVoice(env, chatId, audioBytes) {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("voice", new Blob([audioBytes], { type: "audio/mpeg" }), "reply.mp3");
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendVoice`, { method: "POST", body: form });
  return r.json();
}

async function transcribeVoice(env, fileId) {
  const info = await tg(env, "getFile", { file_id: fileId });
  const path = info?.result?.file_path;
  if (!path) throw new Error("no file");
  const audio = await (await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`)).arrayBuffer();
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/ogg" }), "voice.ogg");
  if (env.GROQ_API_KEY) {
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "ar");
    form.append("response_format", "text");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form,
    });
    if (!r.ok) throw new Error("groq stt " + r.status);
    return (await r.text()).trim();
  }
  if (paidMode(env) !== PAID_LLM_EMERGENCY || !env.OPENAI_API_KEY) throw new Error("paid stt disabled");
  form.append("model", "whisper-1");
  form.append("language", "ar");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form,
  });
  if (!r.ok) throw new Error("openai stt " + r.status);
  return ((await r.json()).text || "").trim();
}

async function speakText(env, text) {
  if (paidMode(env) !== PAID_LLM_EMERGENCY || !env.OPENAI_API_KEY) throw new Error("paid tts disabled");
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "nova",
      input: text.slice(0, 1000),
      instructions: "Speak in a warm natural Egyptian Arabic dialect with correct Arabic pronunciation. Moderate pace, friendly tone.",
    }),
  });
  if (!r.ok) throw new Error("tts " + r.status);
  return r.arrayBuffer();
}

// M3: بيانات حية مجانية بلا مفاتيح (Open-Meteo للطقس + ويكيبيديا للمعرفة)
async function liveWeather(city) {
  const cities = { "القاهرة": "القاهرة", "الجيزة": "الجيزة", "الإسكندرية": "الإسكندرية", "اسكندرية": "الإسكندرية", "أسوان": "أسوان", "الأقصر": "الأقصر", "شرم الشيخ": "شرم الشيخ", "الغردقة": "الغردقة", "بورسعيد": "بورسعيد", "السويس": "السويس", "المنصورة": "المنصورة", "طنطا": "طنطا", "أسيوط": "أسيوط", "دبي": "دبي", "الرياض": "الرياض", "جدة": "جدة" };
  const q = cities[city] || city || "القاهرة";
  const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=ar`)).json();
  if (!g.results || !g.results.length) return null;
  const { latitude, longitude, name } = g.results[0];
  const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`)).json();
  const c = w.current;
  const codes = { 0: "صحو ☀️", 1: "صحو غالبًا 🌤️", 2: "غائم جزئيًا ⛅", 3: "غائم ☁️", 45: "ضباب 🌫️", 48: "ضباب متجمد 🌫️", 51: "رذاذ 🌧️", 61: "مطر خفيف 🌧️", 63: "مطر 🌧️", 65: "مطر غزير ⛈️", 71: "ثلج خفيف 🌨️", 80: "زخات مطر 🌧️", 95: "عاصفة رعدية ⛈️" };
  return `طقس ${name} الآن: ${Math.round(c.temperature_2m)}° (${codes[c.weather_code] || "—"})، رطوبة ${c.relative_humidity_2m}%، رياح ${Math.round(c.wind_speed_10m)} كم/س.`;
}

async function liveWiki(topic) {
  const title = topic.trim().replace(/\s+/g, "_");
  const r = await fetch(`https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { "User-Agent": "HORUS-personal-assistant/1.0", "accept": "application/json" } });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.extract) return null;
  return j.extract.slice(0, 800) + (j.content_urls?.desktop ? `\n\nالمصدر: ${j.content_urls.desktop.page}` : "");
}

function paidMode(env) {
  return (env.PAID_LLM_MODE || PAID_LLM_OFF).toLowerCase();
}

function authHeader(key) {
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}

function providerKey(c) {
  return `${c.provider}:${c.model}`.replace(/[^a-zA-Z0-9:_./@-]/g, "_");
}

function parseRetryAfterSeconds(headers, fallback) {
  const raw = headers?.get?.("retry-after");
  if (!raw) return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0) return Math.min(Math.max(n, 30), 86400);
  const d = Date.parse(raw);
  if (Number.isFinite(d)) return Math.min(Math.max(Math.ceil((d - Date.now()) / 1000), 30), 86400);
  return fallback;
}

function classifyFailure(status, message = "") {
  const m = String(message || "").toLowerCase();
  if (status === "missing_key") return { state: "AUTH_ERROR", cooldown: 21600, retryable: false };
  if (status === "paid_blocked") return { state: "PAID_BLOCKED", cooldown: 0, retryable: false };
  if (status === 401 || status === 403) return { state: "AUTH_ERROR", cooldown: 21600, retryable: false };
  if (status === 404 || /model.*(not found|does not exist|invalid)|invalid.*model|model is unavailable|model_unavailable|not currently available/.test(m))
    return { state: "MODEL_UNAVAILABLE", cooldown: 86400, retryable: true };
  if (status === 402 || /quota|insufficient credits|credit balance|billing/.test(m))
    return { state: "QUOTA_EXHAUSTED", cooldown: 21600, retryable: true };
  if (status === 408 || status === 409 || status === 425)
    return { state: "OFFLINE", cooldown: 120, retryable: true };
  if (status === 429 || /rate limit|too many requests/.test(m))
    return { state: "RATE_LIMITED", cooldown: 3600, retryable: true };
  if ([500, 502, 503, 504].includes(status) || /overloaded|timeout|temporarily unavailable|upstream/.test(m))
    return { state: "OFFLINE", cooldown: 300, retryable: true };
  if (status === 400 || status === 413)
    return { state: "BAD_REQUEST", cooldown: 0, retryable: true };
  return { state: "OFFLINE", cooldown: 120, retryable: true };
}

async function readCooldown(env, key) {
  try {
    const raw = await env.KV?.get?.("llm:cooldown:" + key);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Number(c.until || 0) > Date.now()) return c;
    await env.KV?.delete?.("llm:cooldown:" + key);
  } catch {}
  return null;
}

async function writeStatus(env, key, status) {
  try { await env.KV?.put?.("llm:last_status:" + key, JSON.stringify({ ...status, ts: Date.now() }), { expirationTtl: 86400 * 7 }); } catch {}
}

async function setCooldown(env, key, state, seconds, detail) {
  if (!seconds) return;
  const until = Date.now() + seconds * 1000;
  try { await env.KV?.put?.("llm:cooldown:" + key, JSON.stringify({ state, until, detail: String(detail || "").slice(0, 160) }), { expirationTtl: seconds + 60 }); } catch {}
}

async function clearCooldown(env, key) {
  try { await env.KV?.delete?.("llm:cooldown:" + key); } catch {}
}

function buildCandidates(env, tier) {
  const strong = tier === "strong";
  const candidates = [];

  if (env.GROQ_API_KEY) {
    candidates.push({ provider: "groq", model: strong ? "openai/gpt-oss-120b" : "openai/gpt-oss-20b", baseUrl: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, costClass: "free", quality: strong ? "strong" : "fast" });
    candidates.push({ provider: "groq", model: strong ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant", baseUrl: "https://api.groq.com/openai/v1/chat/completions", key: env.GROQ_API_KEY, costClass: "free", quality: strong ? "strong" : "fast" });
  }

  if (env.AI) {
    candidates.push({ provider: "workers_ai", model: "@cf/meta/llama-3.1-8b-instruct-fast", costClass: "free", quality: "emergency" });
  }

  if (env.SAMBANOVA_API_KEY) {
    candidates.push({ provider: "sambanova", model: strong ? "gpt-oss-120b" : "Meta-Llama-3.3-70B-Instruct", baseUrl: "https://api.sambanova.ai/v1/chat/completions", key: env.SAMBANOVA_API_KEY, costClass: "free_tier", quality: strong ? "strong" : "fallback" });
    candidates.push({ provider: "sambanova", model: "DeepSeek-V3.1", baseUrl: "https://api.sambanova.ai/v1/chat/completions", key: env.SAMBANOVA_API_KEY, costClass: "free_tier", quality: "fallback" });
  }
  if (env.GEMINI_API_KEY) {
    candidates.push({ provider: "gemini", model: strong ? "gemini-2.5-flash" : "gemini-2.5-flash-lite", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: env.GEMINI_API_KEY, costClass: "free_tier", quality: strong ? "strong" : "fast" });
  }
  if (env.OPENROUTER_API_KEY) {
    candidates.push({ provider: "openrouter", model: "openrouter/free", baseUrl: "https://openrouter.ai/api/v1/chat/completions", key: env.OPENROUTER_API_KEY, costClass: "free_aggregator", quality: "emergency" });
  }

  if (paidMode(env) === PAID_LLM_EMERGENCY && env.OPENAI_API_KEY) {
    candidates.push({ provider: "openai_paid_emergency", model: strong ? "gpt-4o" : "gpt-4o-mini", baseUrl: "https://api.openai.com/v1/chat/completions", key: env.OPENAI_API_KEY, costClass: "paid_emergency", quality: strong ? "strong" : "fast" });
  }
  return candidates;
}

async function callOpenAICompatible(candidate, messages, signal) {
  const r = await fetch(candidate.baseUrl, {
    method: "POST",
    headers: authHeader(candidate.key),
    body: JSON.stringify({ model: candidate.model, messages }),
    signal,
  });
  const raw = await r.text();
  let j = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { j = { error: { message: raw.slice(0, 500) } }; }
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || raw.slice(0, 500) || `${candidate.provider} ${r.status}`;
    const e = new Error(msg);
    e.status = r.status;
    e.headers = r.headers;
    throw e;
  }
  return j;
}

async function callWorkersAI(env, candidate, messages) {
  const r = await env.AI.run(candidate.model, { messages });
  const text = typeof r === "string" ? r : (r?.response || r?.result?.response || r?.choices?.[0]?.message?.content || "");
  if (!text) throw new Error("workers_ai empty response");
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: 0, completion_tokens: 0 } };
}

function estimateCost(candidate, usage) {
  if (candidate.costClass !== "paid_emergency") return 0;
  const [pi, po] = PRICES[candidate.model] || [0, 0];
  return ((usage?.prompt_tokens || 0) / 1e6) * pi + ((usage?.completion_tokens || 0) / 1e6) * po;
}

async function llm(env, messages, tier) {
  const candidates = buildCandidates(env, tier);
  const errors = [];

  for (const c of candidates) {
    const key = providerKey(c);
    const cd = await readCooldown(env, key);
    if (cd) {
      errors.push(`${key}:COOLDOWN:${cd.state}`);
      continue;
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort("timeout"), LLM_TIMEOUT_MS);
    try {
      const j = c.provider === "workers_ai"
        ? await callWorkersAI(env, c, messages)
        : await callOpenAICompatible(c, messages, controller.signal);
      clearTimeout(t);
      const text = j.choices?.[0]?.message?.content || "";
      if (!text) throw new Error(`${key} empty content`);
      const cost = estimateCost(c, j.usage || {});
      await clearCooldown(env, key);
      await writeStatus(env, key, { state: "HEALTHY", model: c.model, provider: c.provider, costClass: c.costClass });
      return { text, model: c.model, provider: c.provider, cost, costClass: c.costClass };
    } catch (e) {
      clearTimeout(t);
      const status = e?.status || (String(e?.message || "").includes("timeout") ? 408 : 500);
      const cls = classifyFailure(status, e?.message || "");
      const cooldown = status === 429 ? parseRetryAfterSeconds(e.headers, cls.cooldown) : cls.cooldown;
      await setCooldown(env, key, cls.state, cooldown, e?.message || status);
      await writeStatus(env, key, { state: cls.state, model: c.model, provider: c.provider, status, costClass: c.costClass });
      errors.push(`${key}:${cls.state}:${status}`);
      continue;
    }
  }

  if (paidMode(env) !== PAID_LLM_EMERGENCY && env.OPENAI_API_KEY) errors.push("openai_paid_emergency:PAID_BLOCKED");
  throw new Error("all free LLM providers failed: " + errors.join(" | ").slice(0, 800));
}

async function providerHealth(env) {
  const candidates = buildCandidates(env, "fast");
  const seen = new Map();
  for (const c of candidates) seen.set(providerKey(c), c);
  const providers = [];
  for (const [key, c] of seen) {
    const cd = await readCooldown(env, key);
    providers.push({ provider: c.provider, model: c.model, costClass: c.costClass, status: cd ? cd.state : "READY", cooldownUntil: cd?.until || null });
  }
  if (paidMode(env) !== PAID_LLM_EMERGENCY && env.OPENAI_API_KEY) providers.push({ provider: "openai_paid_emergency", status: "PAID_BLOCKED", costClass: "paid_emergency" });
  return { paid_llm_mode: paidMode(env), providers, notes: FREE_PROVIDER_NOTES };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health")
      return Response.json({ ok: true, service: "horus-worker", v: "m5-free-failover", voice: (await env.KV.get("voice:mode")) || env.VOICE_DEFAULT || "off", llm: await providerHealth(env) });
    if (req.method === "GET" && url.pathname === "/cost")
      return Response.json({ month_usd: Number((await env.KV.get("cost:month")) || 0), cap: 0, paid_llm_mode: paidMode(env) });

    if (req.method === "POST" && url.pathname === "/webhook/telegram") {
      const data = await req.json().catch(() => ({}));
      const msg = data.message || {};
      const chatId = String((msg.chat || {}).id || "");
      const userId = String(((msg.from || {}).id || ""));
      let text = (msg.text || "").trim();
      let fromVoice = false;
      if (!text && msg.voice) {
        try {
          text = await transcribeVoice(env, msg.voice.file_id);
          fromVoice = true;
          if (!text) return reply(env, chatId, "سمعتك بس مفهمتش الكلام — جرّب تاني بصوت أوضح.", "error", 0);
        } catch {
          return reply(env, chatId, "معرفتش أحوّل الصوت لنص دلوقتي — جرّب بعد شوية.", "error", 0);
        }
      }
      if (!text) return Response.json({ ok: true, skipped: "non-text (files/photos)" });
      let forceVoice = /رد (عليّا|عليا|علي|عليه|لي)? ?بصوت/.test(text);
      text = text.replace(/رد (عليّا|عليا|علي|عليه|لي)? ?بصوت/g, "").trim();
      const allowed = (env.ALLOWED_USER_IDS || "").split(",").map((s) => s.trim());
      if (!chatId || (allowed.length && !allowed.includes(userId))) return Response.json({ ok: false });

      // أوامر محلية بلا LLM
      if (text === "/voice status" || text === "/voice")
        return reply(env, chatId, "وضع الصوت: " + ((await env.KV.get("voice:mode")) || "off"), "local", 0);
      if (text === "/voice on" || text === "رد علي بصوت") { await env.KV.put("voice:mode", "on"); return reply(env, chatId, "تمام، من دلوقتي هرد بصوت 🎙️", "local", 0); }
      if (text === "/voice off") { await env.KV.put("voice:mode", "off"); return reply(env, chatId, "تمام، هرجع نص بس.", "local", 0); }
      if (text === "/start" || text === "/help" || text === "مساعدة")
        return reply(env, chatId, "أنا حورس، مساعدك الشخصي 🤖\n\nكلمني عادي نصًا، أو جرّب:\n• افتكر أن ... — أحفظ معلومة\n• فاكر إيه؟ — أعرض ذاكرتي\n• انسى ... — أمسح معلومة\n• مهمة: ... — أسجّل مهمة\n• /tasks — المهام الشغالة\n• /voice on|off — الرد الصوتي", "local", 0);
      if (text === "/status" || text === "status" || text === "صحتك؟")
        return reply(env, chatId, "حورس شغال ✅ — سحابي 24/7 — الصوت: " + ((await env.KV.get("voice:mode")) || "off"), "local", 0);
      // ذاكرة دائمة: افتكر / فاكر إيه / انسى
      const remember = text.match(/^(?:ا?فتكر|احفظ|خليك فاكر|متنساش)(?:\s+أ?ن)?\s*[:：]?\s*(.+)/);
      if (remember) {
        const facts = await jget(env, "facts:" + userId, []);
        facts.push({ f: remember[1].slice(0, 300), ts: Date.now() });
        await env.KV.put("facts:" + userId, JSON.stringify(facts.slice(-50)));
        return reply(env, chatId, "تمام، حفظتها ✅", "local", 0);
      }
      if (/^(فاكر (إيه|ايه|أيه)|اظهر الذاكرة|\/memory|show memory)/.test(text)) {
        const facts = await jget(env, "facts:" + userId, []);
        if (!facts.length) return reply(env, chatId, "ذاكرتي فاضية لسه — قولي «افتكر أن ...».", "local", 0);
        return reply(env, chatId, "اللي فاكره عنك:\n" + facts.map((x, i) => `${i + 1}. ${x.f}`).join("\n").slice(0, 3500), "local", 0);
      }
      const factQuery = text.match(/^فاكر\s+(.+)/);
      if (factQuery && !/^(فاكر (إيه|ايه|أيه))/.test(text)) {
        const facts = await jget(env, "facts:" + userId, []);
        const q = factQuery[1].replace(/[؟?]/g, "").trim();
        const hit = facts.find((x) => x.f.includes(q) || q.includes(x.f.slice(0, 10)));
        return reply(env, chatId, hit ? `أيوه فاكر ✅: ${hit.f}` : "لأ، مش فاكر حاجة عن ده.", "local", 0);
      }
      const forgetFact = text.match(/^(?:انسى|امسح من الذاكرة|forget)\s+(.+)/);
      if (forgetFact && !text.startsWith("/forget ")) {
        const facts = await jget(env, "facts:" + userId, []);
        const q = forgetFact[1].trim();
        const kept = facts.filter((x) => !x.f.includes(q));
        await env.KV.put("facts:" + userId, JSON.stringify(kept));
        return reply(env, chatId, facts.length === kept.length ? "ملقتش حاجة بالاسم ده." : "نسيتها ✅", "local", 0);
      }
      if (text.startsWith("/forget ")) { await env.KV.delete("ctx:" + userId); return reply(env, chatId, "نسيت سياق المحادثة.", "local", 0); }
      // مهام: مهمة: / tasks / done / cancel
      const newTask = text.match(/^(?:مهمة|مهمه|مهمة جديدة|task)\s*[:：]?\s*(.+)/);
      if (newTask) {
        const tasks = await jget(env, "tasks:" + userId, []);
        const id = "T-" + Math.random().toString(36).slice(2, 6).toUpperCase();
        tasks.push({ id, title: newTask[1].slice(0, 200), status: "RUNNING", ts: Date.now() });
        await env.KV.put("tasks:" + userId, JSON.stringify(tasks.slice(-30)));
        return reply(env, chatId, `سجّلتها ✅ ${id}: ${newTask[1].slice(0, 100)}`, "local", 0);
      }
      if (/^(\/tasks|المهام|إيه المهام الشغالة)/.test(text)) {
        const tasks = (await jget(env, "tasks:" + userId, [])).filter((t) => t.status === "RUNNING");
        if (!tasks.length) return reply(env, chatId, "مفيش مهام شغالة حاليًا.", "local", 0);
        return reply(env, chatId, tasks.map((t) => `${t.id}: ${t.title}`).join("\n"), "local", 0);
      }
      const taskDone = text.match(/^(?:خلصت|done|قفل)\s+(T-[A-Z0-9]{4})/i);
      const taskCancel = text.match(/^(?:الغي|إلغي|cancel)\s+(T-[A-Z0-9]{4})/i);
      if (taskDone || taskCancel) {
        const id = (taskDone || taskCancel)[1].toUpperCase();
        const tasks = await jget(env, "tasks:" + userId, []);
        const t = tasks.find((x) => x.id === id);
        if (!t) return reply(env, chatId, "ملقتش المهمة دي.", "local", 0);
        t.status = taskDone ? "COMPLETED" : "CANCELLED";
        await env.KV.put("tasks:" + userId, JSON.stringify(tasks));
        return reply(env, chatId, taskDone ? `عاش ✅ ${id} اتقفلت.` : `${id} اتلغت.`, "local", 0);
      }

      // M3: نوايا البيانات الحية قبل الـLLM
      if (/طقس|درجة الحرارة|الحرارة كام|الجو/.test(text)) {
        const cityKeys = ["القاهرة", "الجيزة", "الإسكندرية", "اسكندرية", "أسوان", "الأقصر", "شرم الشيخ", "الغردقة", "بورسعيد", "السويس", "المنصورة", "طنطا", "أسيوط", "دبي", "الرياض", "جدة"];
        const hit = cityKeys.find((k) => text.includes(k));
        try {
          const w = await liveWeather(hit || "القاهرة");
          if (w) return reply(env, chatId, w + " 🌡️ (بيانات حية)", "live", 0, forceVoice || fromVoice);
        } catch {}
        return reply(env, chatId, "معرفتش أجيب الطقس دلوقتي — جرّب بعد شوية.", "error", 0);
      }
      const wikiQ = text.match(/^(?:مين|من هو|إيه هو|إيه هي|ما هو|ما هي|عرفني (?:على|عن|ب)?)\s+(.+?)(\؟|\?|$)/);
      if (wikiQ) {
        try {
          const s = await liveWiki(wikiQ[1].replace(/^(هو|هي|ده|دي)\s+/, "").trim());
          if (s) return reply(env, chatId, s, "live", 0, forceVoice || fromVoice);
        } catch {}
      }
      // سياق قصير + حقائق دائمة من KV
      let ctx = [];
      try { ctx = JSON.parse((await env.KV.get("ctx:" + userId)) || "[]"); } catch {}
      const facts = await jget(env, "facts:" + userId, []);
      const factTxt = facts.length ? "\nحقائق ثابتة عن خالد:\n" + facts.map((x) => "- " + x.f).join("\n") : "";
      const tier = text.length > 400 || /خطة|قارن|احجز|اتصل/.test(text) ? "strong" : "fast";
      try {
        const { text: out, model, provider, cost } = await llm(env, [{ role: "system", content: SYSTEM + factTxt }, ...ctx.slice(-10), { role: "user", content: text }], tier);
        ctx.push({ role: "user", content: text.slice(0, 500) }, { role: "assistant", content: out.slice(0, 500) });
        await env.KV.put("ctx:" + userId, JSON.stringify(ctx.slice(-10)), { expirationTtl: 86400 * 7 });
        const total = Number((await env.KV.get("cost:month")) || 0) + cost;
        await env.KV.put("cost:month", String(total));
        return reply(env, chatId, out.slice(0, 4000), provider ? `${provider}/${model}` : model, cost, forceVoice || fromVoice);
      } catch (e) {
        return reply(env, chatId, "عطل مؤقت في عقل الذكاء — جرّب تاني كمان شوية.", "error", 0);
      }
    }
    return new Response("horus", { status: 404 });
  },
};

async function reply(env, chatId, text, model, cost, forceVoice) {
  await tg(env, "sendMessage", { chat_id: chatId, text });
  try {
    const mode = await env.KV.get("voice:mode");
    if ((mode === "on" || forceVoice) && model !== "error" && text.length < 1500) {
      await tgSendVoice(env, chatId, await speakText(env, text));
    }
  } catch {}
  return Response.json({ ok: true, model, cost });
}


export { buildCandidates, classifyFailure, llm, providerHealth };
