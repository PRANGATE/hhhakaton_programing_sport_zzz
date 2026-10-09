(function () {
    const EMPLOYEE_NAV_URL = '/navigation_bar.html';
    const EMPLOYER_NAV_URL = '/navigation_bar_employer.html';

    // Маршруты: путь → ключ активного пункта.
    // main.html доступен обеим ролям, поэтому есть в обоих словарях.
    const EMPLOYEE_ROUTES = {
        '/main.html':            'main',
        '/profile.html':         'profile',
        '/profile_editing.html': 'profile',
        '/testing.html':         'testing',
        '/jobs.html':            'jobs',
        '/offers.html':          'offers',
        '/settings.html':        'settings',
    };

    const EMPLOYER_ROOT_ROUTES = {
        '/main.html': 'main',
    };

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

    function isEmployerPath() {
        return window.location.pathname.startsWith('/employer/');
    }

    // Определяем, какую панель показывать: по пути или по роли из localStorage.
    // Это позволяет работодателю видеть «свою» панель и на /main.html.
    function resolveNavKind() {
        if (isEmployerPath()) return 'employer';
        try {
            const user = JSON.parse(localStorage.getItem('fsp.user') || 'null');
            if (user?.role === 'employer') return 'employer';
        } catch (_) {}
        return 'employee';
    }

    function getActiveKey(activeKey) {
        const kind = resolveNavKind();

        if (activeKey) {
            return kind === 'employer'
                ? (EMPLOYER_KEYS[activeKey] || activeKey)
                : activeKey;
        }

        const path = window.location.pathname.replace(/\/+$/, '') || '/';

        if (kind === 'employer') {
            return EMPLOYER_ROOT_ROUTES[path] || '';
        }
        return EMPLOYEE_ROUTES[path] || '';
    }

    function markActive(nav, activeKey) {
        if (!nav) return;

        const key = getActiveKey(activeKey);

        nav.querySelectorAll('.navbar__link').forEach(link => {
            const active = Boolean(key && link.dataset.nav === key);
            link.classList.toggle('is-active', active);

            if (active) {
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
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
                ['fsp.access', 'fsp.refresh', 'fsp.user']
                    .forEach(key => localStorage.removeItem(key));
                sessionStorage.clear();
                window.location.href = '/';
            }
        });
    }

    async function loadEmployeeEmail(nav) {
        const emailNode = nav?.querySelector('#navbar-email');
        if (!emailNode) return;

        try {
            const user = JSON.parse(localStorage.getItem('fsp.user') || 'null');
            emailNode.textContent = user?.email || user?.profile?.email || '';
        } catch (_) {}

        const token = localStorage.getItem('fsp.access');
        if (!token) return;

        try {
            const response = await fetch('/api/v1/profile/me', {
                headers: { Authorization: 'Bearer ' + token },
                credentials: 'same-origin',
            });
            if (!response.ok) return;

            const data = await response.json();
            const email =
                data?.profile?.email ||
                data?.user?.email    ||
                data?.email;

            if (email) {
                emailNode.textContent = email;
                const user = JSON.parse(localStorage.getItem('fsp.user') || '{}');
                user.email = email;
                localStorage.setItem('fsp.user', JSON.stringify(user));
            }
        } catch (error) {
            console.warn('[FSP] Не удалось загрузить почту:', error);
        }
    }

    async function mount(activeKey) {
        const kind = resolveNavKind();
        const url  = kind === 'employer' ? EMPLOYER_NAV_URL : EMPLOYEE_NAV_URL;

        let nav = document.querySelector('header.navbar');

        // Если уже вставлена панель «не той» роли — заменяем.
        if (nav && nav.dataset.navbarState !== kind &&
            (kind === 'employer' || nav.dataset.navbarState === 'employer')) {
            nav.remove();
            nav = null;
        }

        if (!nav) {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(
                    'Не удалось загрузить ' + url + ': HTTP ' + response.status
                );
            }

            const html = await response.text();
            const template = document.createElement('template');
            template.innerHTML = html.trim();
            nav = template.content.querySelector('header.navbar');

            if (!nav) {
                throw new Error('В файле навигации не найден header.navbar');
            }

            nav.dataset.navbarState = kind;
            document.body.insertBefore(nav, document.body.firstChild);
        }

        markActive(nav, activeKey);
        bindLogout(nav);

        if (kind === 'employer') {
            const userNode = nav.querySelector('#navbar-user');
            try {
                const user = JSON.parse(localStorage.getItem('fsp.user') || 'null');
                if (userNode) userNode.textContent = user?.email || '';
            } catch (_) {}
        } else {
            loadEmployeeEmail(nav);
        }

        return nav;
    }

    // Экспортируем для mountShell() из /employer/employer.js
    window.FSPNavbar = { mount };

    // Автозагрузка для всех страниц, кроме /employer/*
    // (там панель монтирует mountShell).
    if (!isEmployerPath()) {
        const start = () => {
            mount().catch(error => {
                console.error('[FSP] Ошибка загрузки навигации:', error);
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }
})();