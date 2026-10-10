// public/login.js
import {
  api, saveSession, redirectByRole, toast,
  bindFspIdStub, isValidEmail,
} from '/auth.js';

const form = document.getElementById('login-form');

// ФСП ID — Post-MVP: кнопка на месте, по клику тост.
bindFspIdStub(document.getElementById('fsp-id-btn'));

// Заглушки для ссылок «Забыли пароль?»
document.querySelectorAll('[data-stub]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    toast('Функционал в разработке');
  });
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = Object.fromEntries(new FormData(form).entries());
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');

  if (!isValidEmail(email)) return toast('Введите корректный e-mail', 'error');
  if (!password)            return toast('Введите пароль', 'error');

  const btn = form.querySelector('button[type="submit"]');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Входим…';

  try {
    const out = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRedirect: true,
    });

    saveSession(out.user, out.accessToken, out.refreshToken);

    // Если e-mail ещё не подтверждён — отправляем ввести код
    if (!out.user.email_verified_at) {
      sessionStorage.setItem('fsp.verify.email', out.user.email);
      sessionStorage.setItem('fsp.verify.role',  out.user.role);
      location.href = '/email_code.html';
      return;
    }

    redirectByRole(out.user.role);
  } catch (err) {
    const code = err.body?.error || err.message;
    const reason = err.body?.reason;

    if (code === 'invalid_credentials') {
      toast('Неверный e-mail или пароль. Если база сбрасывалась — зарегистрируйтесь заново.', 'error');
    } else if (reason === 'user_not_found') {
      toast('Сессия устарела. Войдите заново.', 'error');
    } else if (code === 'validation_error') {
      toast('Проверьте правильность полей', 'error');
    } else {
      toast('Ошибка: ' + code, 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = orig;
  }
});