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

async function jget(env, key, fallback) {
  try { return JSON.parse((await env.KV.get(key)) || JSON.stringify(fallback)); }
  catch { return fallback; }
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
  const r = await fetch(`https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
  if (!r.ok) return null;
  const j = await r.json();
  if (!j.extract) return null;
  return j.extract.slice(0, 800) + (j.content_urls?.desktop ? `\n\nالمصدر: ${j.content_urls.desktop.page}` : "");
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
      return Response.json({ ok: true, service: "horus-worker", v: "m3.2", voice: (await env.KV.get("voice:mode")) || env.VOICE_DEFAULT || "off" });
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
      if (/^(فاكر إيه|اظهر الذاكرة|\/memory|show memory)/.test(text)) {
        const facts = await jget(env, "facts:" + userId, []);
        if (!facts.length) return reply(env, chatId, "ذاكرتي فاضية لسه — قولي «افتكر أن ...».", "local", 0);
        return reply(env, chatId, "اللي فاكره عنك:\n" + facts.map((x, i) => `${i + 1}. ${x.f}`).join("\n").slice(0, 3500), "local", 0);
      }
      const factQuery = text.match(/^فاكر\s+(.+)/);
      if (factQuery && !/^(فاكر إيه)/.test(text)) {
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
          if (w) return reply(env, chatId, w + " 🌡️ (بيانات حية)", "live", 0);
        } catch {}
        return reply(env, chatId, "معرفتش أجيب الطقس دلوقتي — جرّب بعد شوية.", "error", 0);
      }
      const wikiQ = text.match(/^(?:مين|من هو|إيه هو|إيه هي|ما هو|ما هي|عرفني (?:على|عن|ب)?)\s+(.+?)(\؟|\?|$)/);
      if (wikiQ) {
        try {
          const s = await liveWiki(wikiQ[1].replace(/^(هو|هي|ده|دي)\s+/, "").trim());
          if (s) return reply(env, chatId, s, "live", 0);
        } catch {}
      }
      // سياق قصير + حقائق دائمة من KV
      let ctx = [];
      try { ctx = JSON.parse((await env.KV.get("ctx:" + userId)) || "[]"); } catch {}
      const facts = await jget(env, "facts:" + userId, []);
      const factTxt = facts.length ? "\nحقائق ثابتة عن خالد:\n" + facts.map((x) => "- " + x.f).join("\n") : "";
      const tier = text.length > 400 || /خطة|قارن|احجز|اتصل/.test(text) ? "strong" : "fast";
      try {
        const { text: out, model, cost } = await llm(env, [{ role: "system", content: SYSTEM + factTxt }, ...ctx.slice(-10), { role: "user", content: text }], tier);
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
