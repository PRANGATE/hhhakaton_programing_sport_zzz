/* Экран тестирования. Читает attempt из sessionStorage. */
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const TIMER_SECONDS = 30 * 60;
  const TOKEN_KEY     = 'fsp.access';
  const getToken      = () => localStorage.getItem(TOKEN_KEY) || '';

  const state = {
    attemptId: null,
    questions: [],
    idx: 0,
    answers: {},
    endsAt: null,
    ticking: null,
  };

  // ---------- API ----------
  async function api(path, opts = {}) {
    const res = await fetch('/api/v1' + path, {
      ...opts,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401) {
      localStorage.removeItem('fsp.access');
      localStorage.removeItem('fsp.refresh');
      localStorage.removeItem('fsp.user');
      sessionStorage.clear();
      location.href = '/';
      throw new Error('unauthorized');
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(body.error || 'http_error'), {
        status: res.status, body,
      });
    }
    return body;
  }

  // ---------- экран «нет заданий» ----------
  function renderNoTasks(message) {
    const wrap = $('#question');
    if (wrap) {
      wrap.innerHTML = `
        <div class="no-tasks">
          <div class="no-tasks__title">${esc(message)}</div>
          <p class="no-tasks__hint">
            Попробуйте запустить тест ещё раз. Если ошибка повторяется — сообщите администратору.
          </p>
          <div class="no-tasks__actions">
            <a class="btn-primary" href="/survey.html">← Вернуться к опросу</a>
          </div>
        </div>`;
    }

    const prev = $('#prev');
    const next = $('#next');
    if (prev) prev.disabled = true;
    if (next) {
      next.disabled = true;
      next.textContent = 'Далее →';
    }

    const timer = $('#timer');
    if (timer) {
      timer.textContent = '--:--';
      const box = timer.closest('.timer');
      if (box) box.style.display = 'none';
    }

    const progress = $('#progress');
    if (progress) progress.textContent = 'Задание недоступно';
  }

  // ---------- таймер ----------
  function startTimer() {
    state.endsAt = Date.now() + TIMER_SECONDS * 1000;
    const t = $('#timer');
    if (!t) return;

    const tick = () => {
      const left = Math.max(0, Math.floor((state.endsAt - Date.now()) / 1000));
      const m = String(Math.floor(left / 60)).padStart(2, '0');
      const s = String(left % 60).padStart(2, '0');
      t.textContent = `${m}:${s}`;
      if (left === 0) { clearInterval(state.ticking); finish(); }
    };
    tick();
    state.ticking = setInterval(tick, 1000);
  }

  // ---------- рендер вопроса ----------
  function render() {
    const q = state.questions[state.idx];
    if (!q) return;

    const progress = $('#progress');
    if (progress) {
      progress.textContent =
        `Задание ${state.idx + 1} из ${state.questions.length} · тема: ${q.topic} · сложность ${q.difficulty}/5`;
    }

    const cur  = state.answers[q.id];
    const wrap = $('#question');
    if (!wrap) return;

    if (q.kind === 'single') {
      wrap.innerHTML = `
        <p class="prompt">${esc(q.prompt).replace(/\n/g, '<br>')}</p>
        <div class="opts">${(q.options || []).map((o, i) => `
          <button type="button" class="opt ${cur && cur.choice === i ? 'is-on' : ''}" data-i="${i}">
            <b>${String.fromCharCode(65 + i)}</b> <span>${esc(o)}</span>
          </button>
        `).join('')}</div>`;
    } else if (q.kind === 'multi') {
      const chosen = new Set((cur && cur.choices) || []);
      wrap.innerHTML = `
        <p class="prompt">${esc(q.prompt).replace(/\n/g, '<br>')}</p>
        <div class="opts">${(q.options || []).map((o, i) => `
          <button type="button" class="opt ${chosen.has(i) ? 'is-on' : ''}" data-i="${i}">
            <b>${String.fromCharCode(65 + i)}</b> <span>${esc(o)}</span>
          </button>
        `).join('')}</div>`;
    } else {
      wrap.innerHTML = `
        <p class="prompt">${esc(q.prompt).replace(/\n/g, '<br>')}</p>
        <textarea id="free-text" rows="7" placeholder="Ваш ответ…">${cur ? esc(cur.text || '') : ''}</textarea>`;
    }

    wrap.querySelectorAll('.opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i);
        if (q.kind === 'single') {
          state.answers[q.id] = { choice: i };
          wrap.querySelectorAll('.opt').forEach(el => el.classList.toggle('is-on', el === btn));
        } else {
          const set = new Set((state.answers[q.id]?.choices) || []);
          set.has(i) ? set.delete(i) : set.add(i);
          state.answers[q.id] = { choices: [...set] };
          btn.classList.toggle('is-on');
        }
        refreshNav();
        sendAnswer(q).catch(console.error);
      });
    });

    const ta = wrap.querySelector('#free-text');
    if (ta) {
      ta.addEventListener('input', () => {
        state.answers[q.id] = { text: ta.value };
        refreshNav();
      });
      ta.addEventListener('blur', () => sendAnswer(q).catch(console.error));
    }

    const prev = $('#prev');
    const next = $('#next');
    if (prev) prev.disabled = state.idx === 0;
    if (next) next.disabled = !state.answers[q.id];
    refreshNav();
  }

  function refreshNav() {
    const q    = state.questions[state.idx];
    const has  = !!state.answers[q?.id];
    const next = $('#next');
    if (!next) return;
    next.disabled = !has;
    const last = state.idx === state.questions.length - 1;
    next.textContent = last ? 'Завершить' : 'Далее →';
  }

  // ---------- отправка ответа ----------
  async function sendAnswer(q) {
    const payload = state.answers[q.id];
    if (!payload) return;
    await api(`/test/${state.attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ question_id: q.id, payload }),
    });
  }

  // ---------- завершение ----------
  async function finish() {
    if (state.ticking) clearInterval(state.ticking);

    try {
      for (const q of state.questions) {
        if (state.answers[q.id]) await sendAnswer(q);
      }
      const out = await api(`/test/${state.attemptId}/finish`, { method: 'POST' });
      sessionStorage.setItem('fsp.result', JSON.stringify(out));
      window.location.href = '/testing_result.html';
    } catch (err) {
      console.error('[testing] finish failed', err);
      if (err.message === 'unauthorized') return;

      const message = err.body?.message || 'Не удалось завершить тест. Попробуйте позже.';
      renderNoTasks(message);
    }
  }

  // ---------- утилиты ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------- init ----------
  function init() {
    if (!getToken()) { window.location.href = '/'; return; }

    // 1. Пришли со страницы опроса с ошибкой — показываем сообщение в поле задания.
    const errMessage = sessionStorage.getItem('fsp.test.error');
    if (errMessage) {
      sessionStorage.removeItem('fsp.test.error');
      renderNoTasks(errMessage);
      return;
    }

    // 2. Открыли тест напрямую, без активной попытки.
    const raw = sessionStorage.getItem('fsp.attempt');
    if (!raw) {
      renderNoTasks('Сервер не выдал задание, попробуйте позже.');
      return;
    }

    let data;
    try { data = JSON.parse(raw); }
    catch {
      renderNoTasks('Сервер не выдал задание, попробуйте позже.');
      return;
    }

    if (!data?.attempt?.id || !Array.isArray(data?.questions) || data.questions.length === 0) {
      renderNoTasks('Сервер не выдал задание, попробуйте позже.');
      return;
    }

    state.attemptId = data.attempt.id;
    state.questions = data.questions;

    $('#next')?.addEventListener('click', () => {
      if (state.idx === state.questions.length - 1) finish();
      else { state.idx++; render(); }
    });
    $('#prev')?.addEventListener('click', () => {
      if (state.idx > 0) { state.idx--; render(); }
    });

    startTimer();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();