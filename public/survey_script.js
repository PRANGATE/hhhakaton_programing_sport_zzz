/* Экран опроса. Хранит выбранное и создаёт попытку теста. */
(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const TOKEN_KEY = 'fsp.access';
  const getToken  = () => localStorage.getItem(TOKEN_KEY) || '';

  const state = {
    industry: null,
    specialization: null,
    grade: null,
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

  // ---------- рендер опций ----------
  function renderPicks(container, items, key) {
    container.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick';
      b.dataset.id = it.id;
      b.textContent = it.name;
      if (state[key] === it.id) b.classList.add('is-on');
      b.addEventListener('click', () => {
        state[key] = it.id;
        $$('.pick', container).forEach(el => el.classList.toggle('is-on', el === b));
        refresh();
      });
      container.appendChild(b);
    });
  }

  function refresh() {
    const btn = $('#start-test');
    if (btn) btn.disabled = !(state.industry && state.specialization && state.grade);
  }

  // ---------- init ----------
  async function init() {
    if (!getToken()) { location.href = '/'; return; }

    let ind, spec, grades;
    try {
      [ind, spec, grades] = await Promise.all([
        api('/profile/industries'),
        api('/catalog/specializations'),
        api('/catalog/grades'),
      ]);
    } catch (err) {
      console.error('[survey] load catalogs failed', err);
      alert('Не удалось загрузить справочники. Обновите страницу.');
      return;
    }

    renderPicks($('#industries'),      ind.items,    'industry');
    renderPicks($('#specializations'), spec.items,   'specialization');
    renderPicks($('#grades'),          grades.items, 'grade');

    const form = $('#survey-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const btn = $('#start-test');
      if (!btn) return;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Готовим задания…';

      try {
        await api('/profile/me', {
          method: 'PATCH',
          body: JSON.stringify({
            industry_id:       state.industry,
            specialization_id: state.specialization,
            target_grade_id:   state.grade,
          }),
        });

        const out = await api('/test/start', {
          method: 'POST',
          body: JSON.stringify({
            specialization_id: state.specialization,
            target_grade_id:   state.grade,
          }),
        });

        sessionStorage.removeItem('fsp.test.error');
        sessionStorage.setItem('fsp.attempt', JSON.stringify(out));
        window.location.href = '/testing.html';
      } catch (err) {
        if (err.message === 'unauthorized') return;

        const status  = err.status;
        const code    = err.body?.error;
        const message = err.body?.message;

        // Нет заданий — показываем экран тестирования с сообщением в поле вопроса.
        if (status === 503 && (code === 'llm_unavailable' || code === 'not_enough_questions')) {
          sessionStorage.removeItem('fsp.attempt');
          sessionStorage.setItem(
            'fsp.test.error',
            message || 'Сервер не выдал задание, попробуйте позже.'
          );
          window.location.href = '/testing.html';
          return;
        }

        // Любая другая ошибка — тоже показываем на экране тестирования,
        // чтобы пользователь не видел alert.
        sessionStorage.removeItem('fsp.attempt');
        sessionStorage.setItem(
          'fsp.test.error',
          message || ('Не удалось начать тест: ' + (code || err.message))
        );
        window.location.href = '/testing.html';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();