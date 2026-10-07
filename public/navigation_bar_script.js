/* ============================================================
   ФСП · Верхняя панель навигации
   Файл: /navigation_bar.js

   Подгружает /navigation_bar.html и вставляет в начало <body>,
   затем помечает активный пункт классом .is-active.
   ============================================================ */

(function () {
    const NAVBAR_URL = '/navigation_bar.html';

    // Карта «адрес страницы → ключ пункта меню».
    // Ключ совпадает с data-nav в navbar.html.
    const ROUTE_TO_NAV = {
        '/profile.html':         'profile',
        '/profile_editing.html': 'profile',
        '/testing.html':         'testing',
        '/jobs.html':            'jobs',
        '/offers.html':          'offers',
        '/settings.html':        'settings',
    };

    function currentPath() {
        return window.location.pathname.replace(/\/+$/, '') || '/';
    }

    function markActive(root) {
        const key = ROUTE_TO_NAV[currentPath()];
        if (!key) return;

        const link = root.querySelector('.navbar__link[data-nav="' + key + '"]');
        if (link) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'page');
        }
    }

    async function mount() {
        // Не монтируем стандартный навбар в кабинете работодателя —
        // там свой (emp-nav, см. /employer/employer.js).
        if (location.pathname.startsWith('/employer/')) return;

        if (document.querySelector('.navbar')) { markActive(document); return; }

        try {
            const res = await fetch(NAVBAR_URL, { credentials: 'same-origin' });
            if (!res.ok) throw new Error('HTTP ' + res.status);

            const html = await res.text();

            const tpl = document.createElement('template');
            tpl.innerHTML = html.trim();
            const node = tpl.content.firstElementChild;
            if (!node) throw new Error('navbar.html пустой или без корневого элемента');

            // Вставляем в начало <body> — до основного контента.
            document.body.insertBefore(node, document.body.firstChild);

            markActive(node);
        } catch (err) {
            // В консоли будет видно причину. Чаще всего: file:// или неверный путь.
            console.error('[FSP] не удалось загрузить верхнюю панель:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();