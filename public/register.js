// public/register.js
import { api, saveSession, toast, isValidEmail } from '/auth.js';

const form = document.getElementById('register-form');
let currentRole = 'candidate';

// Переключатель роли
document.querySelectorAll('.roles__btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentRole = btn.dataset.role;
    document.querySelectorAll('.roles__btn').forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const d = Object.fromEntries(new FormData(form).entries());
  const email = String(d.email || '').trim().toLowerCase();
  const password = String(d.password || '');
  const password2 = String(d.password2 || '');
  const consent = !!form.elements.namedItem('consent').checked;

  if (!isValidEmail(email))         return toast('Введите корректный e-mail', 'error');
  if (password.length < 8)          return toast('Пароль должен быть не меньше 8 символов', 'error');
  if (password !== password2)       return toast('Пароли не совпадают', 'error');
  if (!consent)                     return toast('Нужно согласие на обработку данных', 'error');

  const btn = form.querySelector('button[type="submit"]');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Создаём аккаунт…';

  try {
    const out = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        role: currentRole,
        consent: true,
      }),
      skipAuthRedirect: true,
    });

    saveSession(out.user, out.accessToken, out.refreshToken);

    sessionStorage.setItem('fsp.verify.email', out.user.email);
    sessionStorage.setItem('fsp.verify.role',  out.user.role);
    location.href = '/email_code.html';
  } catch (err) {
    const code = err.body?.error || err.message;
    if (code === 'email_taken')          toast('Этот e-mail уже занят — попробуйте войти', 'error');
    else if (code === 'validation_error') toast('Проверьте правильность полей', 'error');
    else                                  toast('Ошибка: ' + code, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});