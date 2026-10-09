// server/modules/ai/llm.ollama.js
//
// Провайдер LLM поверх Ollama. Говорит как с локальной Ollama,
// так и с HTTP-фасадом туннеля на VPS (OLLAMA_URL настраивается через env).
//
// Контракт с ai.service.js:
//   - health(): Promise<boolean>
//   - generateQuestions({ specializationId, targetGradeId, count, userId })
//       → [{ topic, difficulty, kind, prompt, options, correct, rubric }]
//   - evaluateAnswer({ question, payload })
//       → { score, breakdown, feedback }

const URL       = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL     = process.env.LLM_MODEL  || 'llama3.1:8b';
const TIMEOUT   = Number(process.env.LLM_TIMEOUT_MS || 60000);
const RETRIES   = Number(process.env.LLM_JSON_RETRIES || 1);
const TEMP      = Number(process.env.LLM_TEMPERATURE || 0.7);

// ---------- низкоуровневый вызов ----------

async function callChat({ messages, format, temperature = TEMP }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: false,
        format,                 // 'json' → Ollama гарантирует валидный JSON
        options: { temperature },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`ollama http ${res.status}: ${t.slice(0, 300)}`);
    }

    const data = await res.json();
    return data?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

// ---------- парсер JSON из ответа LLM ----------
// Модель может вернуть:
//   • чистый JSON-массив
//   • объект { questions: [...] }
//   • JSON в ```json ... ``` блоках
//   • JSON с префиксом/суффиксом текста
// Устойчиво вытаскиваем первую валидную структуру.

function extractJson(text) {
  if (!text) throw new Error('empty_llm_output');
  let s = String(text).trim();

  // снять markdown-обёртку ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  // найти первый { или [
  const first = (() => {
    const a = s.indexOf('[');
    const o = s.indexOf('{');
    if (a === -1 && o === -1) return -1;
    if (a === -1) return o;
    if (o === -1) return a;
    return Math.min(a, o);
  })();
  if (first > 0) s = s.slice(first);

  // обрезать по парной скобке (учитывая строки и экранирование)
  const open  = s[0];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inStr = false;
  let esc   = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (ch === '\\') { esc = true; }
      else if (ch === '"')  { inStr = false; }
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open)  depth++;
    if (ch === close) { depth--; if (depth === 0) { s = s.slice(0, i + 1); break; } }
  }

  return JSON.parse(s);
}

// ---------- нормализация распарсенного ответа в массив ----------
// Ollama с format:'json' иногда возвращает:
//   • [{...}, {...}]              — массив (идеал)
//   • { questions: [{...}] }      — объект с ключом
//   • { tasks: [...] }            — другой частый ключ
//   • { topic, prompt, ... }      — один вопрос как объект
//   • {}                          — модель не справилась
//
// Возвращаем всегда массив (возможно пустой).

function toQuestionList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];

  // Частые ключи-обёртки
  for (const k of ['questions', 'items', 'tasks', 'data', 'result', 'results']) {
    if (Array.isArray(parsed[k])) return parsed[k];
  }

  // Любой массив-значение с непустой длиной
  for (const k of Object.keys(parsed)) {
    if (Array.isArray(parsed[k]) && parsed[k].length) return parsed[k];
  }

  // Единственный объект, похожий на вопрос
  if (typeof parsed.prompt === 'string' && parsed.kind) return [parsed];

  return [];
}

// ---------- нормализация одного задания ----------
// Приводим «сырой» ответ модели к форме, которую ждёт
// test.repo.persistGeneratedQuestions.

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('bad_question_shape');

  const kind = ['single', 'multi', 'text'].includes(raw.kind) ? raw.kind : 'single';
  const difficulty = Math.max(1, Math.min(5, Math.round(Number(raw.difficulty)) || 2));
  const topic = String(raw.topic || 'general').slice(0, 60);
  const prompt = String(raw.prompt || '').trim();
  if (!prompt) throw new Error('empty_question_prompt');

  let options = null;
  let correct = null;
  let rubric  = null;

  if (kind === 'single' || kind === 'multi') {
    const rawOpts = Array.isArray(raw.options) ? raw.options : [];
    options = rawOpts
      .map(o => (o && typeof o === 'object' ? (o.text || o.value || '') : o))
      .map(o => String(o).trim())
      .filter(Boolean);

    if (options.length < 2) throw new Error('too_few_options');
    if (options.length > 6) options.length = 6;

    if (kind === 'single') {
      let c = raw.correct;
      if (c && typeof c === 'object') {
        c = (c.index != null) ? c.index
          : (c.correct != null) ? c.correct
          : 0;
      }
      c = Number(c);
      correct = Number.isInteger(c) && c >= 0 && c < options.length ? c : 0;
    } else {
      let arr = raw.correct;
      if (arr && typeof arr === 'object' && !Array.isArray(arr)) {
        arr = (arr.indices != null) ? arr.indices
          : (arr.correct != null) ? arr.correct
          : [];
      }
      arr = Array.isArray(arr) ? arr : [];
      correct = arr
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= 0 && n < options.length);
      if (!correct.length) correct = [0];
      correct = Array.from(new Set(correct)).sort((a, b) => a - b);
    }
  } else {
    let r = raw.rubric;
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      r = (r.criteria != null) ? r.criteria : [];
    }
    rubric = Array.isArray(r) ? r.map(String).map(s => s.trim()).filter(Boolean) : [];
    if (rubric.length < 2) rubric = ['Корректность', 'Полнота', 'Обоснованность'];
  }

  return { topic, difficulty, kind, prompt, options, correct, rubric };
}

// ---------- промпт генерации ----------

function buildGenSystem({ specializationId, targetGradeId, count }) {
  return `Ты — эксперт по найму IT-специалистов. Сгенерируй ${count} тестовых задания
для проверки уровня «${targetGradeId}» по специализации «${specializationId}».

Требования к заданиям:
- Темы разные (language, db, algorithms, architecture, network, testing, ...).
- Сложность: целое 1..5, соответствует уровню «${targetGradeId}».
- Тип задания: "single" (4 варианта, 1 верный), "multi" (4–5 вариантов, 2–3 верных),
  либо "text" (свободный ответ с рубрикой 3–5 критериев).
- Задания не должны повторять друг друга.

Отвечай СТРОГО валидным JSON-массивом без markdown, без пояснений.
Каждый элемент:
{
  "topic": "string",
  "difficulty": 1|2|3|4|5,
  "kind": "single" | "multi" | "text",
  "prompt": "текст задания",
  "options": ["A","B","C","D"],
  "correct": 0,
  "rubric": ["критерий 1","критерий 2"]
}

Правила по полям:
- "options" и "correct" — только для kind=single/multi.
- для single: "correct" — индекс верного варианта (число).
- для multi: "correct" — массив индексов верных вариантов.
- для text: "rubric" — массив критериев оценки.

ВАЖНО ПРО ФОРМАТ ОТВЕТА:
- Ответ должен начинаться символом '[' и заканчиваться символом ']'.
- Ответ — МАССИВ из ровно ${count} объектов, а не один объект.
- НЕ оборачивай в {"questions": [...]}, {"items": [...]} или другой объект.
- Если не можешь выполнить — верни пустой массив [].
- Первый символ ответа — '[', последний — ']'.`;
}

// ---------- сам провайдер ----------

export default {
  name: 'ollama',

  async health() {
    const probeUrl = `${URL}/api/tags`;
    const timeoutMs = Math.min(TIMEOUT, 5000);
    try {
      const res = await fetch(probeUrl, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        console.warn(`[llm.ollama] health: HTTP ${res.status} ${probeUrl}`);
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const models = (data?.models || []).map(m => m.name);
      const found = models.some(n => n === MODEL || n.startsWith(MODEL + ':'));
      if (!found) {
        console.warn(`[llm.ollama] health: model "${MODEL}" not found in ${models.length} models`);
        console.warn(`[llm.ollama]   models: ${models.slice(0, 10).join(', ')}${models.length > 10 ? ', …' : ''}`);
      }
      return found;
    } catch (err) {
      console.warn(`[llm.ollama] health: fetch failed ${probeUrl}: ${err.message}`);
      return false;
    }
  },

  async generateQuestions({ specializationId, targetGradeId, count = 5 }) {
    const system = buildGenSystem({ specializationId, targetGradeId, count });
    const user = JSON.stringify({
      specialization: specializationId,
      grade: targetGradeId,
      count,
    });

    let lastErr;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const raw = await callChat({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          format: 'json',
          temperature: TEMP,
        });

        let parsed;
        try {
          parsed = extractJson(raw);
        } catch (err) {
          console.warn(`[llm.ollama] JSON parse failed: ${err.message}`);
          console.warn('[llm.ollama] raw response:', String(raw).slice(0, 800));
          throw new Error('bad_json: ' + err.message);
        }

        const list = toQuestionList(parsed);
        if (!list.length) {
          console.warn('[llm.ollama] raw response:', String(raw).slice(0, 800));
          console.warn('[llm.ollama] parsed type:', Array.isArray(parsed) ? 'array' : typeof parsed);
          console.warn('[llm.ollama] parsed keys:', parsed && typeof parsed === 'object'
            ? Object.keys(parsed).join(', ')
            : String(parsed));
          throw new Error('empty_questions_array');
        }

        const normalized = [];
        for (const q of list) {
          try {
            normalized.push(normalizeQuestion(q));
          } catch (e) {
            console.warn('[llm.ollama] skip bad question:', e.message);
          }
          if (normalized.length >= count) break;
        }

        if (normalized.length < Math.min(3, count)) {
          throw new Error(`too_few_valid_questions: ${normalized.length}`);
        }

        return normalized.slice(0, count);
      } catch (err) {
        lastErr = err;
        console.warn(`[llm.ollama] generate attempt ${attempt + 1} failed:`, err.message);
      }
    }

    const e = new Error('llm_generation_failed: ' + (lastErr?.message || 'unknown'));
    e.code = 'LLM_UNAVAILABLE';
    throw e;
  },

  async evaluateAnswer({ question, payload }) {
    if (!question) throw new Error('no_question');
    const rubric = Array.isArray(question.rubric) ? question.rubric : [];

    // Берём первое не-null значение. Без смешивания || и ?? в одном выражении —
    // это SyntaxError в JavaScript.
    const answer = (payload?.text != null) ? payload.text
      : (payload?.choice != null) ? payload.choice
      : (payload?.choices != null) ? payload.choices
      : payload;

    const system = `Ты — эксперт-ревьюер. Оцени ответ кандидата по фиксированной рубрике.
Рубрика: ${JSON.stringify(rubric)}
Правила:
- score: целое 0..100.
- Каждый критерий оцени отдельно, дай короткое обоснование.
- feedback — одно-два предложения, конструктивно.
Верни СТРОГО JSON:
{ "score": 0-100, "breakdown": [{"criterion":"...","score":0-100,"note":"..."}], "feedback":"..." }`;

    const user = JSON.stringify({
      task: question.prompt,
      answer,
    });

    const raw = await callChat({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      format: 'json',
      temperature: 0.2,
    });

    const data = extractJson(raw);
    const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
    return {
      score,
      breakdown: Array.isArray(data.breakdown) ? data.breakdown : [],
      feedback: String(data.feedback || '').slice(0, 500),
    };
  },
};