/* Главная: новости + админ-панель. */
(function () {
    const TOKEN_KEY   = 'fsp.access';
    const REFRESH_KEY = 'fsp.refresh';
    const USER_KEY    = 'fsp.user';

    const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
    const getUser  = () => {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
        catch { return null; }
    };

    async function api(path, opts = {}) {
        const res = await fetch('/api/v1' + path, {
            ...opts,
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
                ...(opts.headers || {}),
            },
        });

        if (res.status === 401) {
            [TOKEN_KEY, REFRESH_KEY, USER_KEY].forEach(k => localStorage.removeItem(k));
            sessionStorage.clear();
            location.href = '/';
            throw new Error('unauthorized');
        }

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw Object.assign(new Error(body.error || 'http_error'), {
                status: res.status, body,
            });
        }
        return body;
    }

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

    const fmtDate = d => {
        try {
            return new Date(d).toLocaleString('ru-RU', {
                dateStyle: 'long', timeStyle: 'short',
            });
        } catch { return ''; }
    };

    /* ---------- Новости ---------- */

    async function loadNews() {
        const el     = document.getElementById('news-list');
        const user   = getUser();
        const isAdmin = user?.role === 'admin';

        try {
            const { items } = await api('/news');

            if (!items.length) {
                el.innerHTML = '<div class="empty">Пусто, ожидайте новостей.</div>';
                return;
            }

            el.innerHTML = items.map(p => `
                <article class="news-card">
                    <header class="news-card__head">
                        <h2>${esc(p.title)}</h2>
                        <div class="news-card__meta">
                            <span>${esc(fmtDate(p.published_at))}</span>
                            ${p.author_email ? `<span>· ${esc(p.author_email)}</span>` : ''}
                        </div>
                    </header>
                    <div class="news-card__body">${esc(p.body)}</div>
                    ${isAdmin
                        ? `<div class="news-card__actions">
                               <button type="button" class="news-delete" data-id="${esc(p.id)}">Удалить</button>
                           </div>`
                        : ''}
                </article>
            `).join('');

            if (isAdmin) {
                el.querySelectorAll('.news-delete').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        if (!confirm('Удалить новость?')) return;
                        btn.disabled = true;
                        try {
                            await api('/news/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' });
                            loadNews();
                        } catch (err) {
                            alert('Не удалось удалить: ' + err.message);
                            btn.disabled = false;
                        }
                    });
                });
            }
        } catch (err) {
            el.innerHTML = `<div class="empty">Ошибка: ${esc(err.message)}</div>`;
        }
    }

    /* ---------- Админ-панель ---------- */

    async function initAdmin() {
        const user = getUser();

        // Не админ — физически удаляем админские блоки из DOM.
        // Никакой CSS/JS их тогда не покажет, даже случайно.
        if (user?.role !== 'admin') {
            document.getElementById('admin-banner')?.remove();
            document.getElementById('admin-compose')?.remove();
            document.getElementById('admin-panel')?.remove();
            return;
        }

        // Подтверждаем роль у сервера — localStorage можно оставить устаревшим
        // или подделать руками через DevTools.
        try {
            const { user: me } = await api('/auth/me');
            if (me?.role !== 'admin') {
                document.getElementById('admin-banner')?.remove();
                document.getElementById('admin-compose')?.remove();
                document.getElementById('admin-panel')?.remove();
                return;
            }
        } catch {
            return;
        }

        document.getElementById('admin-banner').hidden = false;
        document.getElementById('admin-compose').classList.remove('is-hidden');
        document.getElementById('admin-panel').classList.remove('is-hidden');

        const form   = document.getElementById('news-form');
        const status = document.getElementById('news-status');

        form.addEventListener('submit', async e => {
            e.preventDefault();

            const d = Object.fromEntries(new FormData(form).entries());
            const title = String(d.title || '').trim();
            const body  = String(d.body  || '').trim();

            if (!title || !body) {
                status.textContent = 'Заполните заголовок и текст';
                return;
            }

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            status.textContent = 'Публикуем…';

            try {
                await api('/news', {
                    method: 'POST',
                    body: JSON.stringify({ title, body }),
                });
                status.textContent = '✓ Опубликовано';
                form.reset();
                loadNews();
                setTimeout(() => { status.textContent = ''; }, 2500);
            } catch (err) {
                status.textContent = 'Ошибка: ' + err.message;
            } finally {
                submitBtn.disabled = false;
            }
        });

        loadCandidates();
        loadEmployers();
    }

    async function loadCandidates() {
        const el = document.getElementById('admin-candidates');
        try {
            const { items } = await api('/admin/candidates');
            if (!items.length) {
                el.innerHTML = '<div class="empty">Пусто</div>';
                return;
            }
            el.innerHTML = items.map(u => `
                <div class="admin-row">
                    <div>
                        <b>${esc(u.email)}</b>
                        <div class="admin-row__meta">
                            ${esc(u.full_name || '—')} ·
                            ${esc(u.specialization_id || '—')} ·
                            ${esc(u.current_grade_id || '—')}
                        </div>
                    </div>
                    <button type="button" class="admin-del"
                            data-kind="candidates"
                            data-id="${esc(u.id)}">Удалить</button>
                </div>
            `).join('');
            bindDelete(el);
        } catch (err) {
            el.innerHTML = `<div class="empty">Ошибка: ${esc(err.message)}</div>`;
        }
    }

    async function loadEmployers() {
        const el = document.getElementById('admin-employers');
        try {
            const { items } = await api('/admin/employers');
            if (!items.length) {
                el.innerHTML = '<div class="empty">Пусто</div>';
                return;
            }
            el.innerHTML = items.map(u => `
                <div class="admin-row">
                    <div>
                        <b>${esc(u.company_name || u.email)}</b>
                        <div class="admin-row__meta">${esc(u.email)}</div>
                    </div>
                    <button type="button" class="admin-del"
                            data-kind="employers"
                            data-id="${esc(u.id)}">Удалить</button>
                </div>
            `).join('');
            bindDelete(el);
        } catch (err) {
            el.innerHTML = `<div class="empty">Ошибка: ${esc(err.message)}</div>`;
        }
    }

    function bindDelete(container) {
        container.querySelectorAll('.admin-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Удалить анкету безвозвратно?')) return;
                btn.disabled = true;
                try {
                    await api(
                        '/admin/' + btn.dataset.kind + '/' + encodeURIComponent(btn.dataset.id),
                        { method: 'DELETE' }
                    );
                    btn.closest('.admin-row').remove();
                } catch (err) {
                    alert('Не удалось удалить: ' + err.message);
                    btn.disabled = false;
                }
            });
        });
    }

    /* ---------- Init ---------- */

    function init() {
        loadNews();
        initAdmin();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();