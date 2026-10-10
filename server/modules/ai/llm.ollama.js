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

// Элемент считается вопросом, только если у него есть и prompt (строка),
// и kind (строка). Это отсекает rubric[], options[], correct[] — они тоже
// массивы внутри объекта, но не вопросы.
function isQuestionShape(x) {
  return x && typeof x === 'object' && !Array.isArray(x)
    && typeof x.prompt === 'string' && x.prompt.trim().length > 0
    && typeof x.kind === 'string'   && ['single','multi','text'].includes(x.kind);
}

function toQuestionList(parsed) {
  // 1. Уже массив.
  if (Array.isArray(parsed)) {
    return parsed.filter(isQuestionShape);
  }
  if (!parsed || typeof parsed !== 'object') return [];

  // 2. Обёртка с известным ключом: {questions:[...]}, {items:[...]}, …
  for (const k of ['questions', 'items', 'tasks', 'data', 'result', 'results']) {
    const v = parsed[k];
    if (Array.isArray(v)) {
      const filtered = v.filter(isQuestionShape);
      if (filtered.length) return filtered;
    }
    // Вложенная обёртка: {result: {questions: [...]}}
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = toQuestionList(v);
      if (nested.length) return nested;
    }
  }

  // 3. Одиночный вопрос-объект. Именно этот случай у тебя и был —
  //    llama3.1 вернула один объект вместо массива.
  if (isQuestionShape(parsed)) return [parsed];

  // 4. Последний шанс: любой массив, чьи элементы похожи на вопросы.
  //    rubric/options/correct сюда уже не попадут — их строки не
  //    удовлетворяют isQuestionShape.
  for (const k of Object.keys(parsed)) {
    const v = parsed[k];
    if (Array.isArray(v)) {
      const filtered = v.filter(isQuestionShape);
      if (filtered.length) return filtered;
    }
  }

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
  return `Ты — опытный технический интервьюер. Придумай ${count} РАЗНЫХ тестовых вопроса
для проверки уровня «${targetGradeId}» по специализации «${specializationId}».

Каждый вопрос — это отдельная задача. Темы не должны повторяться.
Возьми темы из набора: язык программирования, базы данных, алгоритмы,
архитектура, сети, тестирование, безопасность, инструменты разработки.

Уровень сложности вопросов — строго «${targetGradeId}»:
- junior: базовый синтаксис, простые концепции, чтение кода
- middle: практика, типичные ошибки, отладка, проектирование небольших систем
- senior: архитектура, trade-off'ы, распределённые системы, оптимизация

Формат каждого вопроса:
- kind = "single": ровно 4 варианта ответа, ровно 1 правильный
- kind = "multi": 4–5 вариантов, 2–3 правильных
- kind = "text": свободный ответ, оценивается по рубрике из 3–5 критериев

ПРАВИЛА, которые нельзя нарушать:
1. Ответ должен быть JSON-МАССИВОМ ровно из ${count} элементов.
   Первый символ ответа — '['. Последний — ']'. Ничего до и после.
2. НЕ копируй пример ниже. Придумай свои уникальные вопросы.
3. НЕ оборачивай массив в объект вида {"questions": ...}.
4. Если не можешь придумать — верни пустой массив [].

Формат одного элемента в массиве:
{
  "topic": "короткое название темы на английском (одно слово)",
  "difficulty": 1-5,
  "kind": "single" | "multi" | "text",
  "prompt": "текст вопроса на русском",
  "options": ["вариант 1", "вариант 2", "вариант 3", "вариант 4"],
  "correct": 0,
  "rubric": ["критерий 1", "критерий 2"]
}

Для kind="single": "correct" — это число (индекс правильного варианта).
Для kind="multi": "correct" — это массив чисел, например [0, 2].
Для kind="text": "options" и "correct" не нужны, а "rubric" обязателен.

ПРИМЕР реального вопроса (НЕ КОПИРУЙ этот текст, сделай свои):
{
  "topic": "databases",
  "difficulty": 2,
  "kind": "single",
  "prompt": "Какой тип JOIN вернёт все строки из левой таблицы, даже если в правой нет совпадений?",
  "options": ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN"],
  "correct": 1
}

Теперь придумай ${count} СВОИХ вопросов и верни их массивом.`;
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
      // Ollama отвечает — этого достаточно. Наличие модели проверим
      // отдельно, чтобы не ронять health на время pull'а.
      return true;
    } catch (err) {
      console.warn(`[llm.ollama] health: fetch failed ${probeUrl}: ${err.message}`);
      return false;
    }
  },
  // Подробный статус для /api/v1/ai/status и логов.
  async checkStatus() {
    const start = Date.now();
    try {
      const res = await fetch(`${URL}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      const elapsedMs = Date.now() - start;
      if (!res.ok) {
        return { reachable: false, httpStatus: res.status, elapsedMs };
      }
      const data = await res.json().catch(() => ({}));
      const models = (data?.models || []).map(m => m.name);
      const hasModel = models.some(n => n === MODEL || n.startsWith(MODEL + ':'));
      return {
        reachable: true,
        httpStatus: 200,
        elapsedMs,
        modelRequested: MODEL,
        modelAvailable: hasModel,
        modelsCount: models.length,
        modelsSample: models.slice(0, 5),
      };
    } catch (err) {
      return { reachable: false, error: err.message, elapsedMs: Date.now() - start };
    }
  },

    async generateQuestions({ specializationId, targetGradeId, count = 5 }) {
    const system = buildGenSystem({ specializationId, targetGradeId, count });
    const user = JSON.stringify({
      specialization: specializationId,
      grade: targetGradeId,
      count,
    });

    // Две попытки: сначала "послушная" температура, потом чуть выше.
    const ATTEMPTS = [
      { temperature: TEMP },
      { temperature: Math.min(1.0, TEMP + 0.2) },
    ];

    let lastErr;
    for (const { temperature } of ATTEMPTS) {
      try {
        const raw = await callChat({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          // format: 'json' — НЕ передаём, иначе llama3.1:8b вырождается
          temperature,
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
          console.warn('[llm.ollama] parsed type:',
            Array.isArray(parsed) ? 'array' : typeof parsed);
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
          console.warn('[llm.ollama] raw response (first 1500):', String(raw).slice(0, 1500));
          console.warn('[llm.ollama] parsed list length:', list.length);
          console.warn('[llm.ollama] normalized count:', normalized.length);
          console.warn('[llm.ollama] per-item status:',
            list.map((q, i) => {
              try { normalizeQuestion(q); return `#${i}:ok`; }
              catch (e) { return `#${i}:${e.message}`; }
            }).join(' | ')
          );
          throw new Error(`too_few_valid_questions: ${normalized.length}`);
        }

        return normalized.slice(0, count);
      } catch (err) {
        lastErr = err;
        console.warn(
          `[llm.ollama] generate attempt failed at temp=${temperature}:`,
          err.message
        );
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