// public/auth.js
// Общие утилиты авторизации. Подключается как ES-модуль из login.js / register.js.

export const TOKEN_KEY   = 'fsp.access';
export const REFRESH_KEY = 'fsp.refresh';
export const USER_KEY    = 'fsp.user';

const $ = (s, r = document) => r.querySelector(s);

let toastTimer;
export function toast(msg, kind = 'info') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

export async function api(path, opts = {}) {
  const { skipAuthRedirect, ...rest } = opts;
  const res = await fetch('/api/v1' + path, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(rest.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));

  if (res.status === 401 && !skipAuthRedirect) {
    clearSession();
    sessionStorage.clear();
    location.href = '/';
    throw Object.assign(new Error('unauthorized'), { status: 401, body });
  }
  if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
  return body;
}

export function saveSession(user, access, refresh) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function redirectByRole(_role) {
  location.href = '/main.html';
}

// ФСП ID — Post-MVP. Кнопка на месте, но ничего не делает, кроме тоста.
export function bindFspIdStub(btn) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    toast('Вход через ФСП ID — в разработке (Post-MVP)');
  });
}

export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}