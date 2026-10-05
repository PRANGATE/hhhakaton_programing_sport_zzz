// ---- утилиты ----
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
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

// ---- форма: пока без логики ----
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.email || !data.password) {
    toast('Заполните e-mail и пароль');
    return;
  }
  toast(`Вход как «${currentRole === 'candidate' ? 'Кандидат' : 'Работодатель'}» — в разработке`);
});

// ---- ссылки-заглушки ----
$$('[data-stub]').forEach(el => el.addEventListener('click', (e) => {
  e.preventDefault();
  toast('Функционал в разработке');
}));

// ---- загрузка конфига и подготовка Keycloak ----
async function loadConfig() {
  try {
    const res = await fetch('/api/v1/config', { cache: 'no-store' });
    return await res.json();
  } catch { return null; }
}

async function initKeycloak(cfg) {
  const btn = $('#fsp-id-btn');

  if (!cfg?.keycloak?.enabled) {
    // Режим заглушки — интеграция уже «вшита», включается переменными окружения
    btn.addEventListener('click', () => toast('Вход через ФСП ID — в разработке'));
    return;
  }

  try {
    const { default: Keycloak } = await import('/vendor/keycloak/keycloak.js');
    const kc = new Keycloak({
      url: cfg.keycloak.url,
      realm: cfg.keycloak.realm,
      clientId: cfg.keycloak.clientId,
    });

    const ok = await kc.init({ onLoad: 'check-sso', pkceMethod: 'S256' });
    if (ok) toast('Сессия ФСП ID активна');

    btn.addEventListener('click', () => kc.login({ redirectUri: window.location.origin }));
  } catch (err) {
    console.error('[fsp] keycloak init failed', err);
    btn.addEventListener('click', () => toast('Не удалось подключиться к ФСП ID'));
  }
}

(async () => {
  const cfg = await loadConfig();
  if (cfg?.appName) document.title = `${cfg.appName} — Вход`;
  await initKeycloak(cfg);
})();