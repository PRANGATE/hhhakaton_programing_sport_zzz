/* ============================================================
   ФСП · Страница профиля: загрузка из API + экспорт в PDF.
   ============================================================ */

const TOKEN_KEY = 'fsp.access';

const GRADE_ORDER   = ['junior', 'middle', 'senior'];
const GRADE_LABEL   = { junior: 'Junior', middle: 'Middle', senior: 'Senior' };
const SPEC_LABEL    = {
  backend: 'Backend',
  frontend: 'Frontend',
  mobile: 'Mobile',
  'data-analytics': 'Data & Analytics',
  devops: 'DevOps / SRE',
  qa: 'QA',
  infosec: 'Information Security',
  gamedev: 'Game Dev',
};
const STATUS_LABEL  = {
  passed: 'Пройдено',
  failed: 'Не пройдено',
  in_progress: 'В процессе',
  expired: 'Истекло',
};

document.addEventListener('DOMContentLoaded', () => {
  initExportPdf('exportPdf');
  loadProfile();
});

async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (localStorage.getItem(TOKEN_KEY) || ''),
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
  if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
  return body;
}

async function loadProfile() {
  try {
    const [profileRes, historyRes] = await Promise.all([
      api('/profile/me'),
      api('/test/history').catch(() => ({ items: [], current: null, locks: {}, cooldown_days: 90 })),
    ]);
    renderProfile(profileRes.profile);
    renderCategory(profileRes.profile, historyRes);
  } catch (err) {
    console.error('[FSP] profile load failed', err);
    const main = document.querySelector('main');
    if (main) {
      const p = document.createElement('p');
      p.style.color = 'var(--accent-2)';
      p.textContent = 'Не удалось загрузить профиль: ' + err.message;
      main.prepend(p);
    }
  }
}

/* ---------- рендер базового профиля ---------- */

function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return {
    lastName:   parts[0] || '',
    firstName:  parts[1] || '',
    middleName: parts.slice(2).join(' '),
  };
}

function renderProfile(p) {
  if (!p) return;

  const { lastName, firstName, middleName } = splitName(p.full_name);
  setText('#pf-lastName',   lastName || '—');
  setText('#pf-firstName',  firstName || '—');
  setText('#pf-middleName', middleName || '—');

  setLink('#pf-email', p.email ? { text: p.email, href: 'mailto:' + p.email } : { text: '—' });

  if (p.telegram) {
    const handle = String(p.telegram).replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    setLink('#pf-telegram', { text: '@' + handle, href: 'https://t.me/' + handle });
  } else {
    setLink('#pf-telegram', { text: '—' });
  }

  if (p.phone) {
    setLink('#pf-phone', { text: p.phone, href: 'tel:' + String(p.phone).replace(/\D/g, '') });
  } else {
    setLink('#pf-phone', { text: '—' });
  }

  setText('#pf-experience', p.experience_years != null ? `${p.experience_years} лет` : '—');
  setText('#pf-about', p.about || '—');

  renderBadges('#pf-roles',  p.roles  || []);
  renderBadges('#pf-stacks', p.stacks || []);
}

function setText(sel, val) {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
}

function setLink(sel, { text, href }) {
  const el = document.querySelector(sel);
  if (!el) return;
  el.textContent = text;
  if (href) el.setAttribute('href', href);
  else el.removeAttribute('href');
}

function renderBadges(sel, items) {
  const ul = document.querySelector(sel);
  if (!ul) return;

  if (!items.length) {
    ul.innerHTML = `<li class="badge" style="opacity:.65">
      <span class="badge__text">Пока ничего не добавлено</span>
    </li>`;
    return;
  }

  ul.innerHTML = items.map(it => {
    const label = typeof it === 'string' ? it : (it.name || it.id || '');
    return `<li class="badge">
      <span class="badge__text">${escapeHtml(label)}</span>
    </li>`;
  }).join('');
}

/* ============================================================
   Категория и грейд + история попыток
   ============================================================ */

function renderCategory(profile, history) {
  const items  = history.items  || [];
  const current = history.current || null;
  const locks  = history.locks   || {};
  const cooldownDays = history.cooldown_days || 90;

  // Фолбэк, если успешных попыток нет — берём target/spec из профиля.
  const spec  = current?.specialization_id || profile?.specialization_id || null;
  const grade = current?.grade_id          || profile?.current_grade_id || null;

  // 1. Строка «Текущая категория»
  const catEl = document.getElementById('pf-category');
  if (catEl) {
    if (spec && grade) {
      catEl.textContent = `${SPEC_LABEL[spec] || spec} · ${GRADE_LABEL[grade] || grade}`;
    } else if (spec) {
      catEl.textContent = `${SPEC_LABEL[spec] || spec} · тест не пройден`;
    } else {
      catEl.textContent = 'Не определена — пройдите опрос и тест';
    }
  }

  // 2. Кнопки выше/ниже/пройти
  const btnSingle = document.getElementById('pf-test-single');
  const btnHigher = document.getElementById('pf-test-higher');
  const btnLower  = document.getElementById('pf-test-lower');
  const hintEl    = document.getElementById('pf-cooldown-hint');

  if (btnSingle) btnSingle.hidden = true;
  if (btnHigher) btnHigher.hidden = true;
  if (btnLower)  btnLower.hidden  = true;

if (!spec) {
    // Категория ещё не определена — предлагаем пройти опрос и тест.
    if (btnSingle) {
        btnSingle.hidden   = false;
        btnSingle.disabled = false;
        btnSingle.textContent = 'Пройти тест';
        btnSingle.onclick  = () => goToSurvey(null, profile?.target_grade_id || null);
    }
    if (hintEl) {
        hintEl.textContent = 'Пройдите опрос и тест, чтобы получить категорию и грейд.';
    }
    renderHistory(items);
    return;
}

  if (!grade) {
    // Опроса прошёл, теста не было — одна кнопка «Пройти тест».
    if (btnSingle) {
      btnSingle.hidden = false;
      btnSingle.disabled = false;
      btnSingle.onclick = () => goToSurvey(spec, profile?.target_grade_id || null);
    }
    if (hintEl) hintEl.textContent = '';
    renderHistory(items);
    return;
  }

  const idx    = GRADE_ORDER.indexOf(grade);
  const higher = idx >= 0 && idx < GRADE_ORDER.length - 1 ? GRADE_ORDER[idx + 1] : null;
  const lower  = idx > 0 ? GRADE_ORDER[idx - 1] : null;

  const lockFor = (targetGrade) => {
    if (!targetGrade) return null;
    return locks[`${spec}|${targetGrade}`] || null;
  };

  const higherLock = higher ? lockFor(higher) : null;
  const lowerLock  = lower  ? lockFor(lower)  : null;

  if (higher && btnHigher) {
    btnHigher.hidden   = false;
    btnHigher.disabled = Boolean(higherLock);
    btnHigher.onclick  = () => goToSurvey(spec, higher);
    btnHigher.title    = higherLock
      ? `Доступно с ${fmtDate(higherLock.until)}`
      : '';
  }

  if (lower && btnLower) {
    btnLower.hidden   = false;
    btnLower.disabled = Boolean(lowerLock);
    btnLower.onclick  = () => goToSurvey(spec, lower);
    btnLower.title    = lowerLock
      ? `Доступно с ${fmtDate(lowerLock.until)}`
      : '';
  }

  if (hintEl) {
    const parts = [];
    if (higherLock) parts.push(`выше (${GRADE_LABEL[higher]}) — с ${fmtDate(higherLock.until)}`);
    if (lowerLock)  parts.push(`ниже (${GRADE_LABEL[lower]})  — с ${fmtDate(lowerLock.until)}`);

    hintEl.textContent = parts.length
      ? `Смена грейда — раз в ${cooldownDays} дней. Доступно: ${parts.join('; ')}.`
      : `Смена грейда — раз в ${cooldownDays} дней с момента последней попытки.`;
  }

  renderHistory(items);
}

function goToSurvey(spec, grade) {
  const q = new URLSearchParams();
  if (spec)  q.set('spec',  spec);
  if (grade) q.set('grade', grade);
  location.href = '/survey.html' + (q.toString() ? '?' + q.toString() : '');
}

function renderHistory(items) {
  const el = document.getElementById('pf-history');
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `<div class="history__empty">Попыток пока нет. Пройдите опрос и тестирование.</div>`;
    return;
  }

  el.innerHTML = `
    <table class="history__table">
      <thead>
        <tr>
          <th>Дата</th>
          <th>Специализация</th>
          <th>Грейд</th>
          <th>Результат</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(a => {
          const date   = fmtDate(a.finished_at || a.started_at);
          const spec   = SPEC_LABEL[a.specialization_id] || a.specialization_id || '—';
          const target = GRADE_LABEL[a.target_grade_id]  || a.target_grade_id  || '—';
          const awarded = a.awarded_grade_id
            ? `<span class="history__awarded">→ ${GRADE_LABEL[a.awarded_grade_id] || a.awarded_grade_id}</span>`
            : '';
          const score  = a.score != null ? `${a.score}%` : '—';
          const status = STATUS_LABEL[a.status] || a.status;
          const cls    = a.status === 'passed' ? 'history__status--ok'
                       : a.status === 'failed' ? 'history__status--bad'
                       : '';
          return `
            <tr>
              <td>${escapeHtml(date)}</td>
              <td>${escapeHtml(spec)}</td>
              <td>${escapeHtml(target)} ${awarded}</td>
              <td>${escapeHtml(score)}</td>
              <td><span class="history__status ${cls}">${escapeHtml(status)}</span></td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function fmtDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(value); }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============================================================
   Экспорт профиля в PDF
   ============================================================ */

function initExportPdf(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', () => runExport(btn));
}

async function runExport(btn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Готовим PDF…';
  document.body.classList.add('is-printing');

  const target = document.querySelector('main');
  const injected = []; // запоминаем, кому добавили класс, чтобы потом убрать

  try {
    if (typeof window.html2pdf === 'function') {
      // Помечаем все «неразрывные» блоки явным классом.
      // Список селекторов можно расширять под свою вёрстку.
      const KEEP_SELECTORS = [
        '.profile__section',
        '.profile__row',
        '.profile__field',
        '.badge',
        '.history__table thead',
        '.history__table tbody tr',
        'section',
        '.card',
        'h1', 'h2', 'h3',
      ];
      target.querySelectorAll(KEEP_SELECTORS.join(',')).forEach(el => {
        el.classList.add('pdf-keep');
        injected.push(el);
      });

      await window.html2pdf()
        .set({
          margin: [14, 10, 12, 10],  // было [10, 10, 12, 10] — верхний увеличили
          filename: 'fsp-profile.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: null,
            scrollY: 0,
            windowWidth: target.scrollWidth, // важно: иначе блоки «сжимаются» и переносятся
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: {
            mode: ['css', 'legacy'],
            avoid: [
              '.pdf-keep',
              'tr', 'thead', 'tbody tr',
              '.badge',
              '.profile__section',
              'h1', 'h2', 'h3',
            ],
            before: '.pdf-break-before', // если где-то нужен принудительный разрыв
            after:  '.pdf-break-after',
          },
        })
        .from(target)
        .save();
    } else {
      window.print();
    }
  } catch (err) {
    console.error('[FSP] export error', err);
    window.print();
  } finally {
    injected.forEach(el => el.classList.remove('pdf-keep'));
    document.body.classList.remove('is-printing');
    btn.disabled = false;
    btn.textContent = original;
  }
}