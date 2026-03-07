const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
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
function scoreRelevance(question, item, questionEmbedding = null) {
  let textScore = 0;
  const q = question.toLowerCase();
  const text = ((item.title || "") + " " + (item.content || item.answer || "")).toLowerCase();
  const words = q.split(/\s+/).filter((w) => w.length > 2);

  if (words.length > 0) {
    let matchCount = 0;
    for (const w of words) {
      if (text.includes(w)) matchCount++;
      // Bonus for title match
      if ((item.title || item.question || "").toLowerCase().includes(w)) matchCount++;
    }
    textScore = matchCount / words.length;
  }

  let semanticScore = 0;
  if (questionEmbedding && item.embedding && Array.isArray(item.embedding) && item.embedding.length > 0) {
    semanticScore = cosineSimilarity(questionEmbedding, item.embedding);
  }

  // Combine scores: Semantic search is usually more accurate if available
  // If no semantic score, rely on text score.
  if (semanticScore > 0) {
    // 0.3 text, 0.7 semantic as a heuristic
    return (textScore * 0.3) + (semanticScore * 0.7);
  }
  return textScore;
}

// ─── Shared: build system prompt (without question) ───────────────────────────
function buildSystem(question, kbItems, rules, questionEmbedding = null) {
  const MAX_ITEM_CHARS = 1200;
  const TOP_K = 15;
  const all = kbItems.filter((i) => (i.title || i.question) && (i.content || i.answer));

  const scored = all
    .map((i) => ({ item: i, score: scoreRelevance(question, i, questionEmbedding) }))
    .sort((a, b) => b.score - a.score);

  // Threshold 0.25: requires meaningful semantic overlap to count as a KB match
  const hasMatch = scored.length > 0 && scored[0].score > 0.25;
  const relevant = hasMatch
    ? scored.filter((s) => s.score > 0.25).slice(0, TOP_K).map((s) => s.item)
    : all.slice(0, 10);

  const kbText = relevant
    .map((i) => `Q: ${String(i.title || i.question).slice(0, 200)}\nA: ${String(i.content || i.answer).slice(0, MAX_ITEM_CHARS)}`)
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
- Будь краток и по делу.`;

  const technicalRules = `\nТЕХНИЧЕСКИЕ ПРАВИЛА:
- Это продолжение диалога — НЕ здоровайся повторно если уже поздоровался.
- Если ниже есть раздел "База знаний" — ВСЕГДА используй его содержимое. Адаптируй информацию из базы знаний под свой стиль, не копируй дословно.
- НИКОГДА не говори пользователю "этого нет в базе", "не нашёл в базе", "базада yo'q" и подобные фразы — просто дай ответ.
- Если информации нет в базе знаний — отвечай из общих знаний без комментариев об отсутствии в базе.
- Не выдумывай цены и конкретные условия которых нет в базе.
- Будь краток и по делу.`;

  // If user set custom instructions — they are the main prompt, not an addition
  const system = rules.trim()
    ? `${rules.trim()}${technicalRules}`
    : core;

  return kbText ? `${system}\n\nБаза знаний:\n${kbText}` : system;
}

// Keep old name as alias for Q&A generation
function buildPrompt(question, kbItems, rules, questionEmbedding = null) {
  return buildSystem(question, kbItems, rules, questionEmbedding) + `\n\nВопрос: ${question}`;
}

// ── Uzbek/general text normalizer for Trainer matching ────────────────────
function normalizeText(text, dictionary) {
  if (!text) return '';
  let n = text.toLowerCase().trim()
    .replace(/[''`ʼ]/g, "'")
    .replace(/\s+/g, ' ');
  if (dictionary && dictionary.length) {
    const tokens = n.split(/\s+/);
    n = tokens.map(tok => {
      const e = dictionary.find(d => d.variant === tok);
      return e ? e.canonical : tok;
    }).join(' ');
  }
  return n;
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

// ─── Platform billing cost estimation ─────────────────────────────────────────
function estimateCost(provider, model, inputTokens, outputTokens) {
  // Prices per 1M tokens (USD, early 2026)
  const P = {
    'gpt-4o-mini':            { in: 0.15,  out: 0.60  },
    'gpt-4o':                 { in: 2.50,  out: 10.00 },
    'gpt-4-turbo':            { in: 10.00, out: 30.00 },
    'gpt-3.5-turbo':          { in: 0.50,  out: 1.50  },
    'gemini-1.5-flash':       { in: 0.075, out: 0.30  },
    'gemini-1.5-pro':         { in: 3.50,  out: 10.50 },
    'claude-haiku-4-5-20251001': { in: 0.80, out: 4.00 },
    'claude-sonnet-4-6':      { in: 3.00,  out: 15.00 },
  };
  const p = P[model] || P['gpt-4o-mini'];
  return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
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

// ─── Telegram bot token encryption helpers ─────────────────────────────────────
// We encrypt per-bot Telegram tokens at rest using AES-256-GCM with a secret key
// derived from TG_TOKEN_SECRET. Ciphertext layout: [12b IV][16b TAG][ciphertext].
const TG_TOKEN_SECRET = process.env.TG_TOKEN_SECRET || "";

function encryptToken(plain) {
  if (!plain) return "";
  if (!TG_TOKEN_SECRET) {
    throw new Error("TG_TOKEN_SECRET not set");
  }
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(TG_TOKEN_SECRET).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptToken(enc) {
  if (!enc) return "";
  if (!TG_TOKEN_SECRET) {
    throw new Error("TG_TOKEN_SECRET not set");
  }
  const raw = Buffer.from(enc, "base64");
  if (raw.length < 12 + 16) {
    throw new Error("Invalid encrypted token format");
  }
  const iv = raw.slice(0, 12);
  const tag = raw.slice(12, 28);
  const data = raw.slice(28);
  const key = crypto.createHash("sha256").update(TG_TOKEN_SECRET).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

// ─── Admin audit log (super-admin actions) ──────────────────────────────────────
async function writeAdminAuditLog(db, { performedByUid, action, targetUid = null, targetProjectId = null, payloadSummary = "" }) {
  try {
    await db.collection("adminAuditLogs").add({
      performedByUid: performedByUid || "",
      action: action || "",
      targetUid: targetUid || null,
      targetProjectId: targetProjectId || null,
      payloadSummary: String(payloadSummary || "").slice(0, 500),
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("writeAdminAuditLog failed:", e.message);
  }
}

// ─── Text normalization (clean PDF/DOCX artifacts before pipeline) ────────────
function normalizeText(raw) {
  let text = String(raw || "");
  // Remove null bytes and non-printable control chars (keep \n \r \t)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  // Collapse spaces/tabs (but preserve newlines)
  text = text.replace(/[^\S\n]+/g, " ");
  // Collapse 3+ consecutive blank lines to 2
  text = text.replace(/\n{3,}/g, "\n\n");
  // Remove common PDF artifacts
  text = text
    .replace(/Page \d+ of \d+/gi, "")
    .replace(/\[\d+\]/g, "")   // reference footnotes like [1]
    .replace(/_{3,}/g, "")     // underline rulers
    .replace(/={3,}/g, "")     // equals rulers
    .replace(/-{4,}/g, "");    // dash rulers (keep "---" as it's markdown)
  // Deduplicate repeated paragraphs (headers/footers repeat in PDFs)
  const paragraphs = text.split("\n\n");
  const seen = new Set();
  const unique = paragraphs.filter(p => {
    const key = p.trim().toLowerCase();
    if (seen.has(key) || key.length < 3) return false;
    seen.add(key);
    return true;
  });
  return unique.join("\n\n").trim();
}

// ─── Mode decision: Q&A generation vs raw chunk storage ──────────────────────
// Q&A mode: structured content with 50–10000 words (headers/bullets detected)
// Chunk mode: very short, very long, or unstructured plain text
function decideMode(text) {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 50 || wordCount > 10000) return "chunks";
  // Detect structural markers: markdown headers, numbered lists, bullet points
  const hasStructure = /^#{1,3}\s|^\d+\.\s|^[-*•]\s/m.test(text);
  return hasStructure ? "qa" : "chunks";
}

// ─── Embeddings & RAG helpers ────────────────────────────────────────────────
async function getEmbedding(text, provider = "openai") {
  // Currently, we only support OpenAI for embeddings, as Claude/Gemini have varying embedding APIs.
  // We default to text-embedding-3-small.
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set for embeddings");

  const resp = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: text.trim().slice(0, 8000), // Max input limit safety
      model: "text-embedding-3-small"
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.error?.message || `OpenAI Embeddings API failed (${resp.status})`);
  }
  return data.data?.[0]?.embedding || [];
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateQAFromChunk(chunk, provider, model) {
  const prompt = `Ты — эксперт по созданию баз знаний.Из текста ниже извлеки вопросы и ответы так, как их задали бы реальные клиенты или пользователи.

      ПРАВИЛА:
      1. Генерируй 4 - 8 пар вопрос - ответ на русском языке.
2. Ответы должны быть ПОЛНЫМИ и ДЕТАЛЬНЫМИ — включай все цифры, примеры, детали, условия, перечисления из текста.
3. НЕ сокращай и НЕ упрощай ответы — передавай максимум информации из текста.
4. Вопросы формулируй так, как спросил бы реальный человек(не академически).
5. Если в тексте есть примеры, числа, проценты, названия — обязательно включай их в ответ.
6. Один вопрос = один конкретный аспект темы.
7. Верни ТОЛЬКО валидный JSON массив без лишнего текста.

      Формат: [{ "question": "...", "answer": "...", "topic": "..." }]

Текст:
      ${chunk}

JSON: `;
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
          res.status(401).json({ ok: false, error: "Invalid API key" });
          return;
        }
        res.json({ ok: true });
        return;
      }

      if (provider === "gemini") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
        if (!r.ok) {
          res.status(401).json({ ok: false, error: "Invalid API key" });
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
      res.status(500).json({ ok: false, error: "Verification failed" });
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
        res.status(401).json({ ok: false, error: "Invalid Telegram token" });
        return;
      }
      res.json({ ok: true, result: data.result });
    } catch (err) {
      res.status(500).json({ ok: false, error: "Telegram verification failed" });
    }
  }
);

// ─── logClientEvent — централизованный приём клиентских ошибок/метрик ─────────
exports.logClientEvent = onRequest(
  { cors: true, timeoutSeconds: 15 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    let uid = null;
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (_) { /* optional auth */ }
    }

    const body = req.body || {};
    const userId = body.userId || uid || null;
    const level = String(body.level || "error").slice(0, 20);
    const event_type = String(body.event_type || "client_error").slice(0, 80);
    const message = String(body.message || "").slice(0, 2000);
    const stack = body.stack != null ? String(body.stack).slice(0, 3000) : null;
    const projectId = body.projectId != null ? String(body.projectId).slice(0, 128) : null;
    const extra = body.extra != null && typeof body.extra === "object"
      ? JSON.stringify(body.extra).slice(0, 1000)
      : null;

    const db = admin.firestore();
    const doc = {
      level,
      event_type,
      message,
      stack,
      userId,
      projectId,
      extra,
      url: body.url != null ? String(body.url).slice(0, 512) : null,
      buildVersion: body.buildVersion != null ? String(body.buildVersion).slice(0, 32) : null,
      ts: admin.firestore.FieldValue.serverTimestamp(),
    };

    try {
      if (userId) {
        await db.collection(`users/${userId}/client_events`).add(doc);
      } else {
        await db.collection("public_client_events").add(doc);
      }
      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("logClientEvent error:", err.message);
      res.status(500).json({ error: "Log failed" });
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

          let embedding = [];
          try {
            embedding = await getEmbedding(`Question: ${qa.question}\nAnswer: ${qa.answer}`);
          } catch (e) { /* ignore */ }

          batch.set(ref, {
            sourceId,
            question: qa.question || "",
            answer: qa.answer || "",
            topic: qa.topic || title || "",
            tags: [],
            semanticKey: qa.semanticKey,
            status: "active",
            embedding: embedding,
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
        const botData2 = botDoc2.exists ? botDoc2.data() || {} : {};
        const botToken2 = botData2.encryptedToken
          ? decryptToken(botData2.encryptedToken)
          : (botData2.token || null);
        const flowsDoc = await db.doc(`users/${uid}/settings/flows`).get();
        const flows = flowsDoc.exists ? (flowsDoc.data().flows || []) : [];
        const flow = flows.find(f => f.id === flowId);
        const btn = flow?.buttons?.find(b => b.id === btnId);
        if (btn && botToken2) {
          await fetch(`https://api.telegram.org/bot${botToken2}/answerCallbackQuery`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: cbq.id })
            });
          const replyText = btn.reply === '__ESCALATE__' ? 'Соединяю с менеджером...' : btn.reply;
          await fetch(`https://api.telegram.org/bot${botToken2}/sendMessage`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: cbChatId, text: replyText })
            });
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
        const botData3 = botDoc3.exists ? botDoc3.data() || {} : {};
        const botToken3 = botData3.encryptedToken
          ? decryptToken(botData3.encryptedToken)
          : (botData3.token || null);
        if (botToken3) {
          await fetch(`https://api.telegram.org/bot${botToken3}/answerCallbackQuery`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ callback_query_id: cbq.id })
            });
          await fetch(`https://api.telegram.org/bot${botToken3}/sendMessage`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: cbChatId, text: 'Передаю вопрос оператору. Он ответит в ближайшее время. ✅' })
            });
        }
        await db.doc(`users/${uid}/chats/${cbChatId}`)
          .set({ mode: 'human', handoffAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await db.doc(`users/${uid}/chatSessions/${cbChatId}`)
          .set({ fallbackCount: 0 }, { merge: true }).catch(() => { });
        // Notify owner
        const notifSnap = await db.doc(`users/${uid}/settings/notifications`).get();
        const ownerCid = notifSnap.exists ? (notifSnap.data().ownerChatId || '') : '';
        if (ownerCid && botToken3) {
          fetch(`https://api.telegram.org/bot${botToken3}/sendMessage`,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: ownerCid, text: `🆘 Пользователь запросил оператора!\nChat ID: ${cbChatId}` })
            }).catch(() => { });
        }
        res.status(200).end(); return;
      }

      if (data.startsWith('provider:') && cbChatId) {
        const chosenProvider = data.replace('provider:', '');
        const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
        const botData = botDoc.exists ? botDoc.data() || {} : {};
        const botToken = botData.encryptedToken
          ? decryptToken(botData.encryptedToken)
          : (botData.token || null);

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
      const botData = botDoc.exists ? botDoc.data() || {} : {};
      const botToken = botData.encryptedToken
        ? decryptToken(botData.encryptedToken)
        : (botData.token || null);
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
      const botData = botDoc.data() || {};
      const botToken = botData.encryptedToken
        ? decryptToken(botData.encryptedToken)
        : (botData.token || null);
      if (!botToken) { res.status(200).end(); return; }

      // ── Project lookup: find project linked to this bot (cached 2 min) ────────
      const _projKey = `proj:${uid}:${botId}`;
      let _projectId = _mcGet(_projKey);
      let _projectInstructions = _mcGet(`${_projKey}:inst`);
      let _projectBehavior = _mcGet(`${_projKey}:behavior`);
      let _projectLogic = _mcGet(`${_projKey}:logic`);
      if (_projectId === null) {
        const projSnap = await db.collection(`users/${uid}/projects`)
          .where("telegramBotId", "==", botId).limit(1).get();
        _projectId = projSnap.empty ? "" : projSnap.docs[0].id;
        const projData = projSnap.empty ? {} : (projSnap.docs[0].data() || {});
        _projectInstructions = projData.instructions || "";
        _projectBehavior = projData.behavior || {};
        _projectLogic = projData.logic || {};
        _mcSet(_projKey, _projectId, 120000);
        _mcSet(`${_projKey}:inst`, _projectInstructions, 120000);
        _mcSet(`${_projKey}:behavior`, _projectBehavior, 120000);
        _mcSet(`${_projKey}:logic`, _projectLogic, 120000);
      }

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
        planDoc.ref.set({ ...planData, createdAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => { });
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

      // ── pauseOnAdminReply: if admin replied recently, skip AI ─────────────────
      if (_projectLogic && _projectLogic.pauseOnAdminReply) {
        const pausedUntil = chatData.humanPausedUntil;
        const pausedUntilMs = pausedUntil
          ? (typeof pausedUntil.toMillis === 'function' ? pausedUntil.toMillis() : Number(pausedUntil) * 1000)
          : 0;
        if (pausedUntilMs > Date.now()) {
          await chatDocRef.set({
            chatId, name: chatName, username: chatUsername, botId,
            lastMessage: question.slice(0, 100), lastTs: admin.firestore.FieldValue.serverTimestamp(),
            _ts: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          res.status(200).end(); return;
        }
      }

      // ── KB + settings with 60-second in-memory cache (warm instances) ──────────
      const detectedLang = detectLang(question);
      const _kbCacheKey = `kb:${uid}:${botId || "_"}:${detectedLang}`;
      const _settCacheKey = `sett:${uid}:${botId || "_"}`;
      let kbItems = _mcGet(_kbCacheKey);
      let _cachedSett = _mcGet(_settCacheKey);

      if (kbItems === null || _cachedSett === null) {
        const _botRules = botId ? (botData.rules || botData.prompt || "") : "";
        const rulesPromise = botId
          ? Promise.resolve({ exists: !!_botRules, data: () => ({ text: _botRules }) })
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
            let botKbItems = primaryKbSnap.docs
              .map(d => ({ ...d.data(), _id: d.id }))
              .filter(_langFilter)
              .map(d => ({ title: d.title || d.question || d.name || "", content: d.content || d.answer || d.text || "", embedding: d.embedding || [], _id: d._id }))
              .filter(k => k.content.trim().length > 0);
            // Always merge with kbQA (project sources pipeline — admin UI sources end up here)
            const kbQaSnap = await db.collection(`users/${uid}/kbQA`).where("status", "==", "active").limit(200).get();
            if (kbQaSnap.size > 0) {
              const kbQaItems = kbQaSnap.docs
                .map(d => ({ ...d.data(), _id: d.id }))
                .filter(_langFilter)
                .map(d => ({ title: d.question || "", content: d.answer || "", embedding: d.embedding || [], _id: d._id }))
                .filter(k => k.content.trim().length > 0);
              const existingIds = new Set(botKbItems.map(i => i._id));
              botKbItems = [...botKbItems, ...kbQaItems.filter(i => !existingIds.has(i._id))];
            }
            kbItems = botKbItems;
          } else if (primaryKbSnap.size > 0) {
            kbItems = primaryKbSnap.docs
              .map(d => ({ ...d.data(), _id: d.id }))
              .filter(_langFilter)
              .map(d => ({ title: d.question || "", content: d.answer || "", embedding: d.embedding || [], _id: d._id }));
          } else {
            // Fallback to legacy kbItems only if kbQA is empty
            const legacySnap = await db.collection(`users/${uid}/kbItems`).limit(200).get();
            kbItems = legacySnap.docs
              .map(d => ({ ...d.data(), _id: d.id }))
              .filter(_langFilter)
              .map(d => ({ title: d.title || "", content: d.content || "", embedding: d.embedding || [], _id: d._id }));
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
      // Project instructions override global rules
      if (_projectInstructions) rules = _projectInstructions;

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
            chatDocRef.set({
              chatId, name: chatName, username: chatUsername, botId,
              lastMessage: question.slice(0, 100), lastTs: admin.firestore.FieldValue.serverTimestamp(),
              _ts: admin.firestore.FieldValue.serverTimestamp(), mode: 'ai'
            }, { merge: true }).catch(() => { });
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

      // ── delayBeforeReply: wait N seconds to batch rapid messages ─────────────
      if (_projectLogic && _projectLogic.delayBeforeReply) {
        const delaySec = Math.min(Number(_projectLogic.delaySeconds) || 3, 30);
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }

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

      // Generate embedding for the incoming question to perform RAG semantic search
      let qEmbedding = null;
      if (kbItems.length > 0) {
        try {
          qEmbedding = await getEmbedding(question);
        } catch (e) {
          console.warn("Could not generate question embedding for RAG:", e.message);
        }
      }

      // Fallback detection: check if KB has any matching content
      const kbScores = kbItems.map(i => scoreRelevance(question, i, qEmbedding));
      const maxKbScore = kbScores.length > 0 ? Math.max(...kbScores) : 0;
      // KB match requires score > 0.25 — weak coincidental overlaps (0.1–0.25) don't count
      const noKbMatch = maxKbScore < 0.25 && kbItems.length > 0;
      const sessionData = sessionDoc.exists ? sessionDoc.data() : {};
      const fallbackCount = sessionData.fallbackCount || 0;

      // ── Direct KB answer: strong match (≥0.5) → return stored answer, skip OpenAI ──
      if (maxKbScore >= 0.5 && kbItems.length > 0) {
        const topIdx = kbScores.indexOf(maxKbScore);
        const topItem = kbItems[topIdx];
        if (topItem && topItem.content && topItem.content.trim().length > 0) {
          clearInterval(typingInterval);
          const directTgText = topItem.content.trim()
            .replace(/\*\*(.+?)\*\*/gs, '$1')
            .replace(/\*(.+?)\*/gs, '$1')
            .replace(/__(.+?)__/gs, '$1')
            .replace(/_([^_]+?)_/gs, '$1')
            .replace(/#{1,6}\s/g, '');
          const newHistoryDirect = [...allMessages,
            { role: "user", content: question },
            { role: "assistant", content: topItem.content }
          ].slice(-100);
          await Promise.all([
            fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: chatId, text: directTgText }),
            }),
            historyRef.set({ messages: newHistoryDirect, updatedAt: admin.firestore.FieldValue.serverTimestamp() }),
            chatDocRef.set({
              chatId, name: chatName, username: chatUsername, botId,
              lastMessage: question.slice(0, 100),
              lastTs: admin.firestore.FieldValue.serverTimestamp(),
              _ts: admin.firestore.FieldValue.serverTimestamp(),
              mode: 'ai', msgCount: newMsgCount,
            }, { merge: true }),
            topItem._id
              ? db.doc(`users/${uid}/kbQA/${topItem._id}`).update({ asked: admin.firestore.FieldValue.increment(1) }).catch(() => {})
              : Promise.resolve(),
          ]).catch(() => {});
          console.log(`[tgWebhook] directKB uid=${uid} score=${maxKbScore.toFixed(2)} q="${question.slice(0, 60)}"`);
          res.status(200).end(); return;
        }
      }

      // Explicit operator request detection
      const operatorKeywords = /оператор|оператора|живой человек|живого человека|менеджер|менеджера|поддержка|support|human|operator|manager/i;
      const userWantsOperator = operatorKeywords.test(question);
      if (userWantsOperator) {
        await chatDocRef.set({ mode: 'human', handoffAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: 'Передаю ваш вопрос оператору. Он ответит в ближайшее время. ✅' }),
        });
        if (ownerChatId) {
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ownerChatId, text: `🆘 Пользователь запросил оператора!\nВопрос: ${question.slice(0, 200)}\nChat ID: ${chatId}` }),
          }).catch(() => { });
        }
        clearInterval(typingInterval);
        res.status(200).end(); return;
      }

      const recentMessages = allMessages.slice(-20);
      const system = buildSystem(question, kbItems, rules, qEmbedding);
      const systemWithMemory = historySummary
        ? `${system}\n\nКраткое резюме предыдущего диалога:\n${historySummary}`
        : system;
      const messages = [...recentMessages, { role: "user", content: question }];
      const resolvedModel = model || (provider === 'openai' ? 'gpt-4o-mini' : provider === 'gemini' ? 'gemini-1.5-flash' : 'claude-haiku-4-5-20251001');
      console.log(`[tgWebhook] uid=${uid} botId=${botId} provider=${provider} model=${resolvedModel} kbItems=${kbItems.length} q="${question.slice(0, 60)}"`);
      let aiResult;
      const t0 = Date.now();
      try {
        aiResult = await callAI(provider, resolvedModel, systemWithMemory, messages);
      } catch (aiErr) {
        clearInterval(typingInterval);
        console.error(`[tgWebhook] AI call failed uid=${uid}: ${aiErr.message}`);
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: '⚠️ Не удалось получить ответ. Попробуйте чуть позже.' }),
        }).catch(() => {});
        res.status(200).end(); return;
      } finally {
        clearInterval(typingInterval);
      }
      const latencyMs = Date.now() - t0;
      const answer = aiResult.text;
      const inputTokens = aiResult.inputTokens;
      const outputTokens = aiResult.outputTokens;

      // Increment `asked` counter on top matching kbQA items
      // topMatches: only items with genuine KB relevance (score > 0.25)
      // If no item clears this threshold → question goes to unanswered regardless of AI fallback answer
      const topMatches = kbItems
        .map((i) => ({ item: i, score: scoreRelevance(question, i, qEmbedding) }))
        .filter((s) => s.score > 0.25)
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
            .then(r => historyRef.set({ summary: r.text, summaryUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => { }))
            .catch(() => { });
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

      // No automatic fallback — AI answers from its knowledge if KB has no match

      // suggestButtons disabled — bot responds with text only

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

      // If no KB match → save to unanswered + trainer collections
      const noKbMatchNow = topMatches.length === 0;
      const unansweredWrite = noKbMatchNow
        ? db.collection(`users/${uid}/unanswered`).add({
          text: question.slice(0, 300),
          aiAnswer: answer.slice(0, 2000),
          chatId,
          chatName,
          botId,
          _ts: admin.firestore.FieldValue.serverTimestamp(),
        }).then(async (unansweredRef) => {
          // Save to trainer_unanswered
          const normQ = normalizeText(question, []);
          const tUnRef = await db.collection(`users/${uid}/trainer_unanswered`).add({
            projectId: _projectId || '',
            userQuestion: question.slice(0, 500),
            normalizedQuestion: normQ.slice(0, 500),
            originalLanguage: detectedLang,
            source: 'telegram',
            chatId,
            botId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            kbMatchFound: false,
            fallbackUsed: true,
            openaiResponseId: null,
          });
          // Save OpenAI response to trainer_openai_responses
          await db.collection(`users/${uid}/trainer_openai_responses`).add({
            projectId: _projectId || '',
            question: question.slice(0, 500),
            normalizedQuestion: normQ.slice(0, 500),
            openaiAnswer: answer.slice(0, 3000),
            model: resolvedModel,
            provider,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            linkedUnansweredId: tUnRef.id,
          }).then(r => tUnRef.update({ openaiResponseId: r.id }).catch(() => {})).catch(() => {});
        }).catch(() => { })
        : Promise.resolve();

      const _costUSD = estimateCost(provider, resolvedModel, inputTokens, outputTokens);
      const _today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

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
          costUSD: _costUSD,
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
        // Platform-level billing tracker (super admin analytics)
        db.doc(`_platform/billing/daily/${_today}`).set({
          date: _today,
          inputTokens: admin.firestore.FieldValue.increment(inputTokens),
          outputTokens: admin.firestore.FieldValue.increment(outputTokens),
          requests: admin.firestore.FieldValue.increment(1),
          costUSD: admin.firestore.FieldValue.increment(_costUSD),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
        db.doc(`_platform/billing/totals/all`).set({
          totalInputTokens: admin.firestore.FieldValue.increment(inputTokens),
          totalOutputTokens: admin.firestore.FieldValue.increment(outputTokens),
          totalRequests: admin.firestore.FieldValue.increment(1),
          totalCostUSD: admin.firestore.FieldValue.increment(_costUSD),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true }),
      ]).catch(err => console.warn("Non-critical logging failed:", err));

      // ── Save to project_chats so chats appear in Projects UI ──────────────────
      if (_projectId) {
        const pcRef = db.doc(`users/${uid}/project_chats/${chatId}`);
        const pcSnap = await pcRef.get();
        const isNewProjectChat = !pcSnap.exists;
        const searchTokens = [...new Set(
          (chatName + " " + (chatUsername || "")).toLowerCase().split(/\s+/).filter(Boolean)
        )];
        await pcRef.set({
          chatId, projectId: _projectId, ownerId: uid,
          name: chatName, username: chatUsername, botId,
          lastMessage: question.slice(0, 100),
          lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMessageAtMs: Date.now(),
          searchTokens,
          ...(isNewProjectChat ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        const msgCol = pcRef.collection("messages");
        await msgCol.add({ role: "user", text: question, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        await msgCol.add({ role: "assistant", text: answer, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        if (isNewProjectChat) {
          db.doc(`users/${uid}/projects/${_projectId}`).set(
            { chatsCount: admin.firestore.FieldValue.increment(1), updatedAt: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
          ).catch(() => {});
        }
      }

    } catch (err) {
      console.error(`[tgWebhook] UNHANDLED ERROR uid=${uid} botId=${botId}:`, err.message || err);
    }

    res.status(200).end();
  }
);

// ─── getAIBillingStats — super admin: AI cost dashboard ──────────────────────
exports.getAIBillingStats = onRequest(
  { cors: true, timeoutSeconds: 30 },
  async (req, res) => {
    // Auth: only authenticated users (caller verified on client side by UID check)
    const db = admin.firestore();

    try {
      // 1. Read last 30 days from _platform/billing/daily
      const today = new Date();
      const days = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().slice(0, 10));
      }

      const dailySnaps = await Promise.all(
        days.map(date => db.doc(`_platform/billing/daily/${date}`).get())
      );

      const dailyBreakdown = dailySnaps.map((snap, i) => ({
        date: days[i],
        requests: snap.exists ? (snap.data().requests || 0) : 0,
        inputTokens: snap.exists ? (snap.data().inputTokens || 0) : 0,
        outputTokens: snap.exists ? (snap.data().outputTokens || 0) : 0,
        costUSD: snap.exists ? (snap.data().costUSD || 0) : 0,
      }));

      // 2. Totals from _platform/billing/totals/all
      const totalsSnap = await db.doc(`_platform/billing/totals/all`).get();
      const totals = totalsSnap.exists ? totalsSnap.data() : {};

      // 3. Compute derived metrics
      const todayKey = today.toISOString().slice(0, 10);
      const todayData = dailyBreakdown.find(d => d.date === todayKey) || { costUSD: 0, requests: 0 };
      const last30Cost = dailyBreakdown.reduce((s, d) => s + d.costUSD, 0);
      const activeDays = dailyBreakdown.filter(d => d.costUSD > 0).length || 1;
      const avgDailyCost = last30Cost / activeDays;

      // 4. Try to get OpenAI balance via legacy billing API
      let openaiBalance = null;
      let openaiMonthUsed = null;
      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey) {
          const startDate = new Date(); startDate.setDate(1);
          const endDate = new Date(); endDate.setDate(endDate.getDate() + 1);
          const fmt = d => d.toISOString().slice(0, 10);
          const usageRes = await fetch(
            `https://api.openai.com/v1/dashboard/billing/usage?start_date=${fmt(startDate)}&end_date=${fmt(endDate)}`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );
          if (usageRes.ok) {
            const usageData = await usageRes.json();
            // total_usage is in USD * 100 (cents)
            openaiMonthUsed = (usageData.total_usage || 0) / 100;
          }
          const subsRes = await fetch(
            `https://api.openai.com/v1/dashboard/billing/subscription`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );
          if (subsRes.ok) {
            const subsData = await subsRes.json();
            if (subsData.hard_limit_usd) {
              openaiBalance = subsData.hard_limit_usd - (openaiMonthUsed || 0);
            }
          }
        }
      } catch (_) { /* billing API unavailable */ }

      res.json({
        ok: true,
        todaySpent: todayData.costUSD,
        todayRequests: todayData.requests,
        last30DaysSpent: last30Cost,
        totalSpent: totals.totalCostUSD || 0,
        totalRequests: totals.totalRequests || 0,
        avgDailyCost,
        estimatedDaysRemaining: openaiBalance && avgDailyCost > 0
          ? Math.floor(openaiBalance / avgDailyCost)
          : null,
        openaiBalance,
        openaiMonthUsed,
        dailyBreakdown,
      });
    } catch (err) {
      console.error('[getAIBillingStats]', err.message);
      res.status(500).json({ ok: false, error: err.message });
    }
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
    // Auth: require Firebase ID token and derive uid from it
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const uid = decoded.uid;
    const { botId, remove } = req.body || {};
    if (!botId) {
      res.status(400).json({ error: "botId required" });
      return;
    }

    const db = admin.firestore();
    const botDoc = await db.doc(`users/${uid}/bots/${botId}`).get();
    if (!botDoc.exists) {
      res.status(404).json({ error: "Bot not found" });
      return;
    }

    const botData = botDoc.data() || {};
    const botToken = botData.encryptedToken
      ? decryptToken(botData.encryptedToken)
      : (botData.token || null);
    if (!botToken) {
      res.status(400).json({ error: "Bot token not set" });
      return;
    }

    const webhookUrl = remove
      ? ""
      : `https://us-central1-chatbot-acd16.cloudfunctions.net/telegramWebhook?uid=${uid}&botId=${botId}`;

    const r = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
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
    telegramConnected: !!d.telegramConnected,
    telegramUsername: d.telegramUsername || "",
    telegramBotId: d.telegramBotId || "",
    createdAt: _asIso(d.createdAt),
    updatedAt: _asIso(d.updatedAt),
    behavior: d.behavior || {},
    logic: d.logic || {},
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
          const { name, botHost, instructions, behavior, logic } = req.body || {};
          const upd = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          if (name !== undefined) upd.name = String(name).trim();
          if (botHost !== undefined) upd.botHost = String(botHost).trim();
          if (instructions !== undefined) upd.instructions = String(instructions);
          if (behavior !== null && typeof behavior === 'object') upd.behavior = behavior;
          if (logic !== null && typeof logic === 'object') upd.logic = logic;
          await ref.set(upd, { merge: true });
          // Invalidate project cache so webhook picks up new settings
          _memCache.forEach((_, k) => { if (k.startsWith('proj:')) _memCache.delete(k); });
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
            // Auto-heal: client already extracted text, but status was wrongly set to "pending"
            const hasContent = String(s.contentRef || "").trim().length > 0;
            const effectiveStatus = (s.status === "pending" && hasContent) ? "ready" : (s.status || "pending");
            if (s.status === "pending" && hasContent) {
              d.ref.update({ status: "ready", updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => { });
            }
            return {
              id: d.id,
              projectId: s.projectId,
              type: s.type || "text",
              title: s.title || "",
              contentRef: s.contentRef || "",
              status: effectiveStatus,
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
              const hasContent = String(s.contentRef || "").trim().length > 0;
              const effectiveStatus = (s.status === "pending" && hasContent) ? "ready" : (s.status || "pending");
              if (s.status === "pending" && hasContent) {
                d.ref.update({ status: "ready", updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => { });
              }
              return {
                id: d.id,
                projectId: s.projectId,
                type: s.type || "text",
                title: s.title || "",
                contentRef: s.contentRef || "",
                status: effectiveStatus,
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
          const MAX_CONTENT_CHARS = 400000; // keep well below Firestore document size limits
          const contentFull = String(contentRef).trim();
          const contentTrimmed = contentFull.length > MAX_CONTENT_CHARS
            ? contentFull.slice(0, MAX_CONTENT_CHARS)
            : contentFull;
          const wasTruncated = contentTrimmed.length < contentFull.length;
          // URL sources are ready immediately; file/text/document types go through KB pipeline
          const hasContent = contentTrimmed.length > 0;
          const status = !hasContent ? "pending" : (String(type) === "url" ? "ready" : "processing");
          const ref = db.collection(`users/${uid}/project_sources`).doc();
          await ref.set({
            projectId,
            ownerId: uid,
            type: String(type),
            title: String(title).trim(),
            contentRef: contentTrimmed,
            contentTruncated: wasTruncated,
            searchTokens: _tokenizeSearchText(`${title} ${contentTrimmed.slice(0, 20000)}`),
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

      // GET /sources/:id — status polling
      const gsId = path.match(/^sources\/([^/]+)$/);
      if (gsId && req.method === "GET") {
        const id = decodeURIComponent(gsId[1]);
        const ref = db.doc(`users/${uid}/project_sources/${id}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Source not found" }); return; }
        const s = snap.data() || {};
        res.json({
          ok: true, source: {
            id: snap.id, projectId: s.projectId, type: s.type, title: s.title,
            contentRef: s.contentRef, status: s.status, kbQaCount: s.kbQaCount || 0,
            errorMessage: s.errorMessage || null,
            createdAt: _asIso(s.createdAt), updatedAt: _asIso(s.updatedAt),
          }
        });
        return;
      }

      // POST /sources/:id/reprocess — retry failed sources
      const rpId = path.match(/^sources\/([^/]+)\/reprocess$/);
      if (rpId && req.method === "POST") {
        const id = decodeURIComponent(rpId[1]);
        const ref = db.doc(`users/${uid}/project_sources/${id}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Source not found" }); return; }
        const d = snap.data() || {};
        if (d.type === "url") { res.status(400).json({ error: "URL sources do not need reprocessing" }); return; }
        const text = String(d.contentRef || "").trim();
        if (!text) { res.status(400).json({ error: "No content to process" }); return; }
        // Reset to "processing" — onDocumentWritten trigger will pick it up
        await ref.update({ status: "processing", errorMessage: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        res.json({ ok: true, message: "Reprocessing started" });
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

      // ──────────────────────────────────────────────────────────────────────
      // TRAINER API
      // ──────────────────────────────────────────────────────────────────────

      // GET /trainer/unanswered
      if (req.method === "GET" && path === "trainer/unanswered") {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const snap = await db.collection(`users/${uid}/trainer_unanswered`)
          .orderBy("createdAt", "desc").limit(limit).get();
        res.json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: _asIso(d.data().createdAt) })) });
        return;
      }

      // POST /trainer/unanswered/:id/action  (action: resolve|ignore|draft)
      const tuAct = path.match(/^trainer\/unanswered\/([^/]+)\/action$/);
      if (tuAct && req.method === "POST") {
        const { action, answer: ans, canonicalQuestion } = req.body || {};
        const ref = db.doc(`users/${uid}/trainer_unanswered/${tuAct[1]}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
        const d = snap.data();
        if (action === "ignore") {
          await ref.update({ status: "ignored", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else if (action === "resolve") {
          await ref.update({ status: "resolved", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else if (action === "draft" && ans) {
          const draftRef = await db.collection(`users/${uid}/trainer_drafts`).add({
            projectId: d.projectId || '',
            canonicalQuestion: canonicalQuestion || d.userQuestion,
            normalizedQuestion: d.normalizedQuestion || normalizeText(d.userQuestion, []),
            answer: String(ans).slice(0, 5000),
            sourceType: "unanswered",
            linkedUnansweredId: tuAct[1],
            language: d.originalLanguage || 'ru',
            tags: [],
            status: "draft",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await ref.update({ status: "resolved", draftId: draftRef.id, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          res.status(400).json({ error: "Invalid action" }); return;
        }
        res.json({ ok: true });
        return;
      }

      // GET /trainer/openai-responses
      if (req.method === "GET" && path === "trainer/openai-responses") {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const snap = await db.collection(`users/${uid}/trainer_openai_responses`)
          .orderBy("createdAt", "desc").limit(limit).get();
        res.json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: _asIso(d.data().createdAt) })) });
        return;
      }

      // POST /trainer/openai-responses/:id/action  (action: approve|reject|draft)
      const toAct = path.match(/^trainer\/openai-responses\/([^/]+)\/action$/);
      if (toAct && req.method === "POST") {
        const { action, answer: editedAns, canonicalQuestion } = req.body || {};
        const ref = db.doc(`users/${uid}/trainer_openai_responses/${toAct[1]}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
        const d = snap.data();
        if (action === "reject") {
          await ref.update({ status: "rejected", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else if (action === "draft") {
          const finalAns = editedAns || d.openaiAnswer;
          await db.collection(`users/${uid}/trainer_drafts`).add({
            projectId: d.projectId || '',
            canonicalQuestion: canonicalQuestion || d.question,
            normalizedQuestion: d.normalizedQuestion || normalizeText(d.question, []),
            answer: String(finalAns).slice(0, 5000),
            sourceType: "openai",
            linkedOpenaiId: toAct[1],
            language: 'auto',
            tags: [],
            status: "draft",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          await ref.update({ status: "approved", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else {
          res.status(400).json({ error: "Invalid action" }); return;
        }
        res.json({ ok: true });
        return;
      }

      // GET /trainer/drafts
      if (req.method === "GET" && path === "trainer/drafts") {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const snap = await db.collection(`users/${uid}/trainer_drafts`)
          .orderBy("createdAt", "desc").limit(limit).get();
        res.json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: _asIso(d.data().createdAt) })) });
        return;
      }

      // POST /trainer/drafts  (manual create)
      if (req.method === "POST" && path === "trainer/drafts") {
        const { projectId, canonicalQuestion, answer: ans, language = 'ru', tags = [] } = req.body || {};
        if (!canonicalQuestion || !ans) { res.status(400).json({ error: "canonicalQuestion and answer required" }); return; }
        const ref = await db.collection(`users/${uid}/trainer_drafts`).add({
          projectId: projectId || '',
          canonicalQuestion: String(canonicalQuestion).slice(0, 500),
          normalizedQuestion: normalizeText(canonicalQuestion, []).slice(0, 500),
          answer: String(ans).slice(0, 5000),
          sourceType: "manual",
          language,
          tags: Array.isArray(tags) ? tags : [],
          status: "draft",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(201).json({ ok: true, id: ref.id });
        return;
      }

      // PATCH /trainer/drafts/:id
      const tdPatch = path.match(/^trainer\/drafts\/([^/]+)$/);
      if (tdPatch && req.method === "PATCH") {
        const { canonicalQuestion, answer: ans, language, tags } = req.body || {};
        const upd = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (canonicalQuestion !== undefined) {
          upd.canonicalQuestion = String(canonicalQuestion).slice(0, 500);
          upd.normalizedQuestion = normalizeText(canonicalQuestion, []).slice(0, 500);
        }
        if (ans !== undefined) upd.answer = String(ans).slice(0, 5000);
        if (language !== undefined) upd.language = language;
        if (Array.isArray(tags)) upd.tags = tags;
        await db.doc(`users/${uid}/trainer_drafts/${tdPatch[1]}`).set(upd, { merge: true });
        res.json({ ok: true });
        return;
      }

      // DELETE /trainer/drafts/:id
      const tdDel = path.match(/^trainer\/drafts\/([^/]+)$/);
      if (tdDel && req.method === "DELETE") {
        await db.doc(`users/${uid}/trainer_drafts/${tdDel[1]}`).delete();
        res.json({ ok: true });
        return;
      }

      // POST /trainer/drafts/:id/approve  → move to kbQA
      const tdApprove = path.match(/^trainer\/drafts\/([^/]+)\/approve$/);
      if (tdApprove && req.method === "POST") {
        const ref = db.doc(`users/${uid}/trainer_drafts/${tdApprove[1]}`);
        const snap = await ref.get();
        if (!snap.exists) { res.status(404).json({ error: "Not found" }); return; }
        const d = snap.data();
        // Check for duplicate in kbQA
        const dupeSnap = await db.collection(`users/${uid}/kbQA`)
          .where("question", "==", d.canonicalQuestion).limit(1).get();
        if (!dupeSnap.empty) {
          res.status(409).json({ ok: false, error: "Duplicate question already in Knowledge Base" }); return;
        }
        const kbRef = await db.collection(`users/${uid}/kbQA`).add({
          question: d.canonicalQuestion,
          answer: d.answer,
          normalizedQuestion: d.normalizedQuestion || normalizeText(d.canonicalQuestion, []),
          tags: d.tags || [],
          language: d.language || 'ru',
          source: 'trainer',
          projectId: d.projectId || '',
          status: 'approved',
          usageCount: 0,
          asked: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await ref.update({ status: "approved", kbId: kbRef.id, approvedAt: admin.firestore.FieldValue.serverTimestamp() });
        res.json({ ok: true, kbId: kbRef.id });
        return;
      }

      // GET /trainer/dictionary
      if (req.method === "GET" && path === "trainer/dictionary") {
        const snap = await db.collection(`users/${uid}/trainer_dictionary`)
          .orderBy("createdAt", "desc").limit(500).get();
        res.json({ ok: true, items: snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: _asIso(d.data().createdAt) })) });
        return;
      }

      // POST /trainer/dictionary
      if (req.method === "POST" && path === "trainer/dictionary") {
        const { canonical, variant, type = "synonym", language = "uz" } = req.body || {};
        if (!canonical || !variant) { res.status(400).json({ error: "canonical and variant required" }); return; }
        const ref = await db.collection(`users/${uid}/trainer_dictionary`).add({
          canonical: String(canonical).toLowerCase().trim(),
          variant: String(variant).toLowerCase().trim(),
          type,
          language,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        res.status(201).json({ ok: true, id: ref.id });
        return;
      }

      // PATCH /trainer/dictionary/:id
      const tdictPatch = path.match(/^trainer\/dictionary\/([^/]+)$/);
      if (tdictPatch && req.method === "PATCH") {
        const { canonical, variant, type, language } = req.body || {};
        const upd = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        if (canonical) upd.canonical = String(canonical).toLowerCase().trim();
        if (variant) upd.variant = String(variant).toLowerCase().trim();
        if (type) upd.type = type;
        if (language) upd.language = language;
        await db.doc(`users/${uid}/trainer_dictionary/${tdictPatch[1]}`).set(upd, { merge: true });
        res.json({ ok: true });
        return;
      }

      // DELETE /trainer/dictionary/:id
      const tdictDel = path.match(/^trainer\/dictionary\/([^/]+)$/);
      if (tdictDel && req.method === "DELETE") {
        await db.doc(`users/${uid}/trainer_dictionary/${tdictDel[1]}`).delete();
        res.json({ ok: true });
        return;
      }

      // ── GET /trainer/knowledge — all kbQA items for this user ──
      if (req.method === "GET" && path === "trainer/knowledge") {
        const snap = await db.collection(`users/${uid}/kbQA`)
          .orderBy("createdAt", "desc").limit(300).get();
        const items = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.()?.toISOString?.() || null }));
        res.json({ ok: true, items });
        return;
      }

      // ── DELETE /trainer/knowledge/:id ──
      const tkDel = path.match(/^trainer\/knowledge\/([^/]+)$/);
      if (req.method === "DELETE" && tkDel) {
        await db.doc(`users/${uid}/kbQA/${tkDel[1]}`).delete();
        res.json({ ok: true });
        return;
      }

      // ── POST /tahrirchi ──
      if (req.method === "POST" && path === "tahrirchi") {
        const { text, source_lang, target_lang, model } = req.body || {};
        if (!text || !source_lang || !target_lang || !model) {
          res.status(400).json({ error: "Missing fields" }); return;
        }
        const tahrResp = await fetch("https://websocket.tahrirchi.uz/translate-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "th_22abfcfd-74a5-4031-9f6b-0b2590f26bbc" },
          body: JSON.stringify({ text, source_lang, target_lang, model }),
        });
        const tahrData = await tahrResp.json();
        res.json(tahrData);
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
    const botData = botDoc.data() || {};
    const botToken = botData.encryptedToken
      ? decryptToken(botData.encryptedToken)
      : (botData.token || null);
    if (!botToken) { res.status(400).json({ error: "Bot token missing" }); return; }

    // Load project behavior settings for this bot
    const projSnap = await db.collection(`users/${uid}/projects`)
      .where("telegramBotId", "==", botId).limit(1).get();
    const projData = projSnap.empty ? {} : (projSnap.docs[0].data() || {});
    const projBehavior = projData.behavior || {};

    // Send via Telegram
    const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!tgResp.ok) {
      res.status(500).json({ error: "Telegram error" });
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    // Pause AI for 30 min after admin reply (checked by telegramWebhook if pauseOnAdminReply enabled)
    const humanPausedUntil = new admin.firestore.Timestamp(Math.floor(Date.now() / 1000) + 30 * 60, 0);

    // Append to chat history
    const historyRef = db.doc(`users/${uid}/chatHistory/${chatId}`);
    const histSnap = await historyRef.get();
    const hist = histSnap.exists ? (histSnap.data().messages || []) : [];
    const newHist = [
      ...hist,
      { role: "assistant", content: text, sentByAdmin: true },
    ].slice(-20);

    // learnFromReplies: save last user question + admin reply as KB entry
    let kbWrite = Promise.resolve();
    if (projBehavior.learnFromReplies) {
      const lastUserMsg = hist.filter(m => m.role === 'user' && !m.sentByAdmin).slice(-1)[0];
      if (lastUserMsg) {
        kbWrite = db.collection(`users/${uid}/kbQA`).add({
          question: lastUserMsg.content.slice(0, 500),
          answer: text.slice(0, 2000),
          status: 'active',
          source: 'admin_reply',
          botId, chatId,
          embedding: [],
          _ts: now,
        }).catch(() => {});
      }
    }

    await Promise.all([
      historyRef.set({ messages: newHist, updatedAt: now }),
      db.doc(`users/${uid}/chats/${chatId}`).set({
        mode: "human",
        handoffAt: now,
        humanPausedUntil,
        lastMessage: `[Оператор]: ${text.slice(0, 80)}`,
        lastTs: now,
      }, { merge: true }),
      kbWrite,
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
    const botData = botDoc.data() || {};
    const botToken = botData.encryptedToken
      ? decryptToken(botData.encryptedToken)
      : (botData.token || null);
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
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    let callerUid;
    try {
      const decoded = await admin.auth().verifyIdToken(idToken);
      callerUid = decoded.uid;
    } catch (_) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    try {
      if (adminUsersCache && Date.now() - adminUsersCacheTime < CACHE_TTL) {
        await writeAdminAuditLog(admin.firestore(), { performedByUid: callerUid, action: "list_all_users", payloadSummary: "cached" });
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
      await writeAdminAuditLog(db, { performedByUid: callerUid, action: "list_all_users", payloadSummary: "total=" + users.length });
      res.json({ users, total: users.length, cached: false });
    } catch (err) {
      console.error("getAdminUsers error:", err);
      res.status(500).json({ error: "Server error" });
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

// ─── Firestore trigger: project_sources → kbQA pipeline ──────────────────────
exports.activatePromo = onRequest({ cors: true, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const idToken = (req.headers.authorization || "").replace("Bearer ", "");
  if (!idToken) return res.status(401).json({ error: "Unauthorized" });

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const code = (req.body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Code required" });

  const db = admin.firestore();
  const promoRef = db.collection("promoCodes").doc(code);

  try {
    const result = await db.runTransaction(async (tx) => {
      const promoSnap = await tx.get(promoRef);
      if (!promoSnap.exists) throw Object.assign(new Error("Промокод не найден"), { code: "not_found" });
      const pd = promoSnap.data();
      if (!pd.active) throw Object.assign(new Error("Промокод неактивен"), { code: "inactive" });
      if ((pd.usedCount || 0) >= (pd.maxUses || 9999)) throw Object.assign(new Error("Промокод исчерпан"), { code: "exhausted" });
      const usedBy = pd.usedBy || [];
      if (usedBy.includes(uid)) throw Object.assign(new Error("Вы уже использовали этот промокод"), { code: "already_used" });

      const planRef = db.doc(`users/${uid}/settings/plan`);
      const planSnap = await tx.get(planRef);
      const planData = planSnap.exists ? planSnap.data() : {};

      let bonus = {};
      if (pd.type === "requests") {
        bonus = { monthlyLimit: (planData.monthlyLimit || 0) + pd.value };
      } else if (pd.type === "upgrade_pro") {
        const days = pd.value || 30;
        const paidUntil = admin.firestore.Timestamp.fromDate(new Date(Date.now() + days * 86400000));
        bonus = { type: "pro", monthlyLimit: 20000, paidUntil };
      } else {
        throw Object.assign(new Error("Неизвестный тип промокода"), { code: "unknown_type" });
      }

      tx.set(planRef, bonus, { merge: true });
      tx.update(promoRef, {
        usedCount: admin.firestore.FieldValue.increment(1),
        usedBy: admin.firestore.FieldValue.arrayUnion(uid),
      });

      return { type: pd.type, value: pd.value };
    });

    const payloadSummary = "code=" + (code.length >= 4 ? code.slice(0, 2) + "****" + code.slice(-2) : "****");
    await writeAdminAuditLog(db, { performedByUid: uid, action: "activate_promo", targetUid: uid, payloadSummary });

    res.json({ ok: true, type: result.type, value: result.value });
  } catch (e) {
    res.status(400).json({ error: e.message || "Ошибка активации" });
  }
});

exports.processProjectSource = onDocumentWritten(
  { document: "users/{uid}/project_sources/{sourceId}", timeoutSeconds: 540, memory: "512MiB" },
  async (event) => {
    const { uid, sourceId } = event.params;
    const afterSnap = event.data && event.data.after;
    if (!afterSnap || !afterSnap.exists) return; // Deleted — nothing to do

    const after = afterSnap.data();
    const before = event.data.before && event.data.before.exists ? event.data.before.data() : null;

    // Only run pipeline when status TRANSITIONS to "processing"
    if (after.status !== "processing") return;
    if (before && before.status === "processing") return; // Already processing, skip loop

    // Skip URL sources — no text content to chunk
    if (after.type === "url") {
      await afterSnap.ref.update({ status: "ready", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    const text = String(after.contentRef || "").trim();
    if (!text || text.length < 50) {
      await afterSnap.ref.update({ status: "ready", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    const db = admin.firestore();

    try {
      // 1. Normalize text — clean PDF artifacts, dedup paragraphs
      const cleanText = normalizeText(text);
      if (cleanText.length < 50) {
        await afterSnap.ref.update({ status: "ready", kbQaCount: 0, mode: "skip", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
      }

      // 2. Decide processing mode (Q&A for structured/medium texts, chunks for large/plain)
      let mode = decideMode(cleanText);

      // 3. Determine AI provider from user settings
      const aiDoc = await db.doc(`users/${uid}/settings/ai`).get();
      const aiProviders = aiDoc.exists ? (aiDoc.data().providers || {}) : {};
      let provider = "openai";
      let model = "gpt-4o-mini";
      if (aiProviders.openai && aiProviders.openai.apiKey) {
        provider = "openai";
        model = aiProviders.openai.model || "gpt-4o-mini";
      } else if (aiProviders.gemini && aiProviders.gemini.apiKey) {
        provider = "gemini";
        model = aiProviders.gemini.model || "gemini-1.5-flash";
      } else if (aiProviders.claude && aiProviders.claude.apiKey) {
        provider = "claude";
        model = aiProviders.claude.model || "claude-haiku-4-5-20251001";
      }
      const envProviderReady = {
        openai: !!process.env.OPENAI_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        claude: !!process.env.ANTHROPIC_API_KEY,
      };
      if (!envProviderReady[provider]) {
        if (envProviderReady.openai) {
          provider = "openai";
          model = aiProviders.openai && aiProviders.openai.model ? aiProviders.openai.model : "gpt-4o-mini";
        } else if (envProviderReady.gemini) {
          provider = "gemini";
          model = aiProviders.gemini && aiProviders.gemini.model ? aiProviders.gemini.model : "gemini-1.5-flash";
        } else if (envProviderReady.claude) {
          provider = "claude";
          model = aiProviders.claude && aiProviders.claude.model ? aiProviders.claude.model : "claude-haiku-4-5-20251001";
        }
      }
      const canUseQaLlm = !!envProviderReady[provider];
      if (mode === "qa" && !canUseQaLlm) mode = "chunks";

      const chunks = chunkText(cleanText, 1500);
      if (chunks.length === 0) {
        await afterSnap.ref.update({ status: "ready", kbQaCount: 0, mode, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return;
      }

      const kbRef = db.collection(`users/${uid}/kbQA`);
      let savedCount = 0;

      async function saveChunksAsKb() {
        const sourceTitle = after.title || "Документ";
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkQuestion = `${sourceTitle} (часть ${i + 1} из ${chunks.length})`;
          const key = semanticKey(chunkQuestion, chunk);
          const existing = await kbRef.where("_key", "==", key).limit(1).get();
          if (!existing.empty) continue;

          let embedding = [];
          try {
            embedding = await getEmbedding(chunk);
          } catch (embErr) {
            console.warn(`Embedding failed chunk sourceId=${sourceId} i=${i}:`, embErr.message);
          }

          await kbRef.doc().set({
            question: chunkQuestion,
            answer: chunk,
            topic: sourceTitle,
            _key: key,
            sourceId,
            projectId: after.projectId || null,
            status: "active",
            lang: "auto",
            type: "chunk",
            embedding,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          savedCount++;
        }
      }

      if (mode === "qa") {
        // ── Q&A mode: LLM generates question-answer pairs from each chunk ─────
        for (const chunk of chunks) {
          const pairs = await generateQAFromChunk(chunk, provider, model);
          await new Promise(resolve => setTimeout(resolve, 100)); // throttle

          for (const pair of pairs) {
            if (!pair.question || !pair.answer) continue;
            const key = semanticKey(pair.question, pair.answer);
            const existing = await kbRef.where("_key", "==", key).limit(1).get();
            if (!existing.empty) continue;

            let embedding = [];
            try {
              embedding = await getEmbedding(`Question: ${pair.question}\nAnswer: ${pair.answer}`);
            } catch (embErr) {
              console.warn(`Embedding failed qa sourceId=${sourceId}:`, embErr.message);
            }

            await kbRef.doc().set({
              question: String(pair.question).trim(),
              answer: String(pair.answer).trim(),
              topic: String(pair.topic || after.title || "").trim(),
              _key: key,
              sourceId,
              projectId: after.projectId || null,
              status: "active",
              lang: "auto",
              type: "qa",
              embedding,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            savedCount++;
          }
        }
        // Fallback: if QA generation yielded nothing, still index raw chunks.
        if (savedCount === 0) {
          mode = "chunks";
          await saveChunksAsKb();
        }
      } else {
        // ── Chunk mode: store raw chunks directly with embeddings (no LLM) ───
        // Used for very large, very short, or unstructured plain text.
        await saveChunksAsKb();
      }

      await afterSnap.ref.update({
        status: "ready",
        kbQaCount: savedCount,
        mode,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`processProjectSource: uid=${uid} sourceId=${sourceId} mode=${mode} saved=${savedCount}`);
    } catch (e) {
      console.error(`processProjectSource error uid=${uid} sourceId=${sourceId}:`, e.message);
      await afterSnap.ref.update({
        status: "failed",
        errorMessage: String(e.message).slice(0, 500),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);
