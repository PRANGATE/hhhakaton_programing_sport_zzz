// Общая логика кабинета работодателя: сессия, API, навбар, guard.

export const TOKEN_KEY   = 'fsp.access';
export const REFRESH_KEY = 'fsp.refresh';
export const USER_KEY    = 'fsp.user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser  = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
};
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) { clearSession(); sessionStorage.clear(); location.href = '/'; throw new Error('unauthorized'); }  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
  return body;
}

// Простая обёртка форм.
export function readForm(formEl) {
  return Object.fromEntries(new FormData(formEl).entries());
}

export function fmtSalary(from, to) {
  const f = n => Number(n).toLocaleString('ru-RU') + ' ₽';
  return `${f(from)} – ${f(to)}`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Рендер левого меню + верхней панели.
export async function mountShell(activeKey, opts = {}) {
  const user = getUser();
  if (!user || user.role !== 'employer') {
    clearSession();
    location.href = '/';
    return null;
  }

  // Верхний бар
  const nav = document.createElement('header');
  nav.className = 'emp-nav';
  nav.innerHTML = `
    <a class="emp-nav__brand" href="/employer/profile.html">
      <img src="/logos/logo_01.svg" alt="ФСП">
      <span>ФСП · Кабинет работодателя</span>
    </a>
    <div class="emp-nav__right">
      <span class="emp-nav__user">${escapeHtml(user.email)}</span>
      <a href="#" id="logout-btn" class="btn btn--ghost btn--sm">Выйти</a>
    </div>`;
  document.body.insertBefore(nav, document.body.firstChild);
  nav.querySelector('#logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch {}
    clearSession();
    location.href = '/';
  });

  // Левый сайдбар
  const layout = document.querySelector('.emp-layout');
  const items = [
    ['profile',     '/employer/profile.html',     'Профиль компании'],
    ['needs',       '/employer/needs.html',       'Потребность'],
    ['matching',    '/employer/matching.html',    'Подборка'],
    ['candidates',  '/employer/candidates.html',  'Банк кандидатов'],
    ['invitations', '/employer/invitations.html', 'Мои приглашения'],
  ];
  const side = document.createElement('aside');
  side.className = 'emp-side';
  side.innerHTML = `<div class="emp-side__title">Кабинет</div>` +
    items.map(([k, href, label]) =>
      `<a href="${href}" class="${k === activeKey ? 'is-on' : ''}">${label}</a>`
    ).join('');
  layout.insertBefore(side, layout.firstChild);

  return user;
}