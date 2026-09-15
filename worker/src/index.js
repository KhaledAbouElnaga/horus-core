/* HORUS Cloud Core — Cloudflare Worker (bult free, no card, 24/7).
   Telegram webhook -> allowlist -> commands -> OpenAI (primary) / Groq (fallback) -> reply.
   Secrets (TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, GROQ_API_KEY) via dashboard ONLY. */
const SYSTEM = `أنت حورس، مساعد خالد الشخصي. مصري، مباشر، عملي. مهام بسيطة: نفذ فورًا بلا أسئلة. لا تنتحل شخصية خالد أبدًا — عرّف نفسك 'حورس، مساعد خالد'. لا دفع/شراء/التزام مالي بدون موافقة صريحة.`;

const PRICES = { "gpt-4o-mini": [0.15, 0.6], "gpt-4o": [2.5, 10.0] };

async function tg(env, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  return r.json();
}

async function llm(env, messages, tier) {
  const primary = tier === "strong" ? "gpt-4o" : "gpt-4o-mini";
  const fallback = tier === "strong" ? "llama-3.3-70b-versatile" : "llama-3.1-8b-instant";
  // primary: OpenAI
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: primary, messages }),
    });
    if (!r.ok) throw new Error("openai " + r.status);
    const j = await r.json();
    const u = j.usage || { prompt_tokens: 0, completion_tokens: 0 };
    const [pi, po] = PRICES[primary] || [0, 0];
    return { text: j.choices[0].message.content, model: primary, cost: (u.prompt_tokens / 1e6) * pi + (u.completion_tokens / 1e6) * po };
  } catch (e) {
    if (!env.GROQ_API_KEY) throw e;
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: fallback, messages }),
    });
    if (!r.ok) throw new Error("groq " + r.status);
    const j = await r.json();
    return { text: j.choices[0].message.content, model: fallback, cost: 0 };
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname === "/health")
      return Response.json({ ok: true, service: "horus-worker", voice: (await env.KV.get("voice:mode")) || env.VOICE_DEFAULT || "off" });
    if (req.method === "GET" && url.pathname === "/cost")
      return Response.json({ month_usd: Number((await env.KV.get("cost:month")) || 0), cap: 10 });

    if (req.method === "POST" && url.pathname === "/webhook/telegram") {
      const data = await req.json().catch(() => ({}));
      const msg = data.message || {};
      const chatId = String((msg.chat || {}).id || "");
      const userId = String(((msg.from || {}).id || ""));
      const text = (msg.text || "").trim();
      const allowed = (env.ALLOWED_USER_IDS || "").split(",").map((s) => s.trim());
      if (!chatId || (allowed.length && !allowed.includes(userId))) return Response.json({ ok: false });
      if (!text) return Response.json({ ok: true, skipped: "non-text (M4)" });

      // أوامر محلية بلا LLM
      if (text === "/voice status" || text === "/voice")
        return reply(env, chatId, "وضع الصوت: " + ((await env.KV.get("voice:mode")) || "off"), "local", 0);
      if (text === "/voice on" || text === "رد علي بصوت") { await env.KV.put("voice:mode", "on"); return reply(env, chatId, "تمام، من دلوقتي هرد بصوت 🎙️ (تفعيل كامل في M4)", "local", 0); }
      if (text === "/voice off") { await env.KV.put("voice:mode", "off"); return reply(env, chatId, "تمام، هرجع نص بس.", "local", 0); }
      if (text === "/status" || text === "status" || text === "صحتك؟")
        return reply(env, chatId, "حورس شغال ✅ — سحابي 24/7 — الصوت: " + ((await env.KV.get("voice:mode")) || "off"), "local", 0);
      if (text.startsWith("/forget ")) { await env.KV.delete("ctx:" + userId); return reply(env, chatId, "نسيت سياق المحادثة.", "local", 0); }

      // سياق قصير من KV
      let ctx = [];
      try { ctx = JSON.parse((await env.KV.get("ctx:" + userId)) || "[]"); } catch {}
      const tier = text.length > 400 || /خطة|قارن|احجز|اتصل/.test(text) ? "strong" : "fast";
      try {
        const { text: out, model, cost } = await llm(env, [{ role: "system", content: SYSTEM }, ...ctx.slice(-10), { role: "user", content: text }], tier);
        ctx.push({ role: "user", content: text.slice(0, 500) }, { role: "assistant", content: out.slice(0, 500) });
        await env.KV.put("ctx:" + userId, JSON.stringify(ctx.slice(-10)), { expirationTtl: 86400 * 7 });
        const total = Number((await env.KV.get("cost:month")) || 0) + cost;
        await env.KV.put("cost:month", String(total));
        return reply(env, chatId, out.slice(0, 4000), model, cost);
      } catch (e) {
        return reply(env, chatId, "عطل مؤقت في عقل الذكاء — جرّب تاني كمان شوية.", "error", 0);
      }
    }
    return new Response("horus", { status: 404 });
  },
};

async function reply(env, chatId, text, model, cost) {
  await tg(env, "sendMessage", { chat_id: chatId, text });
  return Response.json({ ok: true, model, cost });
}
