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

// Рендер общей верхней панели работодателя.
export async function mountShell(activeKey, opts = {}) {
  const user = getUser();
  if (!user || user.role !== 'employer') {
    clearSession();
    location.href = '/';
    return null;
  }

  document.body.dataset.navbarState = 'employer';

  // navigation_bar_script.js находится в public и сам выбирает
  // navigation_bar_employer.html для страниц /employer/*.
  let nav = document.querySelector('.navbar');
  if (!nav && window.FSPNavbar?.mount) {
    nav = await window.FSPNavbar.mount();
  }

  if (nav) {
    const navKey = ({
      candidate: 'candidates',
      candidates: 'candidates',
      invitations: 'invitations',
      invite: 'invitations',
      matching: 'matching',
      needs: 'needs',
      profile: 'profile-company',
    })[activeKey] || activeKey;

    nav.querySelectorAll('.navbar__link.is-active').forEach(link => {
      link.classList.remove('is-active');
      link.removeAttribute('aria-current');
    });

    const activeLink = nav.querySelector('.navbar__link[data-nav="' + navKey + '"]');
    if (activeLink) {
      activeLink.classList.add('is-active');
      activeLink.setAttribute('aria-current', 'page');
    }

    const userEl = nav.querySelector('#navbar-user');
    if (userEl) userEl.textContent = user.email || '';

    const logout = nav.querySelector('#navbar-logout');
    if (logout && !logout.dataset.bound) {
      logout.dataset.bound = '1';
      logout.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await api('/auth/logout', { method: 'POST', body: JSON.stringify({}) }); } catch {}
        clearSession();
        location.href = '/';
      });
    }
  }

  return user;
}
