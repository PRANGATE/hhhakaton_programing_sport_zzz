#!/usr/bin/env node
// scripts/debug-llm.js
//
// Диагностика LLM-генерации. Повторяет запрос, который делает
// server/modules/ai/llm.ollama.js, но показывает ВСЁ сырьё:
//   • health() и список моделей;
//   • системный и пользовательский промпты;
//   • полный ответ Ollama (без обрезки);
//   • длину, первые 200 байт в hex;
//   • результат парсинга на каждом шаге.
//
// Запуск (там, где доступна Ollama):
//   node scripts/debug-llm.js
//   node scripts/debug-llm.js backend middle 5
//   OLLAMA_URL=http://127.0.0.1:11434 node scripts/debug-llm.js
//
// На VPS внутри контейнера:
//   docker exec -it fsp-app node scripts/debug-llm.js
//
// С хоста VPS (если ходить в туннель, клиент должен быть подключён):
//   OLLAMA_URL=http://127.0.0.1:11434 node scripts/debug-llm.js

const URL     = process.env.OLLAMA_URL     || 'http://127.0.0.1:11434';
const MODEL   = process.env.LLM_MODEL      || 'llama3.1:8b';
const TIMEOUT = Number(process.env.LLM_TIMEOUT_MS  || 120000);
const TEMP    = Number(process.env.LLM_TEMPERATURE || 0.7);

const [,, specArg = 'backend', gradeArg = 'middle', countArg = '5'] = process.argv;
const count = Math.max(1, Math.min(10, Number(countArg) || 5));

const c = {
  info: (m) => console.log(`\x1b[36m==>\x1b[0m ${m}`),
  ok:   (m) => console.log(`\x1b[32mOK:\x1b[0m ${m}`),
  warn: (m) => console.log(`\x1b[33m!!\x1b[0m ${m}`),
  err:  (m) => console.log(`\x1b[31mERR:\x1b[0m ${m}`),
  gray: (m) => console.log(`\x1b[90m${m}\x1b[0m`),
};

function banner(title) {
  console.log('\n' + '─'.repeat(70));
  console.log('  ' + title);
  console.log('─'.repeat(70));
}

/* ---------- 1. Куда мы вообще ходим ---------- */

banner('Конфиг');
console.log('  OLLAMA_URL :', URL);
console.log('  LLM_MODEL  :', MODEL);
console.log('  TIMEOUT_MS :', TIMEOUT);
console.log('  TEMP       :', TEMP);
console.log('  spec/grade :', specArg, '/', gradeArg, '· count =', count);

/* ---------- 2. Health ---------- */

banner('Health: GET /api/tags');
try {
  const r = await fetch(`${URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
  console.log('  HTTP status :', r.status, r.statusText);
  const raw = await r.text();
  console.log('  raw длина   :', raw.length, 'байт');
  console.log('  raw (500)   :', raw.slice(0, 500));
  let data;
  try { data = JSON.parse(raw); } catch (e) {
    c.err('не JSON: ' + e.message);
  }
  if (data?.models) {
    const names = data.models.map(m => m.name);
    console.log('  моделей     :', names.length);
    names.slice(0, 20).forEach(n => console.log('    •', n));
    if (names.length > 20) console.log('    … и ещё', names.length - 20);
    const found = names.some(n => n === MODEL || n.startsWith(MODEL + ':'));
    if (found) c.ok(`модель "${MODEL}" найдена`);
    else       c.warn(`модель "${MODEL}" НЕ найдена — health() вернёт false`);
  }
} catch (e) {
  c.err('/api/tags недоступен: ' + e.message);
}

/* ---------- 3. Тот же промпт, что в llm.ollama.js ---------- */

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

const system = buildGenSystem({
  specializationId: specArg,
  targetGradeId: gradeArg,
  count,
});
const user = JSON.stringify({
  specialization: specArg,
  grade: gradeArg,
  count,
});

banner('Системный промпт');
console.log(system);
banner('User-сообщение');
console.log(user);

/* ---------- 4. Запрос ---------- */

banner('POST /api/chat');
const body = {
  model: MODEL,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ],
  stream: false,
  format: 'json',
  options: { temperature: TEMP },
};

const t0 = Date.now();
let raw = '';
let httpStatus = 0;
try {
  const r = await fetch(`${URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  httpStatus = r.status;
  raw = await r.text();
  c.info(`HTTP ${httpStatus} · ${Date.now() - t0} ms · ${raw.length} байт`);
} catch (e) {
  c.err('fetch упал: ' + e.message);
  process.exit(1);
}

/* ---------- 5. Разбор конверта Ollama ---------- */

banner('Конверт Ollama (data.message.content)');
let content = '';
try {
  const data = JSON.parse(raw);
  console.log('  ключи верхнего уровня:', Object.keys(data).join(', '));
  if (data.error) c.err('Ollama вернула error: ' + data.error);
  if (data.message) console.log('  message keys:', Object.keys(data.message).join(', '));
  content = data?.message?.content ?? '';
  console.log('  content длина :', content.length, 'байт');
} catch (e) {
  c.err('конверт не JSON: ' + e.message);
  console.log('  raw (500)  :', raw.slice(0, 500));
  process.exit(1);
}

banner('СЫРОЙ ОТВЕТ МОДЕЛИ (content)');
console.log(content);
banner('Первые 200 байт в hex (BOM / управляющие символы)');
console.log(
  Buffer.from(content.slice(0, 200), 'utf8').toString('hex')
    .replace(/(..)/g, '$1 ').trim()
);

/* ---------- 6. Повторяем extractJson из llm.ollama.js ---------- */

function extractJson(text) {
  if (!text) throw new Error('empty_llm_output');
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const first = (() => {
    const a = s.indexOf('[');
    const o = s.indexOf('{');
    if (a === -1 && o === -1) return -1;
    if (a === -1) return o;
    if (o === -1) return a;
    return Math.min(a, o);
  })();
  if (first > 0) s = s.slice(first);

  const open  = s[0];
  const close = open === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === open)  depth++;
    if (ch === close) { depth--; if (depth === 0) { s = s.slice(0, i + 1); break; } }
  }
  return JSON.parse(s);
}

banner('Шаг парсинга extractJson()');
let parsed;
try {
  parsed = extractJson(content);
  c.ok('распарсилось');
  console.log('  тип :', Array.isArray(parsed) ? 'array' : typeof parsed);
  console.log('  длина:', Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length);
  console.log('  ключи:', Array.isArray(parsed) ? '(массив)' : Object.keys(parsed).join(', '));
} catch (e) {
  c.err('extractJson упал: ' + e.message);
  c.warn('Скорее всего модель вернула текст с префиксом/суффиксом или markdown.');
  process.exit(2);
}

/* ---------- 7. Повторяем toQuestionList ---------- */

function isQuestionShape(x) {
  return x && typeof x === 'object' && !Array.isArray(x)
    && typeof x.prompt === 'string' && x.prompt.trim().length > 0
    && typeof x.kind === 'string'   && ['single','multi','text'].includes(x.kind);
}

function toQuestionList(parsed) {
  if (Array.isArray(parsed)) return parsed.filter(isQuestionShape);
  if (!parsed || typeof parsed !== 'object') return [];

  for (const k of ['questions','items','tasks','data','result','results']) {
    const v = parsed[k];
    if (Array.isArray(v)) {
      const f = v.filter(isQuestionShape);
      if (f.length) return f;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = toQuestionList(v);
      if (nested.length) return nested;
    }
  }

  if (isQuestionShape(parsed)) return [parsed];

  for (const k of Object.keys(parsed)) {
    const v = parsed[k];
    if (Array.isArray(v)) {
      const f = v.filter(isQuestionShape);
      if (f.length) return f;
    }
  }
  return [];
}

banner('Шаг toQuestionList()');
const list = toQuestionList(parsed);
c.info(`получено кандидатов в вопросы: ${list.length}`);
if (list.length === 0) {
  c.err('toQuestionList вернул пустой список — вот что было в parsed:');
  console.log(JSON.stringify(parsed, null, 2).slice(0, 2000));
  process.exit(3);
}

/* ---------- 8. Нормализация ---------- */

banner('Первый элемент сырья');
console.log(JSON.stringify(list[0], null, 2));

banner('Итог');
console.log(`  HTTP         : ${httpStatus}`);
console.log(`  content, байт: ${content.length}`);
console.log(`  parsed       : ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
console.log(`  вопросов     : ${list.length}`);

if (list.length >= 3) {
  c.ok('Похоже, LLM работает корректно.');
  c.gray('Если при этом основной сервис всё равно падает — дело не в парсере.');
  c.gray('Проверь LLM_PROVIDER и LLM_MODE у fsp-app:');
  c.gray('  docker exec fsp-app printenv | grep -E "LLM_|OLLAMA_URL"');
} else {
  c.warn('Меньше 3 заданий — test.service уйдёт в fallback на пул.');
}