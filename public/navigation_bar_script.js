(function () {
    const NAVBAR_URLS = {
        employee: '/navigation_bar.html',
        employer: '/navigation_bar_employer.html',
        admin:    '/navigation_bar_admin.html',
    };

    const ROLE_TO_KIND = {
        candidate: 'employee',
        employer:  'employer',
        admin:     'admin',
    };

    // Путь → ключ активного пункта, отдельно для каждой роли
    const EMPLOYEE_ROUTES = {
        '/main.html':            'main',
        '/profile.html':         'profile',
        '/profile_editing.html': 'profile',
        '/survey.html':          'testing',
        '/testing.html':         'testing',
        '/testing_result.html':  'testing',
        '/jobs.html':            'jobs',
        '/offers.html':          'offers',
        '/settings.html':        'settings',
    };

    const EMPLOYER_ROUTES = {
        '/main.html': 'main',
    };

    const ADMIN_ROUTES = {
        '/main.html': 'main',
    };

    // Короткие имена (которые передаёт mountShell) → ключ data-nav
    const EMPLOYER_KEYS = {
        main:        'main',
        candidate:   'candidates',
        candidates:  'candidates',
        invitations: 'invitations',
        invite:      'invitations',
        matching:    'matching',
        needs:       'needs',
        profile:     'profile-company',
    };

    const ADMIN_KEYS = {
        main: 'main',
    };

    function getUser() {
        try { return JSON.parse(localStorage.getItem('fsp.user') || 'null'); }
        catch { return null; }
    }

    function isEmployerPath() {
        return window.location.pathname.startsWith('/employer/');
    }

    function isAdminPath() {
        return window.location.pathname.startsWith('/admin/');
    }

    // Порядок приоритетов:
    // 1) явный путь /admin/* или /employer/*
    // 2) роль из localStorage (работает и на /main.html)
    // 3) fallback — кандидатская панель
    function resolveNavKind() {
        if (isAdminPath())    return 'admin';
        if (isEmployerPath()) return 'employer';

        const user = getUser();
        return ROLE_TO_KIND[user?.role] || 'employee';
    }

    function getActiveKey(kind, activeKey) {
        if (activeKey) {
            if (kind === 'employer') return EMPLOYER_KEYS[activeKey] || activeKey;
            if (kind === 'admin')    return ADMIN_KEYS[activeKey]    || activeKey;
            return activeKey;
        }

        const path = window.location.pathname.replace(/\/+$/, '') || '/';

        if (kind === 'employer') return EMPLOYER_ROUTES[path] || '';
        if (kind === 'admin')    return ADMIN_ROUTES[path]    || '';
        return EMPLOYEE_ROUTES[path] || '';
    }

    function markActive(nav, kind, activeKey) {
        if (!nav) return;
        const key = getActiveKey(kind, activeKey);

        nav.querySelectorAll('.navbar__link').forEach(link => {
            const active = Boolean(key && link.dataset.nav === key);
            link.classList.toggle('is-active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else        link.removeAttribute('aria-current');
        });
    }

    function bindLogout(nav) {
        const button = nav?.querySelector('#navbar-logout');
        if (!button || button.dataset.bound === '1') return;

        button.dataset.bound = '1';
        button.addEventListener('click', async event => {
            event.preventDefault();

            const token = localStorage.getItem('fsp.access') || '';
            button.disabled = true;

            try {
                await fetch('/api/v1/auth/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: 'Bearer ' + token } : {}),
                    },
                    body: JSON.stringify({}),
                });
            } catch (error) {
                console.warn('[FSP] Ошибка запроса выхода:', error);
            } finally {
                localStorage.removeItem('fsp.access');
                localStorage.removeItem('fsp.refresh');
                localStorage.removeItem('fsp.user');
                sessionStorage.clear();

                window.location.href = '/';
            }
        });
    }

    async function fillEmail(nav) {
        const node = nav?.querySelector('#navbar-email, #navbar-user');
        if (!node) return;

        const user = getUser();
        if (user?.email) node.textContent = user.email;

        const token = localStorage.getItem('fsp.access');
        if (!token) return;

        // Для не-админов и не-employer-ов подтягиваем email из профиля
        try {
            const r = await fetch('/api/v1/profile/me', {
                headers: { Authorization: 'Bearer ' + token },
                credentials: 'same-origin',
            });
            if (!r.ok) return;
            const data = await r.json();
            const email = data?.profile?.email || data?.user?.email || data?.email;
            if (email) {
                node.textContent = email;
                const u = getUser() || {};
                u.email = email;
                localStorage.setItem('fsp.user', JSON.stringify(u));
            }
        } catch (_) {}
    }

    async function mount(activeKey) {
        const kind = resolveNavKind();
        const url  = NAVBAR_URLS[kind];

        let nav = document.querySelector('header.navbar');

        // Если на странице уже стоит панель другой роли — снести и поставить нужную
        if (nav && nav.dataset.navbarState !== kind) {
            nav.remove();
            nav = null;
        }

        if (!nav) {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`);
            }

            const html = await response.text();
            const tpl = document.createElement('template');
            tpl.innerHTML = html.trim();
            nav = tpl.content.querySelector('header.navbar');
            if (!nav) throw new Error('В файле навигации не найден header.navbar');

            nav.dataset.navbarState = kind;
            document.body.insertBefore(nav, document.body.firstChild);
        }

        markActive(nav, kind, activeKey);
        bindLogout(nav);
        fillEmail(nav);

        return nav;
    }

    // Экспорт для mountShell() кабинета работодателя
    window.FSPNavbar = { mount };

    // Автозагрузка — для всех, кроме /employer/* (там панель ставит mountShell)
    if (!isEmployerPath()) {
        const start = () => {
            mount().catch(err => console.error('[FSP] Навигация:', err));
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }
})();