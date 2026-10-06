/* ============================================================
   ФСП · Платформа ИТ-вакансий — страница объявлений
   Файл: /jobs_script.js

   Сейчас данные захардкожены в JOBS (имитация ответа БД).
   Когда появится API — замените константу на fetch к серверу.
   ============================================================ */

(function () {

    /* ---------- Заглушка «базы данных» ---------- */

    const JOBS = [
        {
            id: 'jb-001',
            company: 'Тинькофф',
            position: 'Backend-разработчик (Java)',
            salaryFrom: 300000,
            salaryTo: 420000,
            status: 'open',
            description:
                'Разработка сервисов кредитного конвейера. Стек: Java 17, ' +
                'Spring Boot, PostgreSQL, Kafka. Команда из 8 человек, ' +
                'гибкий график, полностью удалённая работа. Ожидаем опыт ' +
                'промышленной разработки от 3 лет.',
            contact: {
                label: 'hr@tinkoff.ru',
                href: 'mailto:hr@tinkoff.ru',
            },
        },
        {
            id: 'jb-002',
            company: 'Wildberries',
            position: 'Frontend-разработчик (React)',
            salaryFrom: 250000,
            salaryTo: 350000,
            status: 'applied',
            description:
                'Разработка интерфейсов личного кабинета продавца. React 18, ' +
                'TypeScript, Redux Toolkit, Vite. Работа в кросс-функциональной ' +
                'команде, регулярные релизы, код-ревью. Ждём уверенное знание ' +
                'React и опыт от 2 лет.',
            contact: {
                label: 'https://t.me/wb_hr_tech',
                href: 'https://t.me/wb_hr_tech',
            },
        },
        {
            id: 'jb-003',
            company: 'Авито',
            position: 'Data Engineer',
            salaryFrom: 320000,
            salaryTo: 450000,
            status: 'open',
            description:
                'Построение и поддержка пайплайнов данных. Python, Airflow, ' +
                'Spark, ClickHouse, Kafka. Работа с продуктовыми командами, ' +
                'проектирование DWH, оптимизация тяжёлых запросов. ' +
                'Опыт от 3 лет в Data Engineering.',
            contact: {
                label: 'data-jobs@avito.ru',
                href: 'mailto:data-jobs@avito.ru',
            },
        },
        {
            id: 'jb-004',
            company: 'Сбер',
            position: 'iOS-разработчик (Swift)',
            salaryFrom: 280000,
            salaryTo: 400000,
            status: 'applied',
            description:
                'Разработка мобильного приложения СберБанк Онлайн. Swift, ' +
                'SwiftUI, Combine, модульная архитектура. Крупная команда, ' +
                'выстроенные процессы, внутренние библиотеки. Ожидаем опыт ' +
                'коммерческой iOS-разработки от 3 лет.',
            contact: {
                label: 'ios-hr@sber.ru',
                href: 'mailto:ios-hr@sber.ru',
            },
        },
    ];

    /* ---------- Словарь статусов ---------- */

    const STATUS_LABELS = {
        open:    'Откликнуться',
        applied: 'Отклик отправлен',
    };

    /* ---------- Состояние страницы ---------- */

    let currentId = null;

    /* ---------- Утилиты ---------- */

    function formatSalary(from, to) {
        const fmt = (n) => n.toLocaleString('ru-RU') + ' ₽';
        return fmt(from) + ' – ' + fmt(to);
    }

    function getJob(id) {
        return JOBS.find((j) => j.id === id) || null;
    }

    /* ---------- Рендер левого списка ---------- */

    function renderList(listEl) {
        listEl.innerHTML = '';

        JOBS.forEach((job) => {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'job-card job-card--' + job.status;
            card.dataset.jobId = job.id;

            if (job.id === currentId) card.classList.add('is-active');

            card.innerHTML = `
                <span class="job-card__company">${escapeHtml(job.company)}</span>
                <span class="job-card__position">${escapeHtml(job.position)}</span>
                <span class="job-card__meta">
                    <span class="job-card__salary">${escapeHtml(formatSalary(job.salaryFrom, job.salaryTo))}</span>
                    <span class="status status--${job.status}">${STATUS_LABELS[job.status]}</span>
                </span>
            `;

            card.addEventListener('click', () => selectJob(job.id));
            listEl.appendChild(card);
        });
    }

    /* ---------- Рендер правой панели ---------- */

    function renderDetail(detailEl) {
        const job = getJob(currentId);

        if (!job) {
            detailEl.innerHTML =
                '<div class="jobs__empty">Выберите объявление слева, чтобы увидеть детали.</div>';
            return;
        }

        const isApplied = job.status === 'applied';

        detailEl.innerHTML = `
            <div class="job-detail__head">
                <div>
                    <h2 class="job-detail__company">${escapeHtml(job.company)}</h2>
                    <p class="job-detail__position">${escapeHtml(job.position)}</p>
                </div>
                <div>
                    <p class="job-detail__salary">${escapeHtml(formatSalary(job.salaryFrom, job.salaryTo))}</p>
                    <p class="job-detail__status-wrap">
                        <span class="status status--${job.status}">${STATUS_LABELS[job.status]}</span>
                    </p>
                </div>
            </div>

            <div class="job-detail__section">
                <span class="job-detail__label">Описание вакансии</span>
                <p class="job-detail__text">${escapeHtml(job.description)}</p>
            </div>

            <div class="job-detail__section">
                <span class="job-detail__label">Связь с работодателем</span>
                <a class="job-detail__contact" href="${escapeAttr(job.contact.href)}">
                    ${escapeHtml(job.contact.label)}
                </a>
            </div>

            <div class="job-detail__actions">
                <button type="button" class="btn-apply" id="applyJob" ${isApplied ? 'disabled' : ''}>
                    ${isApplied ? 'Отклик отправлен' : 'Откликнуться'}
                </button>
            </div>
        `;

        const applyBtn = detailEl.querySelector('#applyJob');
        if (applyBtn) applyBtn.addEventListener('click', () => handleApply(job.id));
    }

    /* ---------- Логика выбора ---------- */

    function selectJob(id) {
        currentId = id;
        renderList(document.getElementById('jobsList'));
        renderDetail(document.getElementById('jobsDetail'));
    }

    /* ---------- Обработчик кнопки (заглушка) ---------- */

    function handleApply(id) {
        // TODO: заменить на fetch('/api/jobs/' + id + '/apply', { method: 'POST' })
        const job = getJob(id);
        if (!job || job.status === 'applied') return;

        job.status = 'applied';
        console.log('[FSP] application sent for job:', id);

        renderList(document.getElementById('jobsList'));
        renderDetail(document.getElementById('jobsDetail'));
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
        const listEl   = document.getElementById('jobsList');
        const detailEl = document.getElementById('jobsDetail');
        if (!listEl || !detailEl) return;

        currentId = JOBS.length ? JOBS[0].id : null;

        renderList(listEl);
        renderDetail(detailEl);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();