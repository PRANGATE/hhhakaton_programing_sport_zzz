/* ============================================================
   ФСП · Экран настроек кандидата
   — приватность (visibility)
   — ФСП ID (привязка / отвязка)
   — согласия (152-ФЗ)
   ============================================================ */

const TOKEN_KEY = 'fsp.access';

document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem(TOKEN_KEY)) { location.href = '/'; return; }

  initPrivacy();
  initFsp();
  initConsents();

  document.getElementById('save-btn')?.addEventListener('click', saveProfile);
});

/* ---------- API ---------- */

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
  if (!res.ok) {
    const msg = body?.details?.[0]?.message || body?.error || 'http_error';
    throw Object.assign(new Error(msg), { status: res.status, body });
  }
  return body;
}

/* ---------- Статус внизу формы ---------- */

function setStatus(text, isError = false) {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--accent-2)' : 'var(--muted)';
}

/* ---------- Приватность ---------- */

let visibilityState = {
  stacks: true,
  experience: true,
  soft_skills: false,
};

function initPrivacy() {
  document.getElementById('vis-stacks')?.addEventListener('change', e => {
    visibilityState.stacks = e.target.checked;
  });
  document.getElementById('vis-experience')?.addEventListener('change', e => {
    visibilityState.experience = e.target.checked;
  });
  document.getElementById('vis-soft')?.addEventListener('change', e => {
    visibilityState.soft_skills = e.target.checked;
  });
}

function applyVisibility(vis) {
  visibilityState = {
    stacks:      vis?.stacks      !== false,
    experience:  vis?.experience  !== false,
    soft_skills: vis?.soft_skills === true,
  };
  const s = document.getElementById('vis-stacks');
  const e = document.getElementById('vis-experience');
  const k = document.getElementById('vis-soft');
  if (s) s.checked = visibilityState.stacks;
  if (e) e.checked = visibilityState.experience;
  if (k) k.checked = visibilityState.soft_skills;
}

/* ---------- ФСП ID ---------- */

let currentFspId = null;

function initFsp() {
  document.getElementById('fsp-link-btn')?.addEventListener('click', linkFsp);
  document.getElementById('fsp-unlink-btn')?.addEventListener('click', unlinkFsp);

  document.getElementById('fsp-input')?.addEventListener('input', () => {
    const err = document.getElementById('fsp-error');
    if (err) err.hidden = true;
  });
}

function renderFsp(fspId) {
  currentFspId = fspId || null;

  const unlinked = document.getElementById('fsp-unlinked');
  const linked   = document.getElementById('fsp-linked');
  const value    = document.getElementById('fsp-value');
  const input    = document.getElementById('fsp-input');

  if (currentFspId) {
    if (unlinked) unlinked.hidden = true;
    if (linked)   linked.hidden = false;
    if (value)    value.textContent = currentFspId;
  } else {
    if (unlinked) unlinked.hidden = false;
    if (linked)   linked.hidden = true;
    if (input)    input.value = '';
  }
}

async function linkFsp() {
  const input = document.getElementById('fsp-input');
  const errEl = document.getElementById('fsp-error');
  const btn   = document.getElementById('fsp-link-btn');

  const raw = String(input?.value || '').trim();
  if (!raw) {
    if (errEl) { errEl.textContent = 'Введите ФСП ID'; errEl.hidden = false; }
    return;
  }

  btn.disabled = true;
  try {
    const { profile } = await api('/profile/me', {
      method: 'PATCH',
      body: JSON.stringify({ fsp_id: raw }),
    });
    renderFsp(profile?.fsp_id || null);
    setStatus('ФСП ID сохранён');
    setTimeout(() => setStatus(''), 2500);
  } catch (err) {
    if (errEl) { errEl.textContent = 'Ошибка: ' + err.message; errEl.hidden = false; }
  } finally {
    btn.disabled = false;
  }
}

async function unlinkFsp() {
  const btn = document.getElementById('fsp-unlink-btn');
  btn.disabled = true;
  try {
    const { profile } = await api('/profile/me', {
      method: 'PATCH',
      body: JSON.stringify({ fsp_id: null }),
    });
    renderFsp(profile?.fsp_id || null);
    setStatus('ФСП ID отвязан');
    setTimeout(() => setStatus(''), 2500);
  } catch (err) {
    setStatus('Ошибка: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Согласия ---------- */

let consentsState = { processing: null, publish: null };

function initConsents() {
  document.getElementById('consent-publish-btn')
    ?.addEventListener('click', () => acceptConsent('publish'));
}

function renderConsents(items) {
  const map = new Map((items || []).map(c => [c.kind, c]));
  consentsState.processing = map.get('processing') || null;
  consentsState.publish    = map.get('publish')    || null;

  const pState = document.getElementById('consent-processing-state');
  const bState = document.getElementById('consent-publish-state');
  const bBtn   = document.getElementById('consent-publish-btn');

  if (pState) {
    const on = !!consentsState.processing;
    pState.innerHTML = `
      <span class="consent__dot ${on ? 'consent__dot--on' : 'consent__dot--off'}"></span>
      <span>${on ? 'Принято' : 'Не принято'}</span>`;
  }

  if (bState) {
    const on = !!consentsState.publish;
    bState.innerHTML = `
      <span class="consent__dot ${on ? 'consent__dot--on' : 'consent__dot--off'}"></span>
      <span>${on ? 'Принято' : 'Не принято'}</span>`;
  }

  if (bBtn) {
    const on = !!consentsState.publish;
    bBtn.textContent = on ? 'Уже принято' : 'Дать согласие';
    bBtn.disabled = on;
  }
}

async function acceptConsent(kind) {
  const btn = document.getElementById('consent-publish-btn');
  if (btn) btn.disabled = true;
  try {
    const { items } = await api('/profile/consents', {
      method: 'POST',
      body: JSON.stringify({ kind, version: 'v1' }),
    });
    renderConsents(items);
    setStatus('Согласие сохранено');
    setTimeout(() => setStatus(''), 2500);
  } catch (err) {
    setStatus('Ошибка: ' + err.message, true);
    if (btn) btn.disabled = false;
  }
}

/* ---------- Загрузка и сохранение ---------- */

async function loadAll() {
  try {
    const [{ profile }, { items }] = await Promise.all([
      api('/profile/me'),
      api('/profile/consents'),
    ]);
    applyVisibility(profile?.visibility);
    renderFsp(profile?.fsp_id);
    renderConsents(items);
  } catch (err) {
    console.error('[settings] load failed', err);
    setStatus('Не удалось загрузить настройки: ' + err.message, true);
  }
}

async function saveProfile() {
  const btn = document.getElementById('save-btn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';
  try {
    await api('/profile/me', {
      method: 'PATCH',
      body: JSON.stringify({ visibility: visibilityState }),
    });
    setStatus('✓ Сохранено');
    setTimeout(() => setStatus(''), 2500);
  } catch (err) {
    setStatus('Ошибка: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
}

/* ---------- Старт ---------- */

loadAll();