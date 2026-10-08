/* ФСП · общий загрузчик верхней панели. */
(function () {
    const NORMAL_NAVBAR_URL = '/navigation_bar.html';
    const EMPLOYER_NAVBAR_URL = '/navigation_bar_employer.html';

    const ROUTE_TO_NAV = {
        '/profile.html': 'profile',
        '/profile_editing.html': 'profile',
        '/testing.html': 'testing',
        '/jobs.html': 'jobs',
        '/offers.html': 'offers',
        '/settings.html': 'settings',
        '/employer/candidate.html': 'candidates',
        '/employer/candidates.html': 'candidates',
        '/employer/invitations.html': 'invitations',
        '/employer/invite.html': 'invitations',
        '/employer/matching.html': 'matching',
        '/employer/needs.html': 'needs',
        '/employer/profile.html': 'profile-company'
    };

    function currentPath() {
        return window.location.pathname.replace(/\/+$/, '') || '/';
    }

    function isEmployerPage() {
        return currentPath().startsWith('/employer/');
    }

    function markActive(root) {
        const key = ROUTE_TO_NAV[currentPath()];
        if (!key || !root) return;
        root.querySelectorAll('.navbar__link.is-active').forEach(link => {
            link.classList.remove('is-active');
            link.removeAttribute('aria-current');
        });
        const link = root.querySelector('.navbar__link[data-nav="' + key + '"]');
        if (link) {
            link.classList.add('is-active');
            link.setAttribute('aria-current', 'page');
        }
    }

    async function mountImpl() {
        const existing = document.querySelector('.navbar');
        if (existing) {
            markActive(existing);
            return existing;
        }

        const url = isEmployerPage() ? EMPLOYER_NAVBAR_URL : NORMAL_NAVBAR_URL;

        try {
            const res = await fetch(url, { credentials: 'same-origin', cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status + ' при загрузке ' + url);
            const html = await res.text();
            const tpl = document.createElement('template');
            tpl.innerHTML = html.trim();
            const node = tpl.content.firstElementChild;
            if (!node || !node.classList.contains('navbar')) {
                throw new Error(url + ' не содержит .navbar');
            }

            const race = document.querySelector('.navbar');
            if (race) {
                markActive(race);
                return race;
            }

            document.body.insertBefore(node, document.body.firstChild);
            markActive(node);
            return node;
        } catch (err) {
            console.error('[FSP] Не удалось загрузить верхнюю панель:', err);
            return null;
        }
    }

    function mount() {
        if (!window.FSPNavbarMountPromise) {
            window.FSPNavbarMountPromise = mountImpl();
        }
        return window.FSPNavbarMountPromise;
    }

    window.FSPNavbar = { mount };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
})();
