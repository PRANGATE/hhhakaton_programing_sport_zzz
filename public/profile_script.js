/* ============================================================
   ФСП · Страница профиля: загрузка из API + экспорт в PDF.
   ============================================================ */

const TOKEN_KEY = 'fsp.access';

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
  if (res.status === 401) { location.href = '/'; throw new Error('unauthorized'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
  return body;
}

async function loadProfile() {
  try {
    const { profile } = await api('/profile/me');
    renderProfile(profile);
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

/* ---------- рендер ---------- */

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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============================================================
   Экспорт профиля в PDF (без изменений)
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
  try {
    if (typeof window.html2pdf === 'function') {
      const target = document.querySelector('main');
      await window.html2pdf()
        .set({
          margin: [10, 10, 12, 10],
          filename: 'fsp-profile.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: null, scrollY: 0 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
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
    document.body.classList.remove('is-printing');
    btn.disabled = false;
    btn.textContent = original;
  }
}