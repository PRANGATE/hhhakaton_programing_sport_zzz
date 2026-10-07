/* Экран опроса. Хранит выбранное и создаёт попытку теста. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = {
    industry: null,
    specialization: null,
    grade: null,
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
    $('#start-test').disabled = !(state.industry && state.specialization && state.grade);
  }

  async function init() {
    const [ind, spec, grades] = await Promise.all([
      api('/profile/industries'),
      api('/catalog/specializations'),
      api('/catalog/grades'),
    ]);
    renderPicks($('#industries'),      ind.items,  'industry');
    renderPicks($('#specializations'), spec.items, 'specialization');
    renderPicks($('#grades'),          grades.items, 'grade');

    // Сохраняем выбранное в профиль и создаём попытку
    $('#survey-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#start-test');
      btn.disabled = true;
      btn.textContent = 'Готовим задания…';
      try {
        await api('/profile/me', {
          method: 'PATCH',
          body: JSON.stringify({
            industry_id: state.industry,
            specialization_id: state.specialization,
            target_grade_id: state.grade,
          }),
        });
        const out = await api('/test/start', {
          method: 'POST',
          body: JSON.stringify({
            specialization_id: state.specialization,
            target_grade_id: state.grade,
          }),
        });
        sessionStorage.setItem('fsp.attempt', JSON.stringify(out));
        window.location.href = '/testing.html';
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Перейти к тестированию →';
        alert('Не удалось начать тест: ' + (err.body?.message || err.message));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();