/* Экран тестирования. Читает attempt из sessionStorage. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const TIMER_SECONDS = 30 * 60;

  const state = {
    attemptId: null,
    questions: [],
    idx: 0,
    answers: {},           // question_id -> payload
    endsAt: null,
    ticking: null,
  };

  async function api(path, opts = {}) {
    const res = await fetch('/api/v1' + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
    return body;
  }

  function startTimer() {
    state.endsAt = Date.now() + TIMER_SECONDS * 1000;
    const t = $('#timer');
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

  function render() {
    const q = state.questions[state.idx];
    if (!q) return;

    $('#progress').textContent = `Задание ${state.idx + 1} из ${state.questions.length} · тема: ${q.topic} · сложность ${q.difficulty}/5`;

    const cur = state.answers[q.id];
    const wrap = $('#question');

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

    $('#prev').disabled = state.idx === 0;
    $('#next').disabled = !state.answers[q.id];
    refreshNav();
  }

  function refreshNav() {
    const q = state.questions[state.idx];
    const has = !!state.answers[q?.id];
    $('#next').disabled = !has;
    const last = state.idx === state.questions.length - 1;
    $('#next').textContent = last ? 'Завершить' : 'Далее →';
  }

  async function sendAnswer(q) {
    const payload = state.answers[q.id];
    if (!payload) return;
    await api(`/test/${state.attemptId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ question_id: q.id, payload }),
    });
  }

  async function finish() {
    if (state.ticking) clearInterval(state.ticking);
    try {
      // Отправим оставшиеся ответы
      for (const q of state.questions) {
        if (state.answers[q.id]) await sendAnswer(q);
      }
      const out = await api(`/test/${state.attemptId}/finish`, { method: 'POST' });
      sessionStorage.setItem('fsp.result', JSON.stringify(out));
      window.location.href = '/testing_result.html';
    } catch (err) {
      console.error(err);
      alert('Не удалось завершить тест: ' + err.message);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function init() {
    const raw = sessionStorage.getItem('fsp.attempt');
    if (!raw) { window.location.href = '/survey.html'; return; }
    const data = JSON.parse(raw);
    state.attemptId = data.attempt.id;
    state.questions = data.questions;

    $('#next').addEventListener('click', () => {
      if (state.idx === state.questions.length - 1) finish();
      else { state.idx++; render(); }
    });
    $('#prev').addEventListener('click', () => { if (state.idx > 0) { state.idx--; render(); } });

    startTimer();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();