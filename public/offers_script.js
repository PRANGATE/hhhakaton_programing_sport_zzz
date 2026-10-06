/* ============================================================
   ФСП · Платформа ИТ-вакансий — страница предложений
   Файл: /offers_script.js

   Сейчас данные захардкожены в OFFERS (имитация ответа БД).
   Когда появится API — замените константу на fetch к серверу.
   ============================================================ */

(function () {

    /* ---------- Заглушка «базы данных» ---------- */

    const OFFERS = [
        {
            id: 'of-001',
            company: 'Яндекс',
            position: 'Senior Backend-разработчик (Go)',
            salaryFrom: 350000,
            salaryTo: 450000,
            status: 'sent',
            description:
                'Команда Поиска ищет инженера в сервис ранжирования. ' +
                'Вы будете проектировать высоконагруженные сервисы на Go, ' +
                'работать с распределёнными хранилищами и участвовать в развитии ' +
                'внутренней платформы. Ожидаем опыт от 5 лет, глубокое знание ' +
                'протоколов HTTP/2, gRPC и практику с очередями (Kafka).',
            contact: {
                label: 'hr@yandex-team.ru',
                href: 'mailto:hr@yandex-team.ru',
            },
        },
        {
            id: 'of-002',
            company: 'Сбер',
            position: 'Team Lead Python',
            salaryFrom: 400000,
            salaryTo: 500000,
            status: 'viewed',
            description:
                'В команду платформы кредитных продуктов требуется тимлид. ' +
                'В зоне ответственности — команда из 6 инженеров, развитие ' +
                'сервисов на FastAPI, миграция на Kubernetes, менторство и ' +
                'найм. Ждём опыт управления командой от 2 лет и уверенный Python.',
            contact: {
                label: 'https://t.me/sber_hr',
                href: 'https://t.me/sber_hr',
            },
        },
        {
            id: 'of-003',
            company: 'Ozon Tech',
            position: 'Fullstack-разработчик (TypeScript)',
            salaryFrom: 280000,
            salaryTo: 380000,
            status: 'accepted',
            description:
                'Разработка личного кабинета продавца: React + Node.js/NestJS, ' +
                'GraphQL, PostgreSQL. Работа в продуктовой команде, плотное ' +
                'взаимодействие с дизайном и продакт-менеджером. ' +
                'Мы ценим аккуратность, тестируемость и прозрачную архитектуру.',
            contact: {
                label: 'jobs@ozon.ru',
                href: 'mailto:jobs@ozon.ru',
            },
        },
        {
            id: 'of-004',
            company: 'VK',
            position: 'DevOps / SRE Engineer',
            salaryFrom: 300000,
            salaryTo: 420000,
            status: 'rejected',
            description:
                'Поддержка и развитие инфраструктуры одного из продуктов VK. ' +
                'Kubernetes, Terraform, Ansible, мониторинг Prometheus/Grafana, ' +
                'дежурства. Ожидаем опыт промышленной эксплуатации K8s-кластеров ' +
                'и автоматизации через IaC.',
            contact: {
                label: 'https://t.me/vk_devops',
                href: 'https://t.me/vk_devops',
            },
        },
    ];

    /* ---------- Словарь статусов ---------- */

    const STATUS_LABELS = {
        sent:     'Отправлено',
        viewed:   'Просмотрено',
        accepted: 'Принято',
        rejected: 'Отклонено',
    };

    /* ---------- Состояние страницы ---------- */

    let currentId = null;

    /* ---------- Утилиты ---------- */

    function formatSalary(from, to) {
        const fmt = (n) => n.toLocaleString('ru-RU') + ' ₽';
        return fmt(from) + ' – ' + fmt(to);
    }

    function getOffer(id) {
        return OFFERS.find((o) => o.id === id) || null;
    }

    /* ---------- Рендер левого списка ---------- */

    function renderList(listEl) {
        listEl.innerHTML = '';

        OFFERS.forEach((offer) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'offer-card offer-card--' + offer.status;
            card.dataset.offerId = offer.id;

            if (offer.id === currentId) card.classList.add('is-active');

            card.innerHTML = `
                <span class="offer-card__company">${escapeHtml(offer.company)}</span>
                <span class="offer-card__position">${escapeHtml(offer.position)}</span>
                <span class="offer-card__meta">
                    <span class="offer-card__salary">${escapeHtml(formatSalary(offer.salaryFrom, offer.salaryTo))}</span>
                    <span class="status status--${offer.status}">${STATUS_LABELS[offer.status]}</span>
                </span>
            `;

            card.addEventListener('click', () => selectOffer(offer.id));
            listEl.appendChild(card);
        });
    }

    /* ---------- Рендер правой панели ---------- */

    function renderDetail(detailEl) {
        const offer = getOffer(currentId);

        if (!offer) {
            detailEl.innerHTML =
                '<div class="offers__empty">Выберите предложение слева, чтобы увидеть детали.</div>';
            return;
        }

        const isFinal = offer.status === 'accepted' || offer.status === 'rejected';

        detailEl.innerHTML = `
            <div class="offer-detail__head">
                <div>
                    <h2 class="offer-detail__company">${escapeHtml(offer.company)}</h2>
                    <p class="offer-detail__position">${escapeHtml(offer.position)}</p>
                </div>
                <div>
                    <p class="offer-detail__salary">${escapeHtml(formatSalary(offer.salaryFrom, offer.salaryTo))}</p>
                    <p style="margin:6px 0 0;text-align:right;">
                        <span class="status status--${offer.status}">${STATUS_LABELS[offer.status]}</span>
                    </p>
                </div>
            </div>

            <div class="offer-detail__section">
                <span class="offer-detail__label">Описание предложения</span>
                <p class="offer-detail__text">${escapeHtml(offer.description)}</p>
            </div>

            <div class="offer-detail__section">
                <span class="offer-detail__label">Связь с работодателем</span>
                <a class="offer-detail__contact" href="${escapeAttr(offer.contact.href)}">
                    ${escapeHtml(offer.contact.label)}
                </a>
            </div>

            <div class="offer-detail__actions">
                <button type="button" class="btn-reject" id="rejectOffer" ${isFinal ? 'disabled' : ''}>
                    Отклонить
                </button>
                <button type="button" class="btn-accept" id="acceptOffer" ${isFinal ? 'disabled' : ''}>
                    Принять
                </button>
            </div>
        `;

        const acceptBtn = detailEl.querySelector('#acceptOffer');
        const rejectBtn = detailEl.querySelector('#rejectOffer');

        if (acceptBtn) acceptBtn.addEventListener('click', () => handleAccept(offer.id));
        if (rejectBtn) rejectBtn.addEventListener('click', () => handleReject(offer.id));
    }

    /* ---------- Логика выбора ---------- */

    function selectOffer(id) {
        currentId = id;
        const offer = getOffer(id);

        // При открытии «отправленного» — переводим в «просмотрено»,
        // как это обычно делает бэкенд при первом чтении.
        if (offer && offer.status === 'sent') {
            offer.status = 'viewed';
        }

        renderList(document.getElementById('offersList'));
        renderDetail(document.getElementById('offersDetail'));
    }

    /* ---------- Обработчики кнопок (заглушки) ---------- */

    function handleAccept(id) {
        // TODO: заменить на fetch('/api/offers/' + id + '/accept', { method: 'POST' })
        const offer = getOffer(id);
        if (!offer) return;

        offer.status = 'accepted';
        console.log('[FSP] offer accepted:', id);

        renderList(document.getElementById('offersList'));
        renderDetail(document.getElementById('offersDetail'));
    }

    function handleReject(id) {
        // TODO: заменить на fetch('/api/offers/' + id + '/reject', { method: 'POST' })
        const offer = getOffer(id);
        if (!offer) return;

        offer.status = 'rejected';
        console.log('[FSP] offer rejected:', id);

        renderList(document.getElementById('offersList'));
        renderDetail(document.getElementById('offersDetail'));
    }

    /* ---------- Мелкие экранирования ---------- */

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(str) {
        return escapeHtml(str);
    }

    /* ---------- Инициализация ---------- */

    function init() {
        const listEl   = document.getElementById('offersList');
        const detailEl = document.getElementById('offersDetail');
        if (!listEl || !detailEl) return;

        // Автовыбор первого предложения — чтобы правая панель не пустовала.
        currentId = OFFERS.length ? OFFERS[0].id : null;

        // Сразу помечаем первое как просмотренное (как будто его открыли).
        if (currentId) {
            const first = getOffer(currentId);
            if (first && first.status === 'sent') first.status = 'viewed';
        }

        renderList(listEl);
        renderDetail(detailEl);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();