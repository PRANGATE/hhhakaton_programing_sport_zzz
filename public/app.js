// ---- утилиты ----
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const TOKEN_KEY   = 'fsp.access';
const REFRESH_KEY = 'fsp.refresh';
const USER_KEY    = 'fsp.user';

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}

// ---- переключатель роли ----
let currentRole = 'candidate';
$$('.roles__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentRole = btn.dataset.role;
    $$('.roles__btn').forEach(b => {
      const active = b === btn;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
  });
});

// ---- API ----
async function api(path, opts = {}) {
  const res = await fetch('/api/v1' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
  return body;
}

function saveSession(user, access, refresh) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function redirectByRole(role) {
  if (role === 'admin')         location.href = '/main.html';
  else if (role === 'employer') location.href = '/employer/profile.html';
  else                          location.href = '/profile.html';
}

// ---- форма входа/регистрации ----
// Меняем поведение: кнопка "Войти" слева, ссылка "Зарегистрироваться" ниже.
// Форма одна: сначала пробуем login, если 401 и есть флаг "register" — регистрируемся.
let mode = 'login'; // 'login' | 'register'

// ---- инициализация Keycloak-кнопки (заглушка) ----
async function loadConfig() {
  try {
    const res = await fetch('/api/v1/config', { cache: 'no-store' });
    return await res.json();
  } catch { return null; }
}

async function initKeycloak(cfg) {
  const btn = $('#fsp-id-btn');
  if (!btn) return;
  if (!cfg?.keycloak?.enabled) {
    btn.addEventListener('click', () => toast('Вход через ФСП ID — в разработке'));
    return;
  }
  btn.addEventListener('click', () => toast('Keycloak включён, но интеграция — Post-MVP'));
}

// ---- обработка submit ----
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.email || !data.password) return toast('Заполните e-mail и пароль');

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  const original = submitBtn.textContent;

  try {
    let out;
    if (mode === 'register') {
      submitBtn.textContent = 'Создаём аккаунт…';
      out = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: data.email, password: data.password,
          role: currentRole, consent: true,
        }),
      });
    } else {
      submitBtn.textContent = 'Входим…';
      try {
        out = await api('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: data.email, password: data.password }),
        });
      } catch (err) {
        if (err.status === 401) {
          // Пробуем зарегистрировать — прототип, удобно.
          mode = 'register';
          submitBtn.textContent = 'Регистрируем…';
          out = await api('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              email: data.email, password: data.password,
              role: currentRole, consent: true,
            }),
          });
        } else throw err;
      }
    }

    saveSession(out.user, out.accessToken, out.refreshToken);

    // Всегда просим ввести код (прототип: любой 6-значный).
    sessionStorage.setItem('fsp.verify.email', out.user.email);
    sessionStorage.setItem('fsp.verify.role',  out.user.role);
    location.href = '/email_code.html';
  } catch (err) {
    const msg = err.body?.error || err.message;
    if (msg === 'email_taken')          toast('E-mail уже занят — войдите');
    else if (msg === 'invalid_credentials') toast('Неверный e-mail или пароль');
    else                                toast('Ошибка: ' + msg);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = original;
    mode = 'login';
  }
});

// ---- заглушки для ссылок ----
$$('[data-stub]').forEach(el => el.addEventListener('click', (e) => {
  e.preventDefault();
  toast('Функционал в разработке');
}));

// ---- init ----
(async () => {
  const cfg = await loadConfig();
  if (cfg?.appName) document.title = `${cfg.appName} — Вход`;
  await initKeycloak(cfg);
})();