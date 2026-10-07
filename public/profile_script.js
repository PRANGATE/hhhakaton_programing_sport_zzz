/* ============================================================
   ФСП · Платформа ИТ-вакансий — страница профиля.
   Здесь реализован только экспорт в PDF.
   Маска телефона и мультивыбор относятся к форме создания
   профиля и живут в отдельном файле.
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Безопасные вызовы — если функций на этой странице нет, ничего не упадёт.
    if (typeof initPhoneMask === 'function') {
        initPhoneMask('phone');
    }
    if (typeof initMultiSelect === 'function') {
        document.querySelectorAll('[data-multi-select]').forEach(initMultiSelect);
    }
    initExportPdf('exportPdf');
});

/* ============================================================
   Экспорт профиля в PDF
   ============================================================ */

function initExportPdf(buttonId) {
    const btn = document.getElementById(buttonId);
    console.log('[FSP] exportPdf:', btn);            // диагностика
    if (!btn) return;

    btn.addEventListener('click', () => {
        console.log('[FSP] click, typeof html2pdf =', typeof window.html2pdf);
        runExport(btn);
    });
}

async function runExport(btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Готовим PDF…';
    document.body.classList.add('is-printing');

    try {
        if (typeof window.html2pdf === 'function') {
            const target = document.querySelector('main');
            console.log('[FSP] target:', target);

            await window.html2pdf()
                .set({
                    margin: [10, 10, 12, 10],
                    filename: 'fsp-profile.pdf',
                    image: { type: 'jpeg', quality: 0.95 },
                    html2canvas: {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: null,
                        scrollY: 0,
                    },
                    jsPDF: {
                        unit: 'mm',
                        format: 'a4',
                        orientation: 'portrait',
                    },
                    pagebreak: { mode: ['css', 'legacy'] },
                })
                .from(target)
                .save();

            console.log('[FSP] PDF сохранён');
        } else {
            console.warn('[FSP] html2pdf не загрузился — используем window.print()');
            window.print();
        }
    } catch (err) {
        console.error('[FSP] ошибка экспорта:', err);
        window.print();
    } finally {
        document.body.classList.remove('is-printing');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}