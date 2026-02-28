const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { YoutubeTranscript } = require("youtube-transcript");

setGlobalOptions({ region: "us-central1" });

if (!admin.apps.length) admin.initializeApp();

// ─── Module-level cache (survives warm Cloud Function instances) ──────────────
const _memCache = new Map();
function _mcGet(key) {
  const r = _memCache.get(key);
  if (!r) return null;
  if (Date.now() > r.exp) { _memCache.delete(key); return null; }
  return r.val;
}
function _mcSet(key, val, ttlMs) {
  // Limit cache size to prevent unbounded memory growth
  if (_memCache.size > 500) {
    const firstKey = _memCache.keys().next().value;
    _memCache.delete(firstKey);
  }
  _memCache.set(key, { val, exp: Date.now() + (ttlMs || 60000) });
}

// ─── Shared: score KB item relevance ─────────────────────────────────────────
function scoreRelevance(question, item) {
  const q = question.toLowerCase();
  const text = ((item.title || "") + " " + (item.content || "")).toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return 0;
  let score = 0;
  for (const w of words) {
    if (text.includes(w)) score++;
    // Bonus for title match
    if ((item.title || "").toLowerCase().includes(w)) score++;
  }
  return score / words.length;
}

// ─── Shared: build system prompt (without question) ───────────────────────────
function buildSystem(question, kbItems, rules) {
  const MAX_ITEM_CHARS = 1200;
  const TOP_K = 15;
  const all = kbItems.filter((i) => i.title && i.content);

  const scored = all
    .map((i) => ({ item: i, score: scoreRelevance(question, i) }))
    .sort((a, b) => b.score - a.score);
  const hasMatch = scored.length > 0 && scored[0].score > 0;
  const relevant = hasMatch
    ? scored.filter((s) => s.score > 0).slice(0, TOP_K).map((s) => s.item)
    : all.slice(0, 10);

  const kbText = relevant
    .map((i) => `Q: ${i.title.slice(0, 200)}\nA: ${i.content.slice(0, MAX_ITEM_CHARS)}`)
    .join("\n\n");

  const core = `Ты — дружелюбный ИИ-ассистент. Общаешься неформально и тепло, как живой человек.

ПРАВИЛА:
- Это продолжение диалога — НЕ здоровайся повторно если уже поздоровался.
- Отвечай по-дружески, без канцелярита. Можно использовать "ты".
- Используй базу знаний максимально, даже если вопрос нечёткий.
- Если точного ответа нет — ответь на основе похожей информации.
- НЕЛЬЗЯ говорить "уточните у менеджера" если есть хоть что-то связанное в базе.
- Не выдумывай цены и конкретные условия которых нет в базе.
- ВАЖНО: Определи язык собеседника по его последним сообщениям и отвечай СТРОГО на этом же языке. Если пишет на английском — отвечай на английском. На узбекском — на узбекском. На русском — на русском. И так далее для любого языка.
- Будь краток и по делу.

КОНТАКТ МОДЕРАТОРА:
- Если пользователь хочет: написать модератору, связаться с администратором, задать вопрос человеку, перейти к живому контакту — ВСЕГДА направляй ТОЛЬКО на Telegram: https://t.me/AhmadnazarovCOO
- Это единственный контакт модератора. Не предлагай email, формы или другие способы связи.
- Называй его "основной контакт модератора".`;

  const system = rules.trim()
    ? `${core}\n\nДополнительные инструкции:\n${rules.trim()}`
    : core;

  return kbText ? `${system}\n\nБаза знаний:\n${kbText}` : system;
}

// Keep old name as alias for Q&A generation
function buildPrompt(question, kbItems, rules) {
  return buildSystem(question, kbItems, rules) + `\n\nВопрос: ${question}`;
}

// ── Language detection from message text ──────────────────────────────────
function detectLang(text) {
  const t = (text || '').trim();
  if (/[ўқғҳ]/.test(t)) return 'uz';
  if (/\b(va|bu|men|sen|biz|siz|emas|ham|lekin|chunki|nima|qanday|qayer)\b/i.test(t)) return 'uz';
  if (/[а-яёА-ЯЁ]/.test(t)) return 'ru';
  return 'en';
}

// ─── Shared: call AI with conversation history ────────────────────────────────
// Returns { text, inputTokens, outputTokens }
async function callAI(provider, model, system, messages, maxTokens = 800) {
  // Support legacy single-prompt calls
  if (typeof system === "string" && !Array.isArray(messages)) {
    messages = [{ role: "user", content: messages || system }];
    if (messages[0].content === system) system = "";
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const allMsgs = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        messages: allMsgs,
        max_tokens: maxTokens,
        temperature: 0.5,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const providerMsg = data?.error?.message || `OpenAI request failed (${resp.status})`;
      throw new Error(providerMsg);
    }
    return {
      text: data.choices?.[0]?.message?.content?.trim() || "Нет ответа",
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };

  } else if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");
    const gemModel = model || "gemini-1.5-flash";
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    if (system) contents.unshift({ role: "user", parts: [{ text: system }] });
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: maxTokens } }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) {
      const providerMsg = data?.error?.message || `Gemini request failed (${resp.status})`;
      throw new Error(providerMsg);
    }
    return {
      text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "Нет ответа",
      inputTokens: data.usageMetadata?.promptTokenCount || 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    };

  } else {
    // claude (default)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    const body = {
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      messages,
    };
    if (system) body.system = system;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      const providerMsg = data?.error?.message || `Anthropic request failed (${resp.status})`;
      throw new Error(providerMsg);
    }
    return {
      text: data.content?.[0]?.text?.trim() || "Нет ответа",
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    };
  }
}

// ─── Pipeline helpers ──────────────────────────────────────────────────────────
function chunkText(text, maxChars = 1500) {
  const paras = text.split(/\n{2,}/);
  const chunks = [];
  let cur = "";
  for (const para of paras) {
    if (cur.length + para.length > maxChars && cur.length > 0) {
      chunks.push(cur.trim());
      cur = para;
    } else {
      cur = cur ? cur + "\n\n" + para : para;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());

  // Split any oversized chunk by sentences
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars * 1.5) {
      result.push(chunk);
    } else {
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let sub = "";
      for (const s of sentences) {
        if (sub.length + s.length > maxChars && sub.length > 0) {
          result.push(sub.trim());
          sub = s;
        } else {
          sub = sub ? sub + " " + s : s;
        }
      }
      if (sub.trim()) result.push(sub.trim());
    }
  }
  return result.filter((c) => c.length > 60);
}

function semanticKey(question, answer) {
  const text = (question + "|" + answer).toLowerCase().trim().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function generateQAFromChunk(chunk, provider, model) {
  const prompt = `Ты — эксперт по созданию баз знаний. Из текста ниже извлеки вопросы и ответы так, как их задали бы реальные клиенты или пользователи.

ПРАВИЛА:
1. Генерируй 4-8 пар вопрос-ответ на русском языке.
2. Ответы должны быть ПОЛНЫМИ и ДЕТАЛЬНЫМИ — включай все цифры, примеры, детали, условия, перечисления из текста.
3. НЕ сокращай и НЕ упрощай ответы — передавай максимум информации из текста.
4. Вопросы формулируй так, как спросил бы реальный человек (не академически).
5. Если в тексте есть примеры, числа, проценты, названия — обязательно включай их в ответ.
6. Один вопрос = один конкретный аспект темы.
7. Верни ТОЛЬКО валидный JSON массив без лишнего текста.

Формат: [{"question":"...","answer":"...","topic":"..."}]

Текст:
${chunk}

JSON:`;
  try {
    const { text: raw } = await callAI(provider, model, "", [{ role: "user", content: prompt }], 2500);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("generateQAFromChunk error:", e.message);
    return [];
  }
}

// ─── aiChat — прокси для тестового чата в админ-панели ───────────────────────
exports.aiChat = onRequest(
  { cors: true, minInstances: 1, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { question, kbItems = [], rules = "", provider = "openai", model = "gpt-4o-mini", history = [] } = req.body;
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }
    try {
      const system = buildSystem(question, kbItems, rules);
      // Build messages: history + current question
      const messages = [...history.slice(-10), { role: "user", content: question }];
      const { text: answer } = await callAI(provider, model, system, messages);
      res.json({ answer });
    } catch (err) {
      console.error("AI error:", err);
      res.status(500).json({ error: err.message || "AI error" });
    }
  }
);

// ─── verifyProviderKey — validate provider API keys via backend proxy ─────────
exports.verifyProviderKey = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { provider, key } = req.body || {};
    if (!provider || !key) {
      res.status(400).json({ ok: false, error: "provider and key required" });
      return;
    }

    try {
      if (provider === "openai") {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          res.status(401).json({ ok: false, error: data?.error?.message || "Invalid OpenAI key" });
          return;
        }
        res.json({ ok: true });
        return;
      }

      if (provider === "gemini") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          res.status(401).json({ ok: false, error: data?.error?.message || "Invalid Gemini key" });
          return;
        }
        res.json({ ok: true });
        return;
      }

      if (provider === "claude") {
        res.json({ ok: true, note: "Claude key is validated at runtime." });
        return;
      }

      res.status(400).json({ ok: false, error: "Unsupported provider" });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || "Verification failed" });
    }
  }
);

// ─── verifyTelegramToken — validate Telegram bot token via backend proxy ─────
exports.verifyTelegramToken = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { token } = req.body || {};
    if (!token) {
      res.status(400).json({ ok: false, error: "token required" });
      return;
    }

    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.ok) {
        res.status(401).json({ ok: false, error: data?.description || "Invalid Telegram token" });
        return;
      }
      res.json({ ok: true, result: data.result });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message || "Telegram verification failed" });
    }
  }
);

// ─── processKnowledge — пайплайн: текст → чанки → Q&A → дедуп → kbQA ────────
exports.processKnowledge = onRequest(
  { cors: true, timeoutSeconds: 540 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).end(); return; }
    const { uid, jobId, sourceId } = req.body;
    if (!uid || !jobId || !sourceId) {
      res.status(400).json({ error: "uid, jobId, sourceId required" });
      return;
    }

    const db = admin.firestore();
    const jobRef = db.doc(`users/${uid}/jobs/${jobId}`);
    const sourceRef = db.doc(`users/${uid}/kbSources/${sourceId}`);
    const ts = () => ({ updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    const upd = (d) => jobRef.set({ ...d, ...ts() }, { merge: true });

    try {
      await upd({ status: "running", step: "parse", progress: 10 });

      const sourceDoc = await sourceRef.get();
      if (!sourceDoc.exists) throw new Error("Source not found");
      const { rawText, title } = sourceDoc.data();
      if (!rawText) throw new Error("rawText is empty");

      // Get AI provider settings
      const aiDoc = await db.doc(`users/${uid}/settings/ai`).get();
      const aiProviders = aiDoc.exists ? aiDoc.data().providers || {} : {};
      let provider = "claude", model = "";
      for (const p of ["openai", "gemini", "claude"]) {
        if (aiProviders[p]?.enabled) { provider = p; model = aiProviders[p].model || ""; break; }
      }

      // Step: chunk
      await upd({ step: "chunk", progress: 20 });
      const chunks = chunkText(rawText);

      // Step: qa_generate — process in parallel batches of 5
      await upd({ step: "qa_generate", progress: 30 });
      const allQA = [];
      const PARALLEL = 5;
      for (let i = 0; i < chunks.length; i += PARALLEL) {
        // Check for cancellation before each batch
        const jobSnap = await jobRef.get();
        if (jobSnap.data()?.status === "cancelled") {
          await sourceRef.set({ status: "cancelled" }, { merge: true });
          res.json({ ok: false, cancelled: true });
          return;
        }

        const batch = chunks.slice(i, i + PARALLEL);
        const results = await Promise.all(batch.map(c => generateQAFromChunk(c, provider, model)));
        for (const pairs of results) allQA.push(...pairs);

        const done = Math.min(i + PARALLEL, chunks.length);
        const prog = 30 + Math.round((done / chunks.length) * 40);
        await upd({
          progress: prog,
          meta: { chunks: chunks.length, chunksDone: done, qaGenerated: allQA.length },
        });
      }

      // Step: dedupe
      await upd({ step: "dedupe", progress: 75 });
      const existingSnap = await db.collection(`users/${uid}/kbQA`)
        .where("status", "==", "active").get();
      const existingKeys = new Set(
        existingSnap.docs.map((d) => d.data().semanticKey).filter(Boolean)
      );

      const toAdd = [], skipped = [];
      const seenKeys = new Set(existingKeys);
      for (const qa of allQA) {
        if (!qa.question || !qa.answer) continue;
        const key = semanticKey(qa.question, qa.answer);
        if (seenKeys.has(key)) {
          skipped.push(qa);
        } else {
          seenKeys.add(key);
          toAdd.push({ ...qa, semanticKey: key });
        }
      }

      // Step: save
      await upd({ step: "save", progress: 88 });
      const BATCH_SIZE = 400;
      for (let i = 0; i < toAdd.length; i += BATCH_SIZE) {
        const batch = db.batch();
        for (const qa of toAdd.slice(i, i + BATCH_SIZE)) {
          const ref = db.collection(`users/${uid}/kbQA`).doc();
          batch.set(ref, {
            sourceId,
            question: qa.question || "",
            answer: qa.answer || "",
            topic: qa.topic || title || "",
            tags: [],
            semanticKey: qa.semanticKey,
            status: "active",
            _ts: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        await batch.commit();
      }

      await sourceRef.set({ status: "done" }, { merge: true });
      await upd({
        status: "succeeded",
        step: "done",
        progress: 100,
        meta: {
          chunks: chunks.length,
          qaGenerated: allQA.length,
          added: toAdd.length,
          skipped: skipped.length,
        },
      });

      res.json({ ok: true, jobId });
    } catch (err) {
      console.error("processKnowledge error:", err);
      await upd({ status: "failed", errorMessage: err.message });
      await sourceRef.set({ status: "failed" }, { merge: true }).catch(() => { });
      res.status(500).json({ error: err.message });
    }
  }
);

// ─── Voice transcription via OpenAI Whisper ──────────────────────────────────
async function transcribeVoice(fileId, botToken) {
  // 1. Get file path from Telegram
  const fileInfo = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile`,
    {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId })
    }
  ).then(r => r.json());

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    throw new Error('Failed to get file from Telegram');
  }

  // 2. Download voice file
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
  const audioResp = await fetch(fileUrl);
  if (!audioResp.ok) throw new Error('Failed to download voice file');
  const audioBuffer = Buffer.from(await audioResp.arrayBuffer());

  // 3. Send to Whisper API
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', audioBuffer, { filename: 'voice.ogg', contentType: 'audio/ogg' });
  form.append('model', 'whisper-1');

  const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!whisperResp.ok) {
    const errData = await whisperResp.json().catch(() => ({}));
    throw new Error(`Whisper API error: ${errData.error?.message || whisperResp.status}`);
  }

  const result = await whisperResp.json();
  return (result.text || '').trim();
}

// ─── telegramWebhook — получает сообщения от Telegram и отвечает ──────────────
exports.telegramWebhook = onRequest(
  { cors: false, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(200).end(); return; }

    const uid = req.query.uid;
    const botId = req.query.botId;
    if (!uid || !botId) { res.status(200).end(); return; }

    const update = req.body;
    const db = admin.firestore();

    // ── Handle callback_query (inline button presses for provider selection) ──
    if (update.callback_query) {
      const cbq = update.callback_query;
      const cbChatId = String(cbq.message?.chat?.id || '');
      const data = cbq.data || '';

      // ── Flow button press ─────────────────────────────────────────────────
      if (data.startsWith('flow:') && cbChatId) {
        const parts = data.split(':');
        const flowId = parts[1]; const btnId = parts[2];
        const botDoc2 = await db.doc(`users/${uid}/bots/${botId}`).get();
        const botToken2 = botDoc2.exists ? botDoc2.data().token : null;
        const flowsDoc = await db.doc(`users/${uid}/settings/flows`).get();
        const flows = flowsDoc.exists ? (flowsDoc.data().flows || []) : [];
        const flow = flows.find(f => f.id === flowId);
        const btn = flow?.buttons?.find(b => b.id === btnId);
        if (btn && botToken2) {
          await fetch(`https://api.telegram.org/bot${botToken2}/answerCallbackQuery`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: cbq.id }) });
          const replyText = btn.reply === '__ESCALATE__' ? 'Соединяю с менеджером...' : btn.reply;
          await fetch(`https://api.telegram.org/bot${botToken2}/sendMessage`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: cbChatId, text: replyText }) });
          if (btn.reply === '__ESCALATE__') {
            await db.doc(`users/${uid}/chats/${cbChatId}`)
              .set({ mode: 'human', handoffAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          }
        }
        res.status(200).end(); return;
      }

      // ── Fallback: user wants operator ────────────────────────────────────
      if (data === 'fallback:escalate' && cbChatId) {
        const botDoc3 = await db.doc(`users/${uid}/bots/${botId}`).get();
        const botToken3 = botDoc3.exists ? botDoc3.data().token : null;
        if (botToken3) {
          await fetch(`https://api.telegram.org/bot${botToken3}/answerCallbackQuery`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: cbq.id }) });
          await fetch(`https://api.telegram.org/bot${botToken3}/sendMessage`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: cbChatId, text: 'Передаю вопрос оператору. Он ответит в ближайшее время. ✅' }) });
        }
        await db.doc(`users/${uid}/chats/${cbChatId}`)
          .set({ mode: 'human', handoffAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await db.doc(`users/${uid}/chatSessions/${cbChatId}`)
          .set({ fallbackCount: 0 }, { merge: true }).catch(() => {});
        // Notify owner
        const notifSnap = await db.doc(`users/${uid}/settings/notifications`).get();
        const ownerCid = notifSnap.exists ? (notifSnap.data().ownerChatId || '') : '';
        if (ownerCid && botToken3) {
          fetch(`https://api.telegram.org/bot${botToken3}/sendMessage`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: ownerCid, text: `🆘 Пользователь запросил оператора!\nChat ID: ${cbChatId}` }) }).catch(() => {});
        }
        res.status(200).end(); return;
      }

      if (data.startsWith('provider:') && cbChatId) {
        const chosenProvider = data.replace('provider:', '');
        const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
        const botToken = botDoc.exists ? botDoc.data().token : null;

        // Save provider choice for this chat
        await db.doc(`users/${uid}/chatSessions/${cbChatId}`)
          .set({ selectedProvider: chosenProvider, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

        const pNames = { openai: '🟢 OpenAI GPT', gemini: '🔵 Google Gemini', claude: '🟠 Anthropic Claude' };
        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: cbq.id })
            });
          await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: cbChatId, message_id: cbq.message.message_id,
                text: `✅ Выбрана модель: ${pNames[chosenProvider] || chosenProvider}\n\nТеперь задайте ваш вопрос!`
              })
            });
        }
      }
      res.status(200).end(); return;
    }

    const message = update.message || update.edited_message;
    if (!message) { res.status(200).end(); return; }

    // ── Handle voice messages via Whisper STT ────────────────────────────────
    const voiceObj = message.voice || message.video_note;
    let question;
    if (voiceObj) {
      const chatId = String(message.chat.id);
      const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
      const botToken = botDoc.exists ? botDoc.data().token : null;
      if (!botToken) { res.status(200).end(); return; }

      try {
        // Show typing while transcribing
        fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
        }).catch(() => { });

        question = await transcribeVoice(voiceObj.file_id, botToken);
        if (!question || !question.trim()) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: '🎤 Не удалось распознать голосовое сообщение. Попробуйте ещё раз или напишите текстом.' }),
          });
          res.status(200).end(); return;
        }
      } catch (err) {
        console.error('Voice transcription error:', err);
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: '⚠️ Ошибка распознавания голоса. Попробуйте написать текстом.' }),
        });
        res.status(200).end(); return;
      }
    } else if (message.text) {
      question = message.text;
    } else {
      res.status(200).end(); return;
    }

    const chatId = String(message.chat.id);
    const from = message.from || {};
    const chatName = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || `Chat ${chatId}`;
    const chatUsername = from.username ? `@${from.username}` : '';

    try {
      const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
      if (!botDoc.exists) { res.status(200).end(); return; }
      const botData = botDoc.data();
      const botToken = botData.token;
      if (!botToken) { res.status(200).end(); return; }

      // --- Telegram Connect Flow: First Update & /start handling ---
      const telegramState = botData.telegram || {};
      const isFirstUpdate = telegramState.status === "waiting_first_update";

      if (isFirstUpdate) {
        await botDoc.ref.set({
          telegram: {
            status: "active",
            lastUpdateAt: admin.firestore.FieldValue.serverTimestamp()
          }
        }, { merge: true });
      } else {
        await botDoc.ref.set({
          "telegram.lastUpdateAt": admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      if (question === '/start') {
        const welcomeText = telegramState.welcomeMessage || botData.welcomeMessage || "Привет! Чем могу помочь?";
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: welcomeText }),
        });

        // Save initial chat interaction silently
        await db.doc(`users/${uid}/chats/${chatId}`).set({
          chatId, name: chatName, username: chatUsername, botId,
          lastMessage: "/start", lastTs: admin.firestore.FieldValue.serverTimestamp(),
          _ts: admin.firestore.FieldValue.serverTimestamp(), mode: 'ai'
        }, { merge: true }).catch(() => { });

        res.status(200).end();
        return;
      }

      const agentDoc = await db.doc(`users/${uid}/settings/agent`).get();
      if (agentDoc.exists && agentDoc.data().active === false) { res.status(200).end(); return; }

      // ── Check plan & monthly limit ─────────────────────────────────────────────
      const nowDate = new Date();
      const monthKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
      const [planDoc, usageDoc] = await Promise.all([
        db.doc(`users/${uid}/settings/plan`).get(),
        db.doc(`users/${uid}/usage/${monthKey}`).get(),
      ]);
      let planData = planDoc.exists ? planDoc.data() : null;
      // Auto-create 14-day trial if no plan exists (user may not have opened admin panel yet)
      if (!planData) {
        const trialEnds = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 14 * 24 * 3600, 0);
        planData = { type: 'trial', trialEnds, monthlyLimit: 2000 };
        planDoc.ref.set({ ...planData, createdAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
      }
      let monthlyLimit = 0;
      if (planData) {
        const ptype = planData.type || 'trial';
        const PLAN_LIMITS = { trial: 2000, starter: 5000, pro: 20000, business: 100000, premium: 20000 };
        if (ptype === 'trial') {
          const te = planData.trialEnds?.toDate?.() || (planData.trialEnds?.seconds ? new Date(planData.trialEnds.seconds * 1000) : null);
          if (te && te > nowDate) monthlyLimit = planData.monthlyLimit || PLAN_LIMITS.trial;
        } else if (['starter', 'pro', 'business', 'premium'].includes(ptype)) {
          const pu = planData.paidUntil?.toDate?.();
          if (pu && pu > nowDate) monthlyLimit = planData.monthlyLimit || PLAN_LIMITS[ptype] || 5000;
        }
      }
      const usageCount = usageDoc.exists ? (usageDoc.data().aiRequests || 0) : 0;
      if (monthlyLimit === 0 || usageCount >= monthlyLimit) {
        const limitText = monthlyLimit === 0
          ? '⚠️ Пробный период завершён. Оформите подписку для продолжения работы.'
          : `⚠️ Лимит AI-запросов исчерпан (${usageCount}/${monthlyLimit}). Обновите тариф в панели управления.`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: limitText }),
        });
        res.status(200).end();
        return;
      }

      // ── Check handoff state (human operator may have taken over) ──────────────
      const chatDocRef = db.doc(`users/${uid}/chats/${chatId}`);
      const sessionDocRef = db.doc(`users/${uid}/chatSessions/${chatId}`);
      const [chatDoc, sessionDoc] = await Promise.all([chatDocRef.get(), sessionDocRef.get()]);
      const isNewChat = !chatDoc.exists; // Track if this is a brand-new user
      const chatData = chatDoc.exists ? chatDoc.data() : {};
      const chatMode = chatData.mode || 'ai';
      const handoffAt = chatData.handoffAt;
      const HANDOFF_MS = 5 * 60 * 1000; // 5 minutes

      if (chatMode === 'human' && handoffAt) {
        const elapsed = Date.now() - handoffAt.toMillis();
        if (elapsed < HANDOFF_MS) {
          // Human operator is active — save user message but skip AI
          const historyRef = db.doc(`users/${uid}/chatHistory/${chatId}`);
          const histSnap = await historyRef.get();
          const hist = histSnap.exists ? (histSnap.data().messages || []) : [];
          const newHist = [...hist, { role: 'user', content: question }].slice(-20);
          await Promise.all([
            historyRef.set({ messages: newHist, updatedAt: admin.firestore.FieldValue.serverTimestamp() }),
            chatDocRef.set({
              chatId, name: chatName, username: chatUsername, botId,
              lastMessage: question.slice(0, 100),
              lastTs: admin.firestore.FieldValue.serverTimestamp(),
              _ts: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true }),
          ]);
          res.status(200).end();
          return;
        }
        // 5 min elapsed — reset to AI mode
        await chatDocRef.set({ mode: 'ai', handoffAt: admin.firestore.FieldValue.delete() }, { merge: true });
      }

      // ── KB + settings with 60-second in-memory cache (warm instances) ──────────
      const detectedLang = detectLang(question);
      const _kbCacheKey = `kb:${uid}:${botId || "_"}:${detectedLang}`;
      const _settCacheKey = `sett:${uid}`;
      let kbItems = _mcGet(_kbCacheKey);
      let _cachedSett = _mcGet(_settCacheKey);

      if (kbItems === null || _cachedSett === null) {
        const rulesPromise = botId
          ? Promise.resolve({ exists: !!botData.rules, data: () => ({ text: botData.rules }) })
          : db.doc(`users/${uid}/settings/rules`).get();

        // Settings and primary KB source run in parallel
        const [rulesDoc, aiDoc, autoReplyDoc, notifDoc, primaryKbSnap, flowsDoc] = await Promise.all([
          rulesPromise,
          db.doc(`users/${uid}/settings/ai`).get(),
          db.doc(`users/${uid}/settings/autoReplies`).get(),
          db.doc(`users/${uid}/settings/notifications`).get(),
          botId
            ? db.collection(`users/${uid}/bots/${botId}/knowledge_base`).limit(200).get()
            : db.collection(`users/${uid}/kbQA`).where("status", "==", "active").limit(200).get(),
          db.doc(`users/${uid}/settings/flows`).get(),
        ]);

        if (kbItems === null) {
          const _langFilter = item => !item.lang || item.lang === 'auto' || item.lang === detectedLang;
          if (botId) {
            kbItems = primaryKbSnap.docs
              .map(d => ({ ...d.data(), _id: d.id }))
              .filter(_langFilter)
              .map(d => ({ title: d.title || d.question || d.name || "", content: d.content || d.answer || d.text || "", _id: d._id }))
              .filter(k => k.content.trim().length > 0);
          } else if (primaryKbSnap.size > 0) {
            kbItems = primaryKbSnap.docs
              .map(d => ({ ...d.data(), _id: d.id }))
              .filter(_langFilter)
              .map(d => ({ title: d.question || "", content: d.answer || "", _id: d._id }));
          } else {
            // Fallback to legacy kbItems only if kbQA is empty
            const legacySnap = await db.collection(`users/${uid}/kbItems`).limit(200).get();
            kbItems = legacySnap.docs
              .map(d => ({ ...d.data(), _id: d.id }))
              .filter(_langFilter)
              .map(d => ({ title: d.title || "", content: d.content || "", _id: d._id }));
          }
          _mcSet(_kbCacheKey, kbItems, 60000);
        }

        if (_cachedSett === null) {
          _cachedSett = {
            rules: rulesDoc.exists ? rulesDoc.data().text || "" : "",
            aiProviders: aiDoc.exists ? aiDoc.data().providers || {} : {},
            autoRules: autoReplyDoc.exists ? autoReplyDoc.data().rules || [] : [],
            notifData: notifDoc.exists ? notifDoc.data() : {},
            flows: flowsDoc.exists ? (flowsDoc.data().flows || []) : [],
          };
          _mcSet(_settCacheKey, _cachedSett, 60000);
        }
      }

      var { rules, aiProviders, autoRules: _autoRules, notifData: _notifData, flows: _flows } = _cachedSett;

      // ── Auto-reply rules (no AI, saves requests) ──────────────────────────────
      if (_autoRules && _autoRules.length > 0) {
        const qLow = question.toLowerCase().trim();
        for (const rule of _autoRules) {
          if (!rule.keyword || !rule.response || !rule.enabled) continue;
          const kw = rule.keyword.toLowerCase().trim();
          const matched = rule.matchType === 'exact' ? qLow === kw : qLow.includes(kw);
          if (matched) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: rule.response }),
            });
            // Save chat entry so it appears in admin panel
            chatDocRef.set({
              chatId, name: chatName, username: chatUsername, botId,
              lastMessage: question.slice(0, 100), lastTs: admin.firestore.FieldValue.serverTimestamp(),
              _ts: admin.firestore.FieldValue.serverTimestamp(), mode: 'ai'
            }, { merge: true }).catch(() => { });
            res.status(200).end(); return;
          }
        }
      }

      // ── Flow builder (trigger → inline buttons) ───────────────────────────────
      if (_flows && _flows.length > 0) {
        const qLow = question.toLowerCase().trim();
        for (const flow of _flows) {
          if (!flow.enabled || !flow.trigger || !flow.buttons?.length) continue;
          const matched = flow.matchType === 'exact'
            ? qLow === flow.trigger.toLowerCase()
            : qLow.includes(flow.trigger.toLowerCase());
          if (matched) {
            const keyboard = flow.buttons.map(b => ([{ text: b.label, callback_data: `flow:${flow.id}:${b.id}` }]));
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text: flow.text || 'Выберите:', reply_markup: { inline_keyboard: keyboard } }),
            });
            chatDocRef.set({ chatId, name: chatName, username: chatUsername, botId,
              lastMessage: question.slice(0, 100), lastTs: admin.firestore.FieldValue.serverTimestamp(),
              _ts: admin.firestore.FieldValue.serverTimestamp(), mode: 'ai' }, { merge: true }).catch(() => {});
            res.status(200).end(); return;
          }
        }
      }

      // ── Notify owner about new user ───────────────────────────────────────────
      const notifData = _notifData || {};
      const ownerChatId = notifData.ownerChatId || '';
      if (isNewChat && ownerChatId && notifData.notifyNewUser !== false) {
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ownerChatId,
            text: `👤 Новый пользователь написал боту!\n\nИмя: ${chatName}${chatUsername ? '\nUsername: ' + chatUsername : ''}\nПервый вопрос: ${question.slice(0, 100)}`
          }),
        }).catch(() => { });
      }

      // ── Smart provider selection ─────────────────────────────────────────────
      const enabledProviders = ["openai", "gemini", "claude"].filter(p => aiProviders[p]?.enabled);
      let provider = "openai", model = "gpt-4o-mini";

      if (enabledProviders.length === 0) {
        // No providers configured — use openai gpt-4o-mini as default
        provider = "openai"; model = "gpt-4o-mini";
      } else if (enabledProviders.length === 1) {
        // Exactly one enabled — use it
        provider = enabledProviders[0];
        model = aiProviders[provider].model || "";
      } else {
        // Multiple enabled — check if user already chose one (sessionDoc loaded earlier)
        const savedProvider = sessionDoc.exists ? sessionDoc.data().selectedProvider : null;

        if (savedProvider && aiProviders[savedProvider]?.enabled) {
          // Use saved choice
          provider = savedProvider;
          model = aiProviders[provider].model || "";
        } else {
          // No saved choice — send provider selection buttons and stop
          const pNames = { openai: '🟢 OpenAI GPT', gemini: '🔵 Google Gemini', claude: '🟠 Anthropic Claude' };
          const buttons = enabledProviders.map(p => ([{ text: pNames[p] || p, callback_data: `provider:${p}` }]));
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: '🤖 Выберите AI-ассистента для общения:',
              reply_markup: { inline_keyboard: buttons },
            }),
          });
          res.status(200).end(); return;
        }
      }

      // Handle /myid — user can learn their Telegram chat ID to set up notifications
      if (question === '/myid') {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: `🆔 Ваш Telegram ID: <code>${chatId}</code>\n\nВставьте это число в настройки уведомлений на панели управления.`, parse_mode: 'HTML' }),
        });
        res.status(200).end(); return;
      }

      // Handle /model command — reset provider choice so user can pick again
      if (question === '/model' || question === '/модель') {
        const pNames = { openai: '🟢 OpenAI GPT', gemini: '🔵 Google Gemini', claude: '🟠 Anthropic Claude' };
        const buttons = enabledProviders.map(p => ([{ text: pNames[p] || p, callback_data: `provider:${p}` }]));
        await db.doc(`users/${uid}/chatSessions/${chatId}`)
          .set({ selectedProvider: null }, { merge: true });
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: '🤖 Выберите AI-ассистента:',
            reply_markup: { inline_keyboard: buttons },
          }),
        });
        res.status(200).end(); return;
      }

      // Load chat history for context
      const historyRef = db.doc(`users/${uid}/chatHistory/${chatId}`);
      const historySnap = await historyRef.get();
      const historyDoc = historySnap.exists ? historySnap.data() : {};
      const allMessages = historyDoc.messages || [];
      const historySummary = historyDoc.summary || '';

      // Show "typing..." indicator and keep it alive while AI is thinking
      const sendTyping = () => fetch(
        `https://api.telegram.org/bot${botToken}/sendChatAction`,
        {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, action: "typing" })
        }
      ).catch(() => { });
      sendTyping();
      const typingInterval = setInterval(sendTyping, 4000);

      // Fallback detection: check if KB has any matching content
      const kbScores = kbItems.map(i => scoreRelevance(question, i));
      const maxKbScore = kbScores.length > 0 ? Math.max(...kbScores) : 0;
      const noKbMatch = maxKbScore === 0 && kbItems.length > 0;
      const sessionData = sessionDoc.exists ? sessionDoc.data() : {};
      const fallbackCount = sessionData.fallbackCount || 0;

      // Second consecutive no-match → escalate immediately
      if (noKbMatch && fallbackCount >= 1) {
        await chatDocRef.set({ mode: 'human', handoffAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: 'Передаю ваш вопрос оператору. Он ответит в ближайшее время. ✅' }),
        });
        if (ownerChatId) {
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ownerChatId, text: `🆘 Пользователь запросил оператора!\nВопрос: ${question.slice(0, 200)}\nChat ID: ${chatId}` }),
          }).catch(() => {});
        }
        sessionDocRef.set({ fallbackCount: 0 }, { merge: true }).catch(() => {});
        res.status(200).end(); return;
      }

      const recentMessages = allMessages.slice(-20);
      const system = buildSystem(question, kbItems, rules);
      const systemWithMemory = historySummary
        ? `${system}\n\nКраткое резюме предыдущего диалога:\n${historySummary}`
        : system;
      const messages = [...recentMessages, { role: "user", content: question }];
      const resolvedModel = model || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'gemini' ? 'gemini-1.5-flash' : 'claude-haiku-4-5-20251001');
      let aiResult;
      const t0 = Date.now();
      try {
        aiResult = await callAI(provider, resolvedModel, systemWithMemory, messages);
      } finally {
        clearInterval(typingInterval);
      }
      const latencyMs = Date.now() - t0;
      const answer = aiResult.text;
      const inputTokens = aiResult.inputTokens;
      const outputTokens = aiResult.outputTokens;

      // Increment `asked` counter on top matching kbQA items
      const topMatches = kbItems
        .map((i) => ({ item: i, score: scoreRelevance(question, i) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const askIncrements = topMatches.map((s) =>
        s.item._id
          ? db.doc(`users/${uid}/kbQA/${s.item._id}`).update({ asked: admin.firestore.FieldValue.increment(1) }).catch(() => { })
          : Promise.resolve()
      );

      // Save updated history (keep last 100 messages)
      const newHistory = [
        ...allMessages,
        { role: "user", content: question },
        { role: "assistant", content: answer },
      ].slice(-100);

      // Async summary compression: if history > 40 msgs and summary is stale (>1h)
      if (newHistory.length > 40) {
        const lastSummaryMs = historyDoc.summaryUpdatedAt?.toMillis?.() || 0;
        if (Date.now() - lastSummaryMs > 3600000) {
          const toSummarize = newHistory.slice(0, newHistory.length - 20);
          callAI('openai', 'gpt-4o-mini',
            'Сожми историю диалога в 3-5 предложений на языке диалога. Только факты: о чём спрашивал пользователь, что узнал, что выбрал.',
            toSummarize, 300)
            .then(r => historyRef.set({ summary: r.text, summaryUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {}))
            .catch(() => {});
        }
      }

      // Strip markdown formatting for clean Telegram output
      const tgText = answer
        .replace(/\*\*(.+?)\*\*/gs, '$1')
        .replace(/\*(.+?)\*/gs, '$1')
        .replace(/__(.+?)__/gs, '$1')
        .replace(/_([^_]+?)_/gs, '$1')
        .replace(/#{1,6}\s/g, '')
        .trim();

      // Critical: send message + save history first
      // Track contacts & conversion
      const prevMsgCount = chatData.msgCount || 0;
      const newMsgCount = prevMsgCount + 1;
      const botRef = db.doc(`users/${uid}/bots/${botId}`);
      const statsWrites = [];
      if (isNewChat) {
        statsWrites.push(botRef.set({ contacts: admin.firestore.FieldValue.increment(1) }, { merge: true }).catch(() => { }));
      }
      if (prevMsgCount === 1) {
        // Second message = user came back = conversion
        statsWrites.push(botRef.set({ converted: admin.firestore.FieldValue.increment(1) }, { merge: true }).catch(() => { }));
      }

      await Promise.all([
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: tgText }),
        }),
        historyRef.set({ messages: newHistory, updatedAt: admin.firestore.FieldValue.serverTimestamp() }),
        chatDocRef.set({
          chatId, name: chatName, username: chatUsername, botId,
          lastMessage: question.slice(0, 100),
          lastTs: admin.firestore.FieldValue.serverTimestamp(),
          _ts: admin.firestore.FieldValue.serverTimestamp(),
          mode: 'ai',
          handoffAt: admin.firestore.FieldValue.delete(),
          msgCount: newMsgCount,
        }, { merge: true }),
        ...askIncrements,
        ...statsWrites,
      ]);

      // Fallback chain: после AI-ответа — кнопка оператора если нет KB-матча
      if (noKbMatch) {
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: 'Не нашёл точного ответа в базе знаний. Хотите связаться с оператором?',
            reply_markup: { inline_keyboard: [[{ text: '📞 Связаться с оператором', callback_data: 'fallback:escalate' }]] }
          }),
        }).catch(() => {});
        sessionDocRef.set({ fallbackCount: fallbackCount + 1, lastFallbackQ: question }, { merge: true }).catch(() => {});
      } else if (fallbackCount > 0) {
        sessionDocRef.set({ fallbackCount: 0 }, { merge: true }).catch(() => {});
      }

      // Non-critical: log usage/topics + limit notifications
      const newUsageCount = usageCount + 1;
      if (ownerChatId && monthlyLimit > 0) {
        const prevPct = usageCount / monthlyLimit;
        const newPct = newUsageCount / monthlyLimit;
        if (prevPct < 0.8 && newPct >= 0.8 && notifData.notify80 !== false) {
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ownerChatId,
              text: `⚠️ Использовано 80% AI-запросов\n\n${newUsageCount} из ${monthlyLimit} запросов за этот месяц.\n\nОбновите тариф в панели: https://chatbot-acd16.web.app`
            }),
          }).catch(() => { });
        } else if (prevPct < 1.0 && newPct >= 1.0 && notifData.notify100 !== false) {
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: ownerChatId,
              text: `🔴 Лимит AI-запросов исчерпан!\n\n${monthlyLimit}/${monthlyLimit} запросов за этот месяц. Бот больше не отвечает клиентам.\n\nОбновите тариф: https://chatbot-acd16.web.app`
            }),
          }).catch(() => { });
        }
      }

      // If no KB match → save to unanswered so owner can review & add to KB
      const unansweredWrite = topMatches.length === 0
        ? db.collection(`users/${uid}/unanswered`).add({
          text: question.slice(0, 300),
          aiAnswer: answer.slice(0, 2000),
          chatId,
          chatName,
          botId,
          _ts: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => { })
        : Promise.resolve();

      Promise.all([
        unansweredWrite,
        db.collection(`users/${uid}/topics`).add({
          name: question.slice(0, 80),
          text: question.slice(0, 80),
          _ts: admin.firestore.FieldValue.serverTimestamp(),
          ts: admin.firestore.FieldValue.serverTimestamp(),
          botId,
        }),
        db.collection(`users/${uid}/aiUsage`).add({
          chatId,
          chatName,
          channel: 'telegram',
          provider,
          model: resolvedModel,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          latencyMs,
          status: 'ok',
          botId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          _ts: admin.firestore.FieldValue.serverTimestamp(),
        }),
        db.doc(`users/${uid}/usage/${monthKey}`).set(
          { aiRequests: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        ),
      ]).catch(err => console.warn("Non-critical logging failed:", err));

    } catch (err) {
      console.error("telegramWebhook error:", err);
    }

    res.status(200).end();
  }
);

// ─── registerWebhook — регистрирует/удаляет webhook у Telegram ───────────────
exports.registerWebhook = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const { uid, botId, token, remove } = req.body;
    if (!uid || !botId || !token) {
      res.status(400).json({ error: "uid, botId, token required" });
      return;
    }

    const webhookUrl = remove
      ? ""
      : `https://us-central1-chatbot-acd16.cloudfunctions.net/telegramWebhook?uid=${uid}&botId=${botId}`;

    const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await r.json();
    res.json(data);
  }
);

// ─── helpers: extract caption text from json3 data ───────────────────────────
function extractCaptionText(captionData) {
  return (captionData.events || [])
    .filter((e) => e.segs)
    .flatMap((e) => e.segs.map((s) => s.utf8 || ""))
    .filter((t) => t && t !== "\n")
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

// ─── helpers: pick best track and fetch its text ─────────────────────────────
async function fetchTrackText(tracks) {
  const prefer = (code) => tracks.find((t) => t.languageCode === code && t.kind !== "asr");
  const track =
    prefer("ru") || prefer("en") ||
    tracks.find((t) => t.kind !== "asr") ||
    tracks[0];

  const captionUrl = (track.baseUrl || "").replace(/\\u0026/g, "&") + "&fmt=json3";
  const captionResp = await fetch(captionUrl);
  if (!captionResp.ok) throw new Error("Не удалось загрузить субтитры.");
  const captionData = await captionResp.json();
  const text = extractCaptionText(captionData);
  if (!text) throw new Error("Транскрипция пуста.");
  return { text, lang: track.languageCode };
}

// ─── helpers: fetch YouTube captions via InnerTube API ───────────────────────
async function fetchYouTubeCaptions(videoId) {
  // Method 1: YouTube InnerTube API (Android client — works from cloud servers)
  try {
    const resp = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "com.google.android.youtube/18.11.34 (Linux; U; Android 11) gzip",
        "X-Youtube-Client-Name": "3",
        "X-Youtube-Client-Version": "18.11.34",
      },
      body: JSON.stringify({
        videoId,
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: "18.11.34",
            androidSdkVersion: 30,
            hl: "en",
            gl: "US",
          },
        },
      }),
    });

    if (resp.ok) {
      const data = await resp.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) return await fetchTrackText(tracks);
    }
  } catch (_) { /* fall through */ }

  // Method 2: WEB client InnerTube fallback
  try {
    const resp = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20230810.01.00",
              hl: "en",
              gl: "US",
            },
          },
        }),
      }
    );

    if (resp.ok) {
      const data = await resp.json();
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks && tracks.length > 0) return await fetchTrackText(tracks);
    }
  } catch (_) { /* fall through */ }

  // Method 3: page scraping last resort
  try {
    const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await pageResp.text();
    const captionIdx = html.indexOf('"captionTracks":');
    if (captionIdx !== -1) {
      const arrStart = html.indexOf("[", captionIdx);
      let depth = 0, arrEnd = arrStart;
      for (let i = arrStart; i < Math.min(html.length, arrStart + 50000); i++) {
        if (html[i] === "[" || html[i] === "{") depth++;
        else if (html[i] === "]" || html[i] === "}") { depth--; if (depth === 0) { arrEnd = i + 1; break; } }
      }
      const tracks = JSON.parse(html.slice(arrStart, arrEnd));
      if (tracks && tracks.length > 0) return await fetchTrackText(tracks);
    }
  } catch (_) { /* fall through */ }

  throw new Error("Субтитры не найдены. Видео должно иметь субтитры (автоматические или добавленные вручную).");
}

// ─── transcribeYouTube — транскрибация YouTube видео ─────────────────────────
exports.transcribeYouTube = onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).end(); return; }
    const { url, uid } = req.body;
    if (!url || !uid) {
      res.status(400).json({ error: "url and uid required" });
      return;
    }

    // Extract YouTube video ID
    const idMatch = url.match(
      /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );
    if (!idMatch) {
      res.status(400).json({ error: "Не удалось распознать ссылку YouTube" });
      return;
    }
    const videoId = idMatch[1];

    try {
      // Use direct page scraping (more reliable than youtube-transcript package)
      const { text: rawText, lang } = await fetchYouTubeCaptions(videoId);

      // Get video title via oEmbed
      let title = `YouTube ${videoId}`;
      try {
        const oEmbed = await fetch(
          `https://www.youtube.com/oembed?url=https://youtu.be/${videoId}&format=json`
        ).then((r) => r.json());
        if (oEmbed.title) title = oEmbed.title;
      } catch { }

      // Save to kbSources as transcript type
      const db = admin.firestore();
      const sourceRef = await db.collection(`users/${uid}/kbSources`).add({
        type: "transcript",
        url,
        videoId,
        title,
        lang,
        rawText,
        chars: rawText.length,
        status: "transcribed",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ ok: true, sourceId: sourceRef.id, title, chars: rawText.length, preview: rawText.slice(0, 500) });
    } catch (err) {
      console.error("transcribeYouTube error:", err);
      res.status(500).json({ error: err.message || "Ошибка транскрибации" });
    }
  }
);

// ─── importUrlKnowledge — fetch URL, extract text, save into bot knowledge base ──
exports.importUrlKnowledge = onRequest(
  { cors: true, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).end(); return; }
    const { uid, botId, url } = req.body || {};
    if (!uid || !botId || !url) {
      res.status(400).json({ error: "uid, botId, url required" });
      return;
    }

    try {
      let parsed;
      try { parsed = new URL(url); } catch { parsed = null; }
      if (!parsed || !/^https?:$/.test(parsed.protocol)) {
        res.status(400).json({ error: "Invalid URL" });
        return;
      }

      const pageResp = await fetch(parsed.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; BotPanel/1.0; +https://chatbot-acd16.web.app)",
          "Accept-Language": "ru,en;q=0.9",
        },
      });
      if (!pageResp.ok) {
        res.status(400).json({ error: `Cannot fetch URL (${pageResp.status})` });
        return;
      }

      const html = await pageResp.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = (titleMatch?.[1] || parsed.hostname).replace(/\s+/g, " ").trim().slice(0, 160);
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 24000);

      if (!text || text.length < 60) {
        res.status(400).json({ error: "URL content is too short or unreadable" });
        return;
      }

      const db = admin.firestore();
      const ref = await db.collection(`users/${uid}/bots/${botId}/knowledge_base`).add({
        type: "url",
        source: "url_import",
        url: parsed.toString(),
        title: title || "Web page",
        content: text,
        status: "active",
        chars: text.length,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ ok: true, id: ref.id, title, chars: text.length });
    } catch (err) {
      console.error("importUrlKnowledge error:", err);
      res.status(500).json({ error: err.message || "Import failed" });
    }
  }
);

// ─── Projects API (ChatGPT-style workspace) ───────────────────────────────────
function _apiPath(req) {
  const p = String(req.path || req.url || "").split("?")[0];
  if (p.startsWith("/api/")) return p.slice(5);
  if (p.startsWith("/")) return p.slice(1);
  return p;
}

async function _requireAuthUid(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  if (!m) throw new Error("UNAUTHORIZED");
  const decoded = await admin.auth().verifyIdToken(m[1]);
  return decoded.uid;
}

function _asIso(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  return null;
}

function _safeLimit(v, def = 30, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function _decodeCursor(cursor) {
  if (!cursor) return 0;
  const n = Number(Buffer.from(String(cursor), "base64").toString("utf8"));
  return Number.isFinite(n) ? n : 0;
}

function _encodeCursor(num) {
  return Buffer.from(String(num), "utf8").toString("base64");
}

function _safeRequestId(value) {
  const v = String(value || "").trim();
  if (!v) return "";
  if (v.length > 120) return "";
  return /^[A-Za-z0-9._:-]+$/.test(v) ? v : "";
}

function _tokenizeSearchText(input) {
  const words = String(input || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@._-]+/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .slice(0, 25);
  return Array.from(new Set(words));
}

async function ensureDefaultProject(uid) {
  const db = admin.firestore();
  const projectsCol = db.collection(`users/${uid}/projects`);
  const metaRef = db.doc(`users/${uid}/settings/meta`);

  const existing = await projectsCol.limit(1).get();
  if (!existing.empty) return existing.docs[0].id;

  // If migration already ran, the user intentionally deleted all projects — don't recreate
  const metaSnap = await metaRef.get();
  if (metaSnap.exists && metaSnap.data().projectsMigrated) return null;

  const [firstBotSnap, rulesSnap] = await Promise.all([
    db.collection(`users/${uid}/bots`).limit(1).get(),
    db.doc(`users/${uid}/settings/rules`).get().catch(() => null),
  ]);
  const bot = !firstBotSnap.empty ? firstBotSnap.docs[0].data() : {};
  const defaultName = bot.name || "Default Project";
  const defaultHost = bot.username ? `@${String(bot.username).replace(/^@/, "")}` : (bot.domain || bot.ip || "");
  const defaultInstructions = bot.rules || bot.description || (rulesSnap && rulesSnap.exists ? (rulesSnap.data().text || "") : "");

  const projectRef = projectsCol.doc();
  await projectRef.set({
    name: defaultName,
    botHost: defaultHost,
    instructions: defaultInstructions,
    legacyDefault: true,
    sourcesCount: 0,
    chatsCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const projectId = projectRef.id;
  const batchWrites = [];

  // Migrate old bot KB into project_sources (non-destructive copy)
  if (!firstBotSnap.empty) {
    const botId = firstBotSnap.docs[0].id;
    const kbSnap = await db.collection(`users/${uid}/bots/${botId}/knowledge_base`).limit(500).get().catch(() => ({ docs: [] }));
    for (const d of kbSnap.docs || []) {
      const item = d.data() || {};
      const sourceRef = db.collection(`users/${uid}/project_sources`).doc();
      batchWrites.push({
        ref: sourceRef,
        data: {
          projectId,
          ownerId: uid,
          type: item.type === "url" ? "url" : (item.type === "file" ? "file" : "text"),
          title: item.title || item.name || "Legacy source",
          contentRef: item.url || item.content || item.path || "",
          searchTokens: _tokenizeSearchText(`${item.title || item.name || ""} ${item.url || ""} ${item.content || ""}`),
          status: item.status === "error" ? "error" : "ready",
          legacyRef: `users/${uid}/bots/${botId}/knowledge_base/${d.id}`,
          createdAtMs: item.createdAt?.toMillis?.() || Date.now(),
          createdAt: item.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }
  }

  // Migrate old chats into project_chats — fetch all chat histories in parallel (not N+1)
  const chatsSnap = await db.collection(`users/${uid}/chats`).limit(200).get().catch(() => ({ docs: [] }));
  const chatDocs = chatsSnap.docs || [];
  const histDocs = await Promise.all(
    chatDocs.map(c => db.doc(`users/${uid}/chatHistory/${c.id}`).get().catch(() => null))
  );
  for (let ci = 0; ci < chatDocs.length; ci++) {
    const c = chatDocs[ci];
    const cd = c.data() || {};
    const pChatRef = db.collection(`users/${uid}/project_chats`).doc(c.id);
    batchWrites.push({
      ref: pChatRef,
      data: {
        projectId,
        ownerId: uid,
        channel: cd.channel || (cd.username ? "telegram" : "web"),
        userExternalId: c.id,
        name: cd.name || "",
        username: cd.username || "",
        lastMessage: cd.lastMessage || "",
        searchTokens: _tokenizeSearchText(`${cd.name || ""} ${cd.username || ""} ${c.id || ""} ${cd.lastMessage || ""}`),
        lastMessageAtMs: cd.lastTs?.toMillis?.() || cd._ts?.toMillis?.() || Date.now(),
        lastMessageAt: cd.lastTs || cd._ts || admin.firestore.FieldValue.serverTimestamp(),
        createdAt: cd._ts || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        legacyRef: `users/${uid}/chats/${c.id}`,
      },
    });

    const histDoc = histDocs[ci];
    const msgs = histDoc && histDoc.exists ? (histDoc.data().messages || []) : [];
    for (let i = 0; i < Math.min(msgs.length, 80); i++) {
      const m = msgs[i] || {};
      const msgRef = pChatRef.collection("messages").doc();
      batchWrites.push({
        ref: msgRef,
        data: {
          chatId: c.id,
          role: m.role || "user",
          text: m.content || "",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }
  }

  for (let i = 0; i < batchWrites.length; i += 400) {
    const b = db.batch();
    for (const w of batchWrites.slice(i, i + 400)) b.set(w.ref, w.data, { merge: true });
    await b.commit();
  }

  await projectRef.set({
    sourcesCount: batchWrites.filter((w) => String(w.ref.path).includes("/project_sources/")).length,
    chatsCount: batchWrites.filter((w) => String(w.ref.path).includes("/project_chats/") && !String(w.ref.path).includes("/messages/")).length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Mark migration as done so we never auto-recreate if user deletes all projects
  await metaRef.set({ projectsMigrated: true, migratedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  return projectId;
}

function _projectPublic(id, d) {
  return {
    id,
    name: d.name || "",
    botHost: d.botHost || "",
    instructions: d.instructions || "",
    legacyDefault: !!d.legacyDefault,
    sourcesCount: Number(d.sourcesCount || 0),
    chatsCount: Number(d.chatsCount || 0),
    createdAt: _asIso(d.createdAt),
    updatedAt: _asIso(d.updatedAt),
  };
}

exports.projectsApi = onRequest(
  { cors: true, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).end(); return; }
    let uid = "";
    try {
      uid = await _requireAuthUid(req);
    } catch (_) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const db = admin.firestore();
    const path = _apiPath(req);

    try {
      // GET /projects
      if (req.method === "GET" && path === "projects") {
        await ensureDefaultProject(uid);
        const snap = await db.collection(`users/${uid}/projects`).orderBy("updatedAt", "desc").get();
        const items = snap.docs.map((d) => _projectPublic(d.id, d.data() || {}));
        res.json({ ok: true, projects: items });
        return;
      }

      // POST /projects
      if (req.method === "POST" && path === "projects") {
        await ensureDefaultProject(uid);
        const { name, botHost, instructions = "", requestId } = req.body || {};
        if (!name || !String(name).trim()) { res.status(400).json({ error: "name required" }); return; }
        if (!botHost || !String(botHost).trim()) { res.status(400).json({ error: "botHost required" }); return; }
        const cleanRequestId = _safeRequestId(requestId);
        const projectsCol = db.collection(`users/${uid}/projects`);

        if (!cleanRequestId) {
          const ref = projectsCol.doc();
          await ref.set({
            name: String(name).trim(),
            botHost: String(botHost).trim(),
            instructions: String(instructions || "").trim(),
            sourcesCount: 0,
            chatsCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          const fresh = await ref.get();
          res.status(201).json({ ok: true, project: _projectPublic(ref.id, fresh.data() || {}), idempotent: false });
          return;
        }

        const reqRef = db.doc(`users/${uid}/project_create_requests/${cleanRequestId}`);
        const result = await db.runTransaction(async (tx) => {
          const reqSnap = await tx.get(reqRef);
          if (reqSnap.exists) {
            const existingProjectId = String(reqSnap.data().projectId || "");
            if (existingProjectId) {
              const pRef = projectsCol.doc(existingProjectId);
              const pSnap = await tx.get(pRef);
              if (pSnap.exists) {
                return { projectId: existingProjectId, projectData: pSnap.data() || {}, reused: true };
              }
            }
          }

          const pRef = projectsCol.doc();
          const now = admin.firestore.FieldValue.serverTimestamp();
          const pData = {
            name: String(name).trim(),
            botHost: String(botHost).trim(),
            instructions: String(instructions || "").trim(),
            sourcesCount: 0,
            chatsCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          tx.set(pRef, pData);
          tx.set(reqRef, {
            requestId: cleanRequestId,
            projectId: pRef.id,
            name: String(name).trim(),
            botHost: String(botHost).trim(),
            createdAt: now,
            updatedAt: now,
          }, { merge: true });
          return { projectId: pRef.id, projectData: pData, reused: false };
        });

        const fresh = await db.doc(`users/${uid}/projects/${result.projectId}`).get();
        const projectData = fresh.exists ? (fresh.data() || result.projectData || {}) : (result.projectData || {});
        res.status(result.reused ? 200 : 201).json({
          ok: true,
          project: _projectPublic(result.projectId, projectData),
          idempotent: true,
          reused: !!result.reused,
        });
        return;
      }

      // GET/PATCH/DELETE /projects/:id
      const pm = path.match(/^projects\/([^/]+)$/);
      if (pm) {
        const projectId = decodeURIComponent(pm[1]);
        const ref = db.doc(`users/${uid}/projects/${projectId}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Project not found" }); return; }

        if (req.method === "GET") {
          res.json({ ok: true, project: _projectPublic(projectId, snap.data() || {}) });
          return;
        }
        if (req.method === "PATCH") {
          const { name, botHost, instructions } = req.body || {};
          const upd = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          if (name !== undefined) upd.name = String(name).trim();
          if (botHost !== undefined) upd.botHost = String(botHost).trim();
          if (instructions !== undefined) upd.instructions = String(instructions);
          await ref.set(upd, { merge: true });
          const fresh = await ref.get();
          res.json({ ok: true, project: _projectPublic(projectId, fresh.data() || {}) });
          return;
        }
        if (req.method === "DELETE") {
          const [srcSnap, chatSnap] = await Promise.all([
            db.collection(`users/${uid}/project_sources`).where("projectId", "==", projectId).limit(500).get(),
            db.collection(`users/${uid}/project_chats`).where("projectId", "==", projectId).limit(500).get(),
          ]);
          for (let i = 0; i < srcSnap.docs.length; i += 400) {
            const b = db.batch();
            for (const d of srcSnap.docs.slice(i, i + 400)) b.delete(d.ref);
            await b.commit();
          }
          // Fetch all message sub-collections in parallel (avoids N+1 sequential reads)
          const msgSnaps = await Promise.all(
            chatSnap.docs.map(d => d.ref.collection("messages").limit(500).get())
          );
          for (let i = 0; i < chatSnap.docs.length; i += 200) {
            const b = db.batch();
            for (let j = i; j < Math.min(i + 200, chatSnap.docs.length); j++) {
              msgSnaps[j].docs.forEach(m => b.delete(m.ref));
              b.delete(chatSnap.docs[j].ref);
            }
            await b.commit();
          }
          await ref.delete();
          res.json({ ok: true });
          return;
        }
      }

      // GET/POST /projects/:id/sources
      const ps = path.match(/^projects\/([^/]+)\/sources$/);
      if (ps) {
        const projectId = decodeURIComponent(ps[1]);
        const pRef = db.doc(`users/${uid}/projects/${projectId}`);
        if (!(await pRef.get()).exists) { res.status(404).json({ error: "Project not found" }); return; }

        if (req.method === "GET") {
          const limit = _safeLimit(req.query.limit, 30, 100);
          const cursor = _decodeCursor(req.query.cursor);
          const q = String(req.query.q || "").toLowerCase().trim();
          const type = String(req.query.type || "").toLowerCase().trim();
          const qToken = q.split(/\s+/).find(Boolean) || "";
          let query = db.collection(`users/${uid}/project_sources`)
            .where("projectId", "==", projectId);
          if (type) query = query.where("type", "==", type);
          if (qToken) query = query.where("searchTokens", "array-contains", qToken);
          query = query.orderBy("createdAtMs", "desc");
          if (cursor > 0) query = query.startAfter(cursor);
          query = query.limit(limit + 1);
          const snap = await query.get();
          let sources = snap.docs.map((d) => {
            const s = d.data() || {};
            return {
              id: d.id,
              projectId: s.projectId,
              type: s.type || "text",
              title: s.title || "",
              contentRef: s.contentRef || "",
              status: s.status || "pending",
              createdAtMs: Number(s.createdAtMs || 0),
              createdAt: _asIso(s.createdAt),
              updatedAt: _asIso(s.updatedAt),
            };
          });
          if (qToken && sources.length === 0 && !cursor) {
            let fallbackQuery = db.collection(`users/${uid}/project_sources`)
              .where("projectId", "==", projectId);
            if (type) fallbackQuery = fallbackQuery.where("type", "==", type);
            const fallbackSnap = await fallbackQuery.orderBy("createdAtMs", "desc").limit(Math.min(limit * 4, 120)).get();
            sources = fallbackSnap.docs.map((d) => {
              const s = d.data() || {};
              return {
                id: d.id,
                projectId: s.projectId,
                type: s.type || "text",
                title: s.title || "",
                contentRef: s.contentRef || "",
                status: s.status || "pending",
                createdAtMs: Number(s.createdAtMs || 0),
                createdAt: _asIso(s.createdAt),
                updatedAt: _asIso(s.updatedAt),
              };
            });
          }
          let hasMore = sources.length > limit;
          if (hasMore) sources = sources.slice(0, limit);
          // Non-breaking fallback for legacy users: read bot knowledge directly
          if (sources.length === 0 && !cursor) {
            const p = (await pRef.get()).data() || {};
            if (p.legacyDefault) {
              const botSnap = await db.collection(`users/${uid}/bots`).limit(1).get();
              if (!botSnap.empty) {
                const botId = botSnap.docs[0].id;
                const legacyKb = await db.collection(`users/${uid}/bots/${botId}/knowledge_base`).limit(300).get();
                sources = legacyKb.docs.map((d) => {
                  const s = d.data() || {};
                  return {
                    id: `legacy-${d.id}`,
                    projectId,
                    type: s.type || "text",
                    title: s.title || s.name || "Legacy source",
                    contentRef: s.url || s.content || s.path || "",
                    status: s.status || "ready",
                    createdAtMs: 0,
                    createdAt: _asIso(s.createdAt),
                    updatedAt: _asIso(s.updatedAt) || _asIso(s.createdAt),
                  };
                });
              }
            }
          }
          if (q) {
            sources = sources.filter((s) =>
              `${s.title} ${s.contentRef} ${s.type} ${s.status}`.toLowerCase().includes(q));
          }
          const items = sources.slice(0, limit);
          const nextCursor = hasMore
            ? _encodeCursor(items.length ? (items[items.length - 1].createdAtMs || (items[items.length - 1].createdAt ? Date.parse(items[items.length - 1].createdAt) : 0)) : 0)
            : null;
          const result = items.map((s) => {
            const out = { ...s };
            delete out.createdAtMs;
            return out;
          });
          res.json({ ok: true, sources: result, nextCursor, hasMore });
          return;
        }

        if (req.method === "POST") {
          const { type, title, contentRef } = req.body || {};
          if (!type || !["file", "url", "text", "document"].includes(String(type))) {
            res.status(400).json({ error: "type must be file|url|text|document" });
            return;
          }
          if (!title || !String(title).trim()) { res.status(400).json({ error: "title required" }); return; }
          if (!contentRef || !String(contentRef).trim()) { res.status(400).json({ error: "contentRef required" }); return; }
          const status = (type === "file" || type === "document") ? "pending" : "ready";
          const ref = db.collection(`users/${uid}/project_sources`).doc();
          await ref.set({
            projectId,
            ownerId: uid,
            type: String(type),
            title: String(title).trim(),
            contentRef: String(contentRef).trim(),
            searchTokens: _tokenizeSearchText(`${title} ${contentRef}`),
            status,
            createdAtMs: Date.now(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await pRef.set({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourcesCount: admin.firestore.FieldValue.increment(1),
          }, { merge: true });
          const fresh = await ref.get();
          const d = fresh.data() || {};
          res.status(201).json({
            ok: true,
            source: {
              id: ref.id,
              projectId: d.projectId,
              type: d.type,
              title: d.title,
              contentRef: d.contentRef,
              status: d.status,
              createdAt: _asIso(d.createdAt),
              updatedAt: _asIso(d.updatedAt),
            },
          });
          return;
        }
      }

      // GET /projects/:id/chats
      const pc = path.match(/^projects\/([^/]+)\/chats$/);
      if (pc && req.method === "GET") {
        const projectId = decodeURIComponent(pc[1]);
        const pRef = db.doc(`users/${uid}/projects/${projectId}`);
        if (!(await pRef.get()).exists) { res.status(404).json({ error: "Project not found" }); return; }
        const q = String(req.query.q || "").toLowerCase().trim();
        const sort = String(req.query.sort || "newest");
        const limit = _safeLimit(req.query.limit, 30, 100);
        const cursor = _decodeCursor(req.query.cursor);
        const qToken = q.split(/\s+/).find(Boolean) || "";
        const dir = sort === "oldest" ? "asc" : "desc";
        let query = db.collection(`users/${uid}/project_chats`)
          .where("projectId", "==", projectId);
        if (qToken) query = query.where("searchTokens", "array-contains", qToken);
        query = query.orderBy("lastMessageAtMs", dir);
        if (cursor > 0) query = query.startAfter(cursor);
        query = query.limit(limit + 1);
        const snap = await query.get();
        let chats = snap.docs.map((d) => {
          const c = d.data() || {};
          return {
            id: d.id,
            projectId: c.projectId,
            channel: c.channel || "web",
            userExternalId: c.userExternalId || "",
            name: c.name || "",
            username: c.username || "",
            lastMessage: c.lastMessage || "",
            lastMessageAtMs: Number(c.lastMessageAtMs || 0),
            lastMessageAt: _asIso(c.lastMessageAt),
            createdAt: _asIso(c.createdAt),
          };
        });
        if (qToken && chats.length === 0 && !cursor) {
          const fallbackSnap = await db.collection(`users/${uid}/project_chats`)
            .where("projectId", "==", projectId)
            .orderBy("lastMessageAtMs", dir)
            .limit(Math.min(limit * 4, 120))
            .get();
          chats = fallbackSnap.docs.map((d) => {
            const c = d.data() || {};
            return {
              id: d.id,
              projectId: c.projectId,
              channel: c.channel || "web",
              userExternalId: c.userExternalId || "",
              name: c.name || "",
              username: c.username || "",
              lastMessage: c.lastMessage || "",
              lastMessageAtMs: Number(c.lastMessageAtMs || 0),
              lastMessageAt: _asIso(c.lastMessageAt),
              createdAt: _asIso(c.createdAt),
            };
          });
        }
        let hasMore = chats.length > limit;
        if (hasMore) chats = chats.slice(0, limit);
        if (chats.length === 0 && !cursor) {
          const p = (await pRef.get()).data() || {};
          if (p.legacyDefault) {
            const legacyChats = await db.collection(`users/${uid}/chats`)
              .orderBy("lastTs", sort === "oldest" ? "asc" : "desc")
              .limit(limit + 1)
              .get();
            chats = legacyChats.docs.map((d) => {
              const c = d.data() || {};
              return {
                id: d.id,
                projectId,
                channel: c.channel || (c.username ? "telegram" : "web"),
                userExternalId: d.id,
                name: c.name || "",
                username: c.username || "",
                lastMessage: c.lastMessage || "",
                lastMessageAtMs: c.lastTs?.toMillis?.() || c._ts?.toMillis?.() || 0,
                lastMessageAt: _asIso(c.lastTs || c._ts),
                createdAt: _asIso(c._ts),
              };
            });
            hasMore = chats.length > limit;
            if (hasMore) chats = chats.slice(0, limit);
          }
        }
        if (q) {
          chats = chats.filter((c) =>
            `${c.name} ${c.username} ${c.userExternalId} ${c.lastMessage}`.toLowerCase().includes(q));
        }
        const items = chats.slice(0, limit);
        const nextCursor = hasMore
          ? _encodeCursor(items.length ? (items[items.length - 1].lastMessageAtMs || (items[items.length - 1].lastMessageAt ? Date.parse(items[items.length - 1].lastMessageAt) : 0)) : 0)
          : null;
        const result = items.map((c) => {
          const out = { ...c };
          delete out.lastMessageAtMs;
          return out;
        });
        res.json({ ok: true, chats: result, nextCursor, hasMore });
        return;
      }

      // DELETE /sources/:id
      const ds = path.match(/^sources\/([^/]+)$/);
      if (ds && req.method === "DELETE") {
        const id = decodeURIComponent(ds[1]);
        const ref = db.doc(`users/${uid}/project_sources/${id}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Source not found" }); return; }
        const projectId = snap.data().projectId;
        await ref.delete();
        if (projectId) {
          await db.doc(`users/${uid}/projects/${projectId}`).set({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sourcesCount: admin.firestore.FieldValue.increment(-1),
          }, { merge: true });
        }
        res.json({ ok: true });
        return;
      }

      // GET /chats/:id/messages
      const cm = path.match(/^chats\/([^/]+)\/messages$/);
      if (cm && req.method === "GET") {
        const chatId = decodeURIComponent(cm[1]);
        const chatRef = db.doc(`users/${uid}/project_chats/${chatId}`);
        let messages = [];
        if ((await chatRef.get()).exists) {
          const snap = await chatRef.collection("messages").orderBy("createdAt", "asc").limit(300).get();
          messages = snap.docs.map((d) => {
            const m = d.data() || {};
            return {
              id: d.id,
              chatId,
              role: m.role || "user",
              text: m.text || "",
              createdAt: _asIso(m.createdAt),
            };
          });
        } else {
          // Legacy fallback
          const hist = await db.doc(`users/${uid}/chatHistory/${chatId}`).get();
          if (!hist.exists) { res.status(404).json({ error: "Chat not found" }); return; }
          messages = (hist.data().messages || []).slice(-300).map((m, idx) => ({
            id: `legacy-${idx}`,
            chatId,
            role: m.role || "user",
            text: m.content || "",
            createdAt: null,
          }));
        }
        res.json({ ok: true, messages });
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      console.error("projectsApi error:", err);
      res.status(500).json({ error: err.message || "Projects API error" });
    }
  }
);

// ─── adminSendMessage — оператор отправляет сообщение клиенту напрямую ────────
exports.adminSendMessage = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).end(); return; }
    const { uid, chatId, botId, text } = req.body;
    if (!uid || !chatId || !botId || !text) {
      res.status(400).json({ error: "uid, chatId, botId, text required" });
      return;
    }

    const db = admin.firestore();

    // Get bot token
    const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
    if (!botDoc.exists) { res.status(404).json({ error: "Bot not found" }); return; }
    const botToken = botDoc.data().token;
    if (!botToken) { res.status(400).json({ error: "Bot token missing" }); return; }

    // Send via Telegram
    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!tgResp.ok) {
      const err = await tgResp.json().catch(() => ({}));
      res.status(500).json({ error: "Telegram error: " + (err.description || "unknown") });
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // Append to chat history
    const historyRef = db.doc(`users/${uid}/chatHistory/${chatId}`);
    const histSnap = await historyRef.get();
    const hist = histSnap.exists ? (histSnap.data().messages || []) : [];
    const newHist = [
      ...hist,
      { role: "assistant", content: text, sentByAdmin: true },
    ].slice(-20);

    await Promise.all([
      historyRef.set({ messages: newHist, updatedAt: now }),
      db.doc(`users/${uid}/chats/${chatId}`).set({
        mode: "human",
        handoffAt: now,
        lastMessage: `[Оператор]: ${text.slice(0, 80)}`,
        lastTs: now,
      }, { merge: true }),
    ]);

    res.json({ ok: true });
  }
);

// ─── broadcastMessage — рассылка сообщения всем пользователям бота ────────────
exports.broadcastMessage = onRequest(
  { cors: true, timeoutSeconds: 540 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return; }
    const { uid, botId, text, filter } = req.body;
    if (!uid || !botId || !text) {
      res.status(400).json({ error: 'uid, botId, text required' });
      return;
    }

    const db = admin.firestore();
    const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
    if (!botDoc.exists) { res.status(404).json({ error: 'Bot not found' }); return; }
    const botToken = botDoc.data().token;
    if (!botToken) { res.status(400).json({ error: 'Bot token missing' }); return; }

    let query = db.collection(`users/${uid}/chats`).where('botId', '==', botId);
    if (filter === 'week') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query = query.where('lastTs', '>=', since);
    } else if (filter === 'month') {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      query = query.where('lastTs', '>=', since);
    }

    const snap = await query.get();
    let sent = 0, failed = 0;

    for (const doc of snap.docs) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: doc.id, text }),
        });
        if (r.ok) sent++; else failed++;
      } catch { failed++; }
      await new Promise(resolve => setTimeout(resolve, 35));
    }

    res.json({ ok: true, sent, failed, total: snap.size });
  }
);

// ── Telegram Mini App Auth ──────────────────────────────────────────────────
exports.telegramAuth = onRequest({ cors: true, timeoutSeconds: 30 }, async (req, res) => {
  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ ok: false, error: 'No initData' });

  const crypto = require('crypto');
  const TOKEN = process.env.PLATFORM_BOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ ok: false, error: 'Bot token not configured' });

  // Validate HMAC-SHA256 per Telegram Mini App spec
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (expectedHash !== hash) return res.status(401).json({ ok: false, error: 'Invalid signature' });

  const user = JSON.parse(params.get('user'));
  const uid = `tg_${user.id}`;
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ');

  try {
    await admin.auth().updateUser(uid, { displayName });
  } catch {
    await admin.auth().createUser({ uid, displayName });
  }

  const token = await admin.auth().createCustomToken(uid, { telegramId: user.id });
  res.json({ ok: true, token, user: { id: user.id, name: displayName, username: user.username } });
});

// ── generateAnswer — AI answer generator for KB editing ─────────────────────
exports.generateAnswer = onRequest(
  { cors: true, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const {
      question,
      mode = "KB_EDIT_REPLACE",
      existing_answer = "",
      kb_matches = [],
      bot_rules = "",
      language = "",
      provider = "openai",
      model = "gpt-4o-mini",
    } = req.body;

    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    // Build system prompt based on mode
    let systemPrompt = "";

    if (mode === "KB_EDIT_REPLACE") {
      systemPrompt = `Ты — помощник для создания ответов в базе знаний AI-бота.
Тебе дан вопрос пользователя и (возможно) текущий ответ.
Сгенерируй ПОЛНЫЙ НОВЫЙ ответ, который заменит старый.
Ответ должен быть: короткий, понятный, прикладной, без воды.
Если есть текущий ответ — используй его как базу, но перепиши лучше.
Не выдумывай факты. Если нет данных — говори нейтрально.
${bot_rules ? `\nПравила бота: ${bot_rules}` : ""}
${language ? `\nОтвечай на языке: ${language}` : "\nОтвечай на языке вопроса."}

Верни ТОЛЬКО текст ответа, без JSON, без обёрток.`;

    } else if (mode === "KB_EDIT_APPEND") {
      systemPrompt = `Ты — помощник для дополнения ответов в базе знаний AI-бота.
Тебе дан вопрос, текущий ответ и (возможно) фрагменты базы знаний.
НЕ переписывай весь ответ заново.
Добавь ТОЛЬКО недостающие блоки: уточнения, шаги, примеры, важные оговорки.
Результат — "добавка", которую админ вставит в конец существующего ответа.
${bot_rules ? `\nПравила бота: ${bot_rules}` : ""}
${language ? `\nОтвечай на языке: ${language}` : "\nОтвечай на языке вопроса."}

Верни ТОЛЬКО текст дополнения, без JSON, без обёрток.`;

    } else {
      // UNANSWERED_DRAFT
      systemPrompt = `Ты — помощник для создания черновых ответов в базе знаний AI-бота.
Тебе дан вопрос пользователя, на который бот не смог ответить.
Сгенерируй ответ, даже если базы знаний нет.
Будь аккуратным с фактами — не утверждай "у нас точно есть/нет".
Если вопрос требует данных, которых нет — дай общий ответ.
Ответ должен быть готов к утверждению админом (нейтральный, безопасный).
${bot_rules ? `\nПравила бота: ${bot_rules}` : ""}
${language ? `\nОтвечай на языке: ${language}` : "\nОтвечай на языке вопроса."}

Верни ТОЛЬКО текст ответа, без JSON, без обёрток.`;
    }

    // Build user message
    let userMsg = `Вопрос: ${question}`;
    if (existing_answer) userMsg += `\n\nТекущий ответ: ${existing_answer}`;
    if (kb_matches.length > 0) userMsg += `\n\nФрагменты базы знаний:\n${kb_matches.map((m, i) => `${i + 1}. ${m}`).join("\n")}`;

    try {
      const { text } = await callAI(provider, model, systemPrompt, [{ role: "user", content: userMsg }], 600);

      // Calculate confidence
      let confidence = 0.5;
      if (kb_matches.length > 0 && existing_answer) confidence = 0.85;
      else if (kb_matches.length > 0) confidence = 0.7;
      else if (existing_answer) confidence = 0.6;
      else confidence = 0.3;

      const admin_note = mode === "UNANSWERED_DRAFT"
        ? "Черновик — проверьте перед сохранением"
        : mode === "KB_EDIT_APPEND"
          ? "Дополнение — вставьте в нужное место"
          : "Новый ответ — проверьте корректность";

      res.json({
        answer_text: text,
        admin_note,
        confidence,
      });
    } catch (err) {
      console.error("generateAnswer error:", err);
      res.status(500).json({ error: err.message || "AI error" });
    }
  }
);

let adminUsersCache = null;
let adminUsersCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── listAllUsers — для супер-админки: список всех пользователей ─────────────
exports.listAllUsers = onRequest(
  { cors: true, timeoutSeconds: 60, memory: "512MiB" },
  async (req, res) => {
    try {
      if (adminUsersCache && Date.now() - adminUsersCacheTime < CACHE_TTL) {
        return res.json({ users: adminUsersCache, total: adminUsersCache.length, cached: true });
      }

      const db = admin.firestore();
      const authAdmin = admin.auth();

      // List all Firebase Auth users (handles pagination automatically)
      const allAuthUsers = [];
      let nextPageToken;
      do {
        const listResult = await authAdmin.listUsers(1000, nextPageToken);
        allAuthUsers.push(...listResult.users);
        nextPageToken = listResult.pageToken;
      } while (nextPageToken);

      const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
      const users = [];

      // Chunk requests to avoid Firestore connection overload (50 users at a time)
      const chunkSize = 50;
      for (let i = 0; i < allAuthUsers.length; i += chunkSize) {
        const chunk = allAuthUsers.slice(i, i + chunkSize);
        const chunkResults = await Promise.all(
          chunk.map(async (authUser) => {
            const uid = authUser.uid;
            let plan = {}, agentName = '', agentActive = false;
            let botsCount = 0, usage = 0, kbCount = 0;
            let platform = '', userAgent = '', phone = '', tgUsername = '';

            try {
              const userDoc = await db.doc(`users/${uid}`).get();
              if (userDoc.exists) {
                const uData = userDoc.data();
                platform = uData.platform || '';
                userAgent = uData.userAgent || '';
                phone = uData.phone || '';
                tgUsername = uData.tgUsername || '';
              }
            } catch (e) { }

            if (!platform && userAgent) {
              if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) platform = 'mobile';
              else platform = 'desktop';
            }
            if (!platform) platform = 'desktop';

            try {
              const planSnap = await db.doc(`users/${uid}/settings/plan`).get();
              if (planSnap.exists) plan = planSnap.data();
            } catch (e) { }

            try {
              const agentSnap = await db.doc(`users/${uid}/settings/agent`).get();
              if (agentSnap.exists) {
                agentName = agentSnap.data().name || '';
                agentActive = agentSnap.data().active !== false;
              }
            } catch (e) { }

            try {
              const botsSnap = await db.collection(`users/${uid}/bots`).get();
              botsCount = botsSnap.size;
            } catch (e) { }

            try {
              const usageSnap = await db.doc(`users/${uid}/usage/${monthKey}`).get();
              if (usageSnap.exists) usage = usageSnap.data().count || usageSnap.data().aiRequests || 0;
            } catch (e) { }

            try {
              const kbSnap = await db.collection(`users/${uid}/kbQA`).get();
              kbCount = kbSnap.size;
            } catch (e) { }

            const planSerialized = { ...plan };
            if (plan.trialEnds?.toDate) planSerialized.trialEnds = { seconds: Math.floor(plan.trialEnds.toDate().getTime() / 1000) };
            if (plan.paidUntil?.toDate) planSerialized.paidUntil = { seconds: Math.floor(plan.paidUntil.toDate().getTime() / 1000) };
            if (plan.createdAt?.toDate) planSerialized.createdAt = { seconds: Math.floor(plan.createdAt.toDate().getTime() / 1000) };

            return {
              uid,
              email: authUser.email || '',
              displayName: authUser.displayName || '',
              created: authUser.metadata.creationTime || null,
              lastSignIn: authUser.metadata.lastSignInTime || null,
              plan: planSerialized,
              agentName,
              agentActive,
              bots: botsCount,
              requests: usage,
              kbCount,
              platform,
              phone,
              tgUsername
            };
          })
        );
        users.push(...chunkResults);
      }

      adminUsersCache = users;
      adminUsersCacheTime = Date.now();
      res.json({ users, total: users.length, cached: false });
    } catch (err) {
      console.error("getAdminUsers error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

let aiStatsCache = null;
let aiStatsCacheTime = 0;

// ─── getAiStats — агрегированная статистика ИИ для супер-админки ──────────────
exports.getAiStats = onRequest(
  { cors: true, timeoutSeconds: 60, memory: "512MiB" },
  async (req, res) => {
    try {
      if (aiStatsCache && Date.now() - aiStatsCacheTime < CACHE_TTL) {
        return res.json({ events: aiStatsCache, total: aiStatsCache.length, cached: true });
      }

      const db = admin.firestore();
      const authAdmin = admin.auth();

      // Get all users
      const allAuthUsers = [];
      let nextPageToken;
      do {
        const listResult = await authAdmin.listUsers(1000, nextPageToken);
        allAuthUsers.push(...listResult.users);
        nextPageToken = listResult.pageToken;
      } while (nextPageToken);

      // Collect aiUsage from all users in chunks
      const allEvents = [];
      const chunkSize = 50;
      for (let i = 0; i < allAuthUsers.length; i += chunkSize) {
        const chunk = allAuthUsers.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (authUser) => {
            const uid = authUser.uid;
            try {
              const snap = await db.collection(`users/${uid}/aiUsage`).get();
              snap.docs.forEach(doc => {
                const data = doc.data();
                allEvents.push({
                  ...data,
                  ownerUid: uid,
                  ownerEmail: authUser.email || '',
                  createdAt: data.createdAt?.toDate ? { seconds: Math.floor(data.createdAt.toDate().getTime() / 1000) } : data.createdAt,
                });
              });
            } catch (e) { }
          })
        );
      }

      aiStatsCache = allEvents;
      aiStatsCacheTime = Date.now();
      res.json({ events: allEvents, total: allEvents.length, cached: false });
    } catch (err) {
      console.error("getAiStats error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);
// ─── CHAT OS MASTER ORCHESTRATOR ─────────────────────────────────────────────
const { OpenAI } = require("openai");

exports.chatOsHandler = onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    try {
      if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
      const { uid, action, attachment, capabilities } = req.body;
      const message = req.body.message || req.body.text || "";
      if (!uid) return res.status(400).json({ error: "Missing uid" });
      const VALID_ACTIONS = ['init', 'message', 'clear_chat'];
      if (!VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ error: `Invalid action "${action}". Valid: init, message, clear_chat` });
      }

      const db = admin.firestore();

      const sessionRef = db.collection("users").doc(uid).collection("chat_os_sessions").doc("default");
      const botsSnap = await db.collection("users").doc(uid).collection("bots").get();
      const userBots = botsSnap.docs.map(d => ({ id: d.id, name: d.data().name || "Unnamed Bot" }));

      if (action === 'init') {
        const sessionSnap = await sessionRef.get();
        let session = sessionSnap.exists ? sessionSnap.data() : { mode: "admin", activeBotId: null, history: [], rev: 0 };
        if (!session.history) session.history = [];

        const defaultProfile = { industry: null, business_type: null, offer: null, geo: null, working_hours: null, pricing_model: null, delivery_or_service_flow: null, payment_methods: null, contacts: null, missing_fields: [], next_best_action: null };
        if (!session.business_profile) session.business_profile = defaultProfile;

        const defaultOnboardingState = { business_type: null, service_or_product: null, city_or_region: null, communication_language: null, goal: null, channels: [], knowledge_source_preference: null, stage: "discover" };
        if (!session.onboarding_state) session.onboarding_state = defaultOnboardingState;

        return res.status(200).json({
          history: session.history,
          mode: session.mode,
          activeBotId: session.activeBotId,
          business_profile: session.business_profile,
          onboarding_state: session.onboarding_state,
          assistant_expectation: session.assistant_expectation || null
        });
      }

      // ── clear_chat: wipe history but keep lastSeq monotonic ──────────────────
      if (action === 'clear_chat') {
        try {
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(sessionRef);
            const s = snap.exists
              ? snap.data()
              : { rev: 0, lastSeq: 0, mode: "admin", activeBotId: null, history: [] };

            const nextSeq = (s.lastSeq || 0) + 1;

            const resetMarker = {
              role: "assistant",
              content: "История чата очищена. Продолжим — что нужно сделать?",
              seq: nextSeq,
              ts: Date.now(),
              rid: `reset_${Date.now()}`
            };

            tx.set(sessionRef, {
              history: [resetMarker],
              lastSeq: nextSeq,        // ✅ NOT reset — only incremented
              rev: (s.rev || 0) + 1,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
              // mode & activeBotId untouched via merge:true
            }, { merge: true });
          });

          return res.status(200).json({ success: true });
        } catch (err) {
          console.error("[ChatOS] clear_chat failed", { uid, err: err.message });
          return res.status(500).json({ success: false, error: "clear_chat_failed" });
        }
      }

      const rid = crypto.randomUUID();
      let currentSession;

      // Phase A: Transaction 1 - Append User Message
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        const s = snap.exists ? snap.data() : { rev: 0, history: [], mode: "admin", activeBotId: null, lastSeq: 0 };
        if (!s.history) s.history = [];
        const nextSeq = (s.lastSeq || 0) + 1;

        const defaultProfile = { industry: null, business_type: null, offer: null, geo: null, working_hours: null, pricing_model: null, delivery_or_service_flow: null, payment_methods: null, contacts: null, missing_fields: [], next_best_action: null };
        if (!s.business_profile) s.business_profile = defaultProfile;

        const defaultOnboardingState = { business_type: null, service_or_product: null, city_or_region: null, communication_language: null, goal: null, channels: [], knowledge_source_preference: null, stage: "discover" };
        if (!s.onboarding_state) s.onboarding_state = defaultOnboardingState;

        // Auto-assign first bot if none selected
        if (!s.activeBotId && userBots.length > 0) {
          s.activeBotId = userBots[0].id;
        }

        if (!s.state) s.state = "idle";

        // --- Telegram Connect State Machine Intercept ---
        const tgTokenRegex = /^[0-9]+:[A-Za-z0-9_-]+$/;
        if (s.state === "connecting_telegram" && tgTokenRegex.test(message.trim())) {
          // LLM is already verifying it, ignore duplicate token submission
          currentSession = { ...s }; // ensure currentSession is defined for post-transaction checks
          return;
        } else if (s.state === "waiting_token" && tgTokenRegex.test(message.trim())) {
          s.state = "connecting_telegram";
          s.assistant_expectation = { type: "telegram_connect", persistent: false };
        }

        s.history.push({
          role: "user",
          content: message,
          seq: nextSeq,
          ts: Date.now(),
          rid: rid
        });

        currentSession = { ...s };

        tx.set(sessionRef, {
          history: s.history,
          activeBotId: s.activeBotId,
          mode: s.mode || "admin",
          business_profile: s.business_profile,
          onboarding_state: s.onboarding_state,
          state: s.state,
          assistant_expectation: s.assistant_expectation || null,
          lastSeq: nextSeq,
          rev: (s.rev || 0) + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      // Special early abort if we just ignored a duplicate token
      if (currentSession && currentSession.state === "connecting_telegram" && currentSession.history && currentSession.history[currentSession.history.length - 1].content !== message) {
        return res.status(200).json({ reply: "⏳ Проверяю токен, пожалуйста, подождите..." });
      }

      // If an attachment was sent with this message, save it directly to the active bot's Knowledge Base
      if (attachment && attachment.type === 'file' && currentSession.activeBotId) {
        const fileKbRef = db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).collection("knowledge_base").doc();
        await fileKbRef.set({
          title: attachment.fileName || attachment.name || "Uploaded File",
          type: "file",
          fileUrl: attachment.fileUrl || attachment.downloadURL || null, // frontend sends downloadURL
          storagePath: attachment.storagePath,
          mimeType: attachment.mimeType,
          size: attachment.size,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Parallel write to unified knowledge_items for frontend UI
        await db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).collection("knowledge_items").doc(fileKbRef.id).set({
          name: attachment.fileName || attachment.name || "Uploaded File",
          type: "file",
          mimeType: attachment.mimeType,
          size: attachment.size,
          storagePath: attachment.storagePath,
          downloadURL: attachment.fileUrl || attachment.downloadURL || null,
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Extract text content for TXT/CSV/MD files so RAG can use them
        const _fname = (attachment.fileName || attachment.name || '').toLowerCase();
        const _textMimes = ['text/plain', 'text/csv', 'text/markdown', 'text/x-markdown'];
        const _isTextFile = _textMimes.includes(attachment.mimeType) ||
          _fname.endsWith('.txt') || _fname.endsWith('.csv') || _fname.endsWith('.md');
        if (_isTextFile) {
          try {
            const _fileUrl = attachment.fileUrl || attachment.downloadURL;
            const _fileRes = await fetch(_fileUrl);
            const _rawText = await _fileRes.text();
            if (_rawText && _rawText.length > 20) {
              await fileKbRef.update({
                content: _rawText.slice(0, 50000),
                textExtracted: true,
                textLength: _rawText.length
              });
            }
          } catch (_e) {
            console.error('[KB] Text extraction failed:', attachment.name, _e.message);
          }
        }
      }

      let activeBotText = "None";
      if (currentSession.activeBotId) {
        const b = userBots.find(b => b.id === currentSession.activeBotId);
        if (b) activeBotText = `${b.name} (${b.id})`;
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY missing" });
      const openai = new OpenAI({ apiKey });

      const MASTER_PROMPT = `
You are BotPanel AI — a chat-first interface for creating, configuring, and managing AI chatbots.
You must act natively like Apple's smart onboarding: ask ONE question at a time, wait for the user's answer, and confirm smoothly.

────────────────────────────────────────
ONBOARDING & CREATION FLOW (APPLE-STYLE)

When a user wants to create a new bot, follow this exact sequence. DO NOT ask multiple questions at once.
Step 1: Ask "Для кого этот классный бот? (например: ресторан, фитнес, личный помощник)"
      [Wait for user answer]
Step 2: Ask "Что он должен делать в одной фразе? (например: отвечать на вопросы по меню, записывать на прием)"
      [Wait for user answer]
Step 3: Ask "Какой язык основной? (RU / EN / UZ) и какой тон общения (дружелюбный, строгий)?"
      [Wait for user answer]
Step 4: Summarize: "Отлично. Я создам бота для [Goal], язык [Lang], тон [Tone]. Создаем?"
      [If yes -> execute create_bot tool]

────────────────────────────────────────
TELEGRAM CONNECTION FLOW (REAL VERIFICATION)

If the user wants to connect Telegram, guide them strictly:
Step 1: Give instructions to create a bot in @BotFather and ask them to paste the token here.
Step 2: Once they paste the token, execute the "connect_telegram" tool.
      CRITICAL: NEVER say "Бот онлайн" or "Connected successfully" on your own.
      The "connect_telegram" tool will return a success/error message. 
      Read the tool's return message verbatim. If it says "Token is valid, waiting for /start", tell that to the user.
      If it says "Token invalid", tell the user to check their token.

────────────────────────────────────────
WELCOME MESSAGE FLOW

After Telegram is connected and active:
Ask the user: "Напишите короткое приветствие (1-2 строки), которое бот будет отправлять при команде /start."
When they reply, execute "set_welcome_message" tool.

────────────────────────────────────────
KNOWLEDGE BASE FLOW

When the user wants to add materials to the knowledge base:
- TEXT: Ask them to paste it, then call add_knowledge with title + content.
- LINK/URL: ALWAYS call fetch_webpage tool first. Never use add_knowledge with just a URL as content — the bot won't be able to use it. If fetch fails, tell user to copy-paste the text manually.
- FILE (PDF/DOCX): Say "Файл сохранён. Для точных ответов по его содержимому скопируйте ключевые части текста и добавьте через 'Вставить текст'."
- FILE (TXT/CSV/MD): Say "Файл прочитан и добавлен в базу знаний ✅".
- After any successful KB add: confirm with "✅ Добавлено в базу знаний. Бот начнёт использовать это в ответах."

────────────────────────────────────────
GLOBAL RULES

1. Always communicate in a short, clear, human way.
2. ONE QUESTION AT A TIME. Never bulk ask.
3. Every message should end with a clear prompt for the user, or a confirmation of success.
4. If you execute a tool, your next text should just be "Готово. [Short summary of what was done]".
`;
      // End of MASTER_PROMPT 
      // Tools available to the LLM Console
      const tools = [
        {
          type: "function",
          function: {
            name: "create_bot",
            description: "Creates a new chatbot for the user.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Name of the bot" },
                goal: { type: "string", description: "Primary goal or purpose of the bot" }
              },
              required: ["name", "goal"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "update_bot_rules",
            description: "Updates the system prompt / behavior rules for the primary bot.",
            parameters: {
              type: "object",
              properties: {
                rulesText: { type: "string", description: "The complete new system prompt instructions determining how the bot should act." }
              },
              required: ["rulesText"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "add_knowledge",
            description: "Adds raw text information to the bot's knowledge base.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "A short title for this knowledge chunk" },
                content: { type: "string", description: "The actual knowledge text content" }
              },
              required: ["title", "content"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "fetch_webpage",
            description: "Fetches the text content of a public webpage and saves it to the bot's knowledge base. ALWAYS use this when the user provides a URL to add to KB — never use add_knowledge with a raw URL as content.",
            parameters: {
              type: "object",
              properties: {
                url: { type: "string", description: "The full public URL to fetch (must start with https://)" },
                title: { type: "string", description: "Short descriptive title for this knowledge entry" }
              },
              required: ["url", "title"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "connect_telegram",
            description: "Saves a Telegram bot token to connect the user's bot to Telegram.",
            parameters: {
              type: "object",
              properties: {
                token: { type: "string", description: "The Telegram Bot API token provided by BotFather" }
              },
              required: ["token"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "get_analytics_summary",
            description: "Retrieves a summary of how many chats and messages the bot has processed.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "set_mode_admin",
            description: "Switch to 'admin' mode to create, configure and manage bots.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "set_mode_preview",
            description: "Switch to 'preview' mode to talk to the active bot as a regular user, without administrative capabilities.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "set_mode_inbox",
            description: "Switch to 'inbox' mode to view chat analytics and human handover.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "update_business_profile",
            description: "Updates the user's business profile with extracted information like industry, offer, pricing, etc.",
            parameters: {
              type: "object",
              properties: {
                industry: { type: "string", description: "The general industry (e.g. e-commerce, services, education, restaurant)" },
                business_type: { type: "string", description: "Specific type of business" },
                offer: { type: "string", description: "What the business sells or offers" },
                geo: { type: "string", description: "City or region of operation" },
                working_hours: { type: "string", description: "Operating hours" },
                pricing_model: { type: "string", description: "How pricing works (fixed, starting from, price-list)" },
                delivery_or_service_flow: { type: "string", description: "How the service or delivery is performed" },
                payment_methods: { type: "string", description: "Accepted payment methods" },
                contacts: { type: "string", description: "Phone, address, social media links" }
              }
            }
          }
        },
        {
          type: "function",
          function: {
            name: "set_welcome_message",
            description: "Sets the welcome text that the bot immediately sends when a user presses /start.",
            parameters: {
              type: "object",
              properties: {
                text: { type: "string", description: "The welcome message text" }
              },
              required: ["text"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "set_quick_replies",
            description: "Sets the quick reply buttons (like a menu) available to the bot's users.",
            parameters: {
              type: "object",
              properties: {
                buttons: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of button labels, e.g. ['Price', 'Delivery', 'Contacts']"
                }
              },
              required: ["buttons"]
            }
          }
        },
        {
          type: "function",
          function: {
            name: "test_scenarios",
            description: "Enters simulation mode where you roleplay as a customer to test the bot's responses.",
            parameters: { type: "object", properties: {} }
          }
        },
        {
          type: "function",
          function: {
            name: "onboard_router",
            description: "Extract onboarding fields from user message and propose next question.",
            parameters: {
              type: "object",
              properties: {
                assistant_message: { type: "string" },
                updated_state: { type: "object" },
                next_question_key: { type: "string" },
                quick_replies: { type: "array", items: { type: "string" } },
                confidence: { type: "object", description: "Confidence score (0.0 to 1.0) for each field in updated_state" }
              },
              required: ["assistant_message", "updated_state", "next_question_key"]
            }
          }
        }
      ];

      const businessProfile = currentSession.business_profile || {};
      const missingFields = Object.keys(businessProfile).filter(key => businessProfile[key] === null && key !== 'missing_fields' && key !== 'next_best_action');
      businessProfile.missing_fields = missingFields; // dynamically compute and inject

      const onboardingState = currentSession.onboarding_state || {};
      const requiredOnboardingFields = Object.keys(onboardingState).filter(key => onboardingState[key] === null || onboardingState[key] === '' || (Array.isArray(onboardingState[key]) && onboardingState[key].length === 0));

      /* ---- INCORPORATE ATTACHMENT INTO SYSTEM PROMPT / CONTEXT ----
         If the frontend provides attachment metadata (from getUploadUrl + PUT flow),
         inform the LLM about it inside the next context injection block. */
      let attachmentText = "";
      // Grab attachment from the req.body if it exists:
      const incomingAttachment = req.body.attachment || null;
      if (incomingAttachment && incomingAttachment.type === 'file') {
        const att = incomingAttachment;
        attachmentText = `\n[ACTION: User attached a file! name = "${att.name}", mimeType = "${att.mimeType}", url = "${att.downloadURL}"]\nIf you have a tool to process this file, use it.Otherwise, acknowledge receipt and explain what you will do.`;
      }

      const CONTEXT_INJECT = `
────────────────────────────────────────
CURRENT STATE(BACKEND INJECTED)
MODE: ${currentSession.mode || 'admin'}
USER_BOTS: ${JSON.stringify(userBots)}
ACTIVE_BOT: ${activeBotText}
BUSINESS_PROFILE: ${JSON.stringify(businessProfile)}
MISSING_FIELDS: ${JSON.stringify(missingFields)}
ONBOARDING_STATE: ${JSON.stringify(onboardingState)}
REQUIRED_FIELDS: ${JSON.stringify(missingFields)}
CAPABILITIES: ${JSON.stringify(capabilities || { fileUpload: true })}${attachmentText}
`;

      // The user message is already safely appended to currentSession.history by Phase A Transaction
      const fullHistory = currentSession.history;

      // Keep only last 20 messages for context limiting
      const recentHistory = fullHistory.length > 20 ? fullHistory.slice(fullHistory.length - 20) : fullHistory;

      // Convert history to OpenAI format strictly matching allowed roles
      const apiHistory = recentHistory.map(m => ({
        role: (m.role === 'bot' || m.role === 'assistant') ? 'assistant' : 'user',
        content: m.content
      }));

      // Fix: when text is empty but a file was attached, the last user entry in history is "".
      // Replace it with synthetic content FOR THE LLM ONLY — Firestore history is untouched.
      if (incomingAttachment && !message.trim() && apiHistory.length > 0) {
        const last = apiHistory[apiHistory.length - 1];
        if (last.role === 'user' && !last.content.trim()) {
          const att = incomingAttachment;
          apiHistory[apiHistory.length - 1] = {
            ...last,
            content: `Пользователь загрузил файл: "${att.name || att.fileName || 'файл'}"(${att.mimeType || 'unknown'}).Ссылка: ${att.downloadURL || att.fileUrl || ''}.Задача: добавь в базу знаний и подтверди выполнение.Если нужно — задай 1 уточняющий вопрос.`
          };
        }
      }

      const messages = [
        { role: 'system', content: MASTER_PROMPT + CONTEXT_INJECT },
        ...apiHistory
      ];

      // Call OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        tools: tools,
        tool_choice: "auto",
      });

      const responseMessage = response.choices[0].message;
      let finalReply = responseMessage.content;

      // Handle function calls
      if (responseMessage.tool_calls) {
        messages.push(responseMessage); // append AI's tool call intent

        let onboardRouterCalled = false; // track to avoid malformed second call

        for (const toolCall of responseMessage.tool_calls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);
          let toolResult = "";

          try {
            if (functionName === 'create_bot') {
              const safeName = args.name && args.name.trim() !== '' ? args.name : "New AI Assistant";
              const newBotRef = db.collection('users').doc(uid).collection('bots').doc();
              await newBotRef.set({
                name: safeName,
                goal: args.goal || "Generic Assistant",
                prompt: `You are ${safeName}, a helpful AI assistant.Your primary goal is: ${args.goal}. Be polite and concise.`,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                openaiModel: 'gpt-4o-mini' // default
              });

              // Set the newly created bot as active in session cache
              currentSession.activeBotId = newBotRef.id;

              toolResult = `Bot '${safeName}' created successfully with ID ${newBotRef.id}. I have automatically selected it as the active bot.`;
            }
            else if (functionName === 'update_bot_rules') {
              if (!currentSession.activeBotId) {
                toolResult = "Error: No active bot selected. Please create or select a bot first.";
              } else {
                await db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).set({
                  prompt: args.rulesText
                }, { merge: true });
                toolResult = "Rules updated successfully for the active bot.";
              }
            }
            else if (functionName === 'add_knowledge') {
              if (!currentSession.activeBotId) {
                toolResult = "Error: No active bot selected.";
              } else {
                const textKbRef = db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).collection("knowledge_base").doc();
                await textKbRef.set({
                  title: args.title,
                  content: args.content,
                  type: "text",
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Parallel write to unified knowledge_items for frontend UI
                await db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).collection("knowledge_items").doc(textKbRef.id).set({
                  title: args.title,
                  type: "text",
                  contentPreview: typeof args.content === 'string' ? args.content.substring(0, 120) : '',
                  status: "active",
                  createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                toolResult = "Knowledge added successfully to the active bot.";
              }
            }
            else if (functionName === 'fetch_webpage') {
              if (!currentSession.activeBotId) {
                toolResult = "Error: No active bot selected.";
              } else {
                try {
                  const _webRes = await fetch(args.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BotPanel/1.0)' },
                    signal: AbortSignal.timeout(8000)
                  });
                  const _html = await _webRes.text();
                  const _text = _html
                    .replace(/<script[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 15000);
                  if (_text.length < 50) {
                    toolResult = `Error: Could not extract meaningful text from ${args.url}. The page may require JavaScript or login.`;
                  } else {
                    const _webKbRef = db.collection("users").doc(uid)
                      .collection("bots").doc(currentSession.activeBotId)
                      .collection("knowledge_base").doc();
                    await _webKbRef.set({
                      title: args.title,
                      content: _text,
                      type: "link",
                      sourceUrl: args.url,
                      createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    toolResult = `Success. Extracted ${_text.length} characters from ${args.url} and saved to knowledge base.`;
                  }
                } catch (_e) {
                  toolResult = `Error fetching ${args.url}: ${_e.message}`;
                }
              }
            }
            else if (functionName === 'connect_telegram') {
              if (!currentSession.activeBotId) {
                toolResult = "Error: No active bot selected.";
              } else {
                try {
                  // 1. Verify token via getMe
                  const getMeRes = await fetch(`https://api.telegram.org/bot${args.token}/getMe`);
                  const getMeData = await getMeRes.json();

                  if (!getMeRes.ok || !getMeData.ok) {
                    toolResult = "Error: Token invalid. Please check the token and try again.";
                    currentSession.state = "waiting_token";
                    currentSession.assistant_expectation = { type: "telegram_connect", persistent: false };
                  } else {
                    const botInfo = getMeData.result;

                    // 2. Register webhook
                    const webhookUrl = `https://us-central1-chatbot-acd16.cloudfunctions.net/telegramWebhook?uid=${uid}&botId=${currentSession.activeBotId}`;
                    const setWhRes = await fetch(`https://api.telegram.org/bot${args.token}/setWebhook`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ url: webhookUrl }),
                    });
                    const setWhData = await setWhRes.json();

                    if (!setWhRes.ok || !setWhData.ok) {
                      toolResult = `Error: Token valid, but failed to set webhook: ${setWhData.description}`;
                      currentSession.state = "waiting_token";
                      currentSession.assistant_expectation = { type: "telegram_connect", persistent: false };
                    } else {
                      // 3. Save to Firestore
                      const tokenLast4 = args.token.slice(-4);
                      await db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).set({
                        token: args.token, // Keep for legacy
                        telegram: {
                          token_last4: tokenLast4,
                          webhookUrl: webhookUrl,
                          status: "waiting_first_update",
                          botInfo: {
                            id: botInfo.id,
                            first_name: botInfo.first_name,
                            username: botInfo.username
                          },
                          connectedAt: admin.firestore.FieldValue.serverTimestamp()
                        }
                      }, { merge: true });

                      toolResult = "Success. Token is valid, waiting for /start in Telegram.";
                      currentSession.state = "telegram_connected";
                      currentSession.assistant_expectation = { type: "post_connect_menu", persistent: false };
                      finalReply = "Бот успешно подключён к Telegram! ✅\n\nЧто делаем дальше?\n\n1) Наполнить базу знаний\n2) Задать тон общения\n3) Протестировать бота";
                      break;
                    }
                  }
                } catch (e) {
                  toolResult = `Error connecting to Telegram API: ${e.message}`;
                  currentSession.state = "waiting_token";
                  currentSession.assistant_expectation = { type: "telegram_connect", persistent: false };
                }
              }
            }
            else if (functionName === 'get_analytics_summary') {
              toolResult = "Analytic tools are still in development, but you can tell the user they have 0 chats to start.";
            }
            else if (functionName === 'set_mode_admin') {
              currentSession.mode = 'admin';
              toolResult = "Switched to admin mode.";
            }
            else if (functionName === 'set_mode_preview') {
              currentSession.mode = 'preview';
              toolResult = "Switched to preview mode.";
            }
            else if (functionName === 'set_mode_inbox') {
              currentSession.mode = 'inbox';
              toolResult = "Switched to inbox mode.";
            }
            else if (functionName === 'update_business_profile') {
              if (!currentSession.business_profile) currentSession.business_profile = {};
              for (const [key, val] of Object.entries(args)) {
                if (val !== undefined) currentSession.business_profile[key] = val;
              }
              toolResult = "Business profile updated in session memory.";
            }
            else if (functionName === 'set_welcome_message') {
              if (!currentSession.activeBotId) {
                toolResult = "Error: No active bot selected.";
              } else {
                await db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).set({
                  welcomeMessage: args.text
                }, { merge: true });
                toolResult = "Welcome message saved successfully.";
              }
            }
            else if (functionName === 'set_quick_replies') {
              if (!currentSession.activeBotId) {
                toolResult = "Error: No active bot selected.";
              } else {
                await db.collection("users").doc(uid).collection("bots").doc(currentSession.activeBotId).set({
                  quickReplies: args.buttons
                }, { merge: true });
                toolResult = "Quick replies saved successfully.";
              }
            }
            else if (functionName === 'onboard_router') {
              if (!currentSession.onboarding_state) currentSession.onboarding_state = {};
              const conf = args.confidence || {};
              for (const [key, val] of Object.entries(args.updated_state || {})) {
                // strict validation: only apply if confidence is strong
                if (val !== undefined && val !== null && (conf[key] === undefined || conf[key] >= 0.6)) {
                  currentSession.onboarding_state[key] = val;
                }
              }
              // Intercept final logic
              finalReply = args.assistant_message;
              onboardRouterCalled = true;
              if (args.quick_replies && args.quick_replies.length > 0) {
                // If quick replies are provided, append them or handle appropriately (optional UI integration)
                // For now, if the UI handles them, we will just keep them in logic, or append as text payload.
              }
              // Break out of the standard tool return loop since the LLM provided the final answer natively via this router
              break;
            }

            if (functionName !== 'onboard_router') {
              messages.push({
                tool_call_id: toolCall.id,
                role: "tool",
                name: functionName,
                content: toolResult
              });
            }

          } catch (execErr) {
            console.error("Tool execution error:", execErr);
            messages.push({
              tool_call_id: toolCall.id,
              role: "tool",
              name: functionName,
              content: "Error executing function: " + execErr.message
            });
          }
        }

        // Call OpenAI again with the function results ONLY if:
        // - reply is still empty AND
        // - onboard_router was NOT called (its tool result is never pushed — calling again = malformed messages)
        if (!finalReply) {
          if (onboardRouterCalled) {
            // onboard_router returned empty assistant_message — safe fallback, no second API call
            const _att = req.body.attachment;
            finalReply = _att
              ? "Файл получен ✅ Добавляю в базу знаний. Если нужно уточнить тему или раздел — напишите."
              : "Понял. Что нужно сделать дальше?";
            console.error("[ChatOS] empty_reply after onboard_router — used fallback", { uid, rid, action });
          } else {
            const finalResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: messages
            });
            finalReply = finalResponse.choices[0].message.content;
          }
        }
      }

      // Phase B: Transaction 2 - Append Assistant Reply & state updates
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists) return; // Should not happen
        const s = snap.data();
        const nextSeq = (s.lastSeq || 0) + 1;

        if (!finalReply) {
          const _att = req.body.attachment;
          console.error("[ChatOS] empty_reply", { uid, rid, action, hasAttachment: !!_att });
          finalReply = _att
            ? "Файл получен ✅ Добавляю в базу знаний. Если нужно уточнить тему или раздел — напишите."
            : "Готово. Уточните, что нужно сделать дальше?";
        }
        s.history.push({
          role: "assistant",
          content: finalReply,
          seq: nextSeq,
          ts: Date.now(),
          rid: rid // Same request ID maps query to response
        });

        tx.set(sessionRef, {
          history: s.history,
          lastSeq: nextSeq,
          rev: (s.rev || 0) + 1,
          mode: currentSession.mode || "admin",
          activeBotId: currentSession.activeBotId || null,
          business_profile: currentSession.business_profile || null,
          onboarding_state: currentSession.onboarding_state || null,
          state: currentSession.state || s.state || "idle",
          assistant_expectation: currentSession.assistant_expectation !== undefined ? currentSession.assistant_expectation : (s.assistant_expectation || null),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      res.status(200).json({
        reply: finalReply || "Готово. Уточните, что нужно сделать дальше?",
        assistant_expectation: currentSession.assistant_expectation !== undefined ? currentSession.assistant_expectation : null
      });

    } catch (err) {
      console.error("chatOsHandler error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

exports.uploadKnowledgeFile = onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { uid, botId, rid, fileName, mimeType, base64 } = req.body;
    if (!uid || !fileName || !base64) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const bucket = admin.storage().bucket();
      // Fallback to activeBotId if botId passed is "default"
      const finalBotId = botId === 'default' ? 'tmp' : botId;
      const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const storagePath = `users/${uid}/bots/${finalBotId}/uploads/${rid}/${safeName}`;

      const file = bucket.file(storagePath);
      const buffer = Buffer.from(base64, 'base64');

      await file.save(buffer, {
        metadata: { contentType: mimeType || 'application/octet-stream' }
      });

      // Make the file publicly accessible for simplicity in prototypes/LLM passing
      await file.makePublic();
      const fileUrl = file.publicUrl();

      return res.status(200).json({
        success: true,
        fileUrl,
        storagePath,
        fileName,
        mimeType,
        size: buffer.length
      });
    } catch (err) {
      console.error("uploadKnowledgeFile error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

exports.getUploadUrl = onRequest(
  { cors: true, timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { uid, botId, fileName, mimeType, rid } = req.body;
    if (!uid || !fileName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const bucket = admin.storage().bucket();
      const finalBotId = botId === 'default' ? 'tmp' : (botId || 'tmp');
      const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const timestampDir = Date.now().toString();
      const finalRid = rid || timestampDir;
      const storagePath = `users/${uid}/bots/${finalBotId}/uploads/${finalRid}/${safeName}`;

      const file = bucket.file(storagePath);

      // Generate a signed URL for HTTP PUT
      const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 minutes
        contentType: mimeType || 'application/octet-stream',
      });

      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(storagePath)}`;

      return res.status(200).json({
        uploadUrl,
        storagePath,
        publicUrl
      });
    } catch (err) {
      console.error("getUploadUrl error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);
