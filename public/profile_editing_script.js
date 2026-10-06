/**
 * ФСП · Платформа ИТ-вакансий — логика формы подтверждения.
 *
 * Договорённости с HTML:
 *   • <input id="phone"> — маска телефона.
 *   • <div class="multi-select" data-multi-select="..." data-name="...">
 *       с одной готовой .multi-select__row внутри (шаблон строки).
 *
 * Скрипт ничего не хардкодит: находит мультивыборы по [data-multi-select],
 * список опций берёт из первого <select> внутри контейнера,
 * а ширину каждого <select> подгоняет под выбранный пункт.
 */
document.addEventListener('DOMContentLoaded', () => {
    initPhoneMask('phone');
    document.querySelectorAll('[data-multi-select]').forEach(initMultiSelect);
});

/* ============================================================
   1. Маска телефона
   ============================================================ */

function initPhoneMask(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.addEventListener('input', () => {
        const atEnd = input.selectionStart === input.value.length;
        input.value = formatRuPhone(input.value);
        if (atEnd) {
            input.selectionStart = input.selectionEnd = input.value.length;
        }
    });

    input.addEventListener('focus', () => {
        if (!input.value) input.value = '+7 (';
    });

    input.addEventListener('blur', () => {
        if (input.value === '+7 (' || input.value === '+7') {
            input.value = '';
        }
    });
}

function formatRuPhone(raw) {
    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';

    if (digits[0] === '8') digits = '7' + digits.slice(1);
    if (digits[0] !== '7') digits = '7' + digits;

    digits = digits.slice(0, 11);

    let out = '+7';
    if (digits.length > 1) out += ' (' + digits.slice(1, 4);
    if (digits.length >= 5) out += ') ' + digits.slice(4, 7);
    if (digits.length >= 8) out += '-' + digits.slice(7, 9);
    if (digits.length >= 10) out += '-' + digits.slice(9, 11);
    return out;
}

/* ============================================================
   2. Мультивыбор с автошириной
   ============================================================ */

function initMultiSelect(container) {
    const firstRow = container.querySelector('.multi-select__row');
    if (!firstRow) return;

    const templateSelect = firstRow.querySelector('select');
    if (!templateSelect) return;

    const optionsHTML = templateSelect.innerHTML;
    const fieldName   = templateSelect.getAttribute('name') || 'items[]';

    // Подгоняем ширину первой строки и при каждом изменении.
    container.querySelectorAll('select').forEach(autoSizeSelect);
    refresh(container, { optionsHTML, fieldName });

    container.addEventListener('change', (e) => {
        if (e.target.matches('select')) {
            autoSizeSelect(e.target);
            refresh(container, { optionsHTML, fieldName });
        }
    });

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.multi-select__remove');
        if (!btn) return;
        e.preventDefault();
        const row = btn.closest('.multi-select__row');
        if (row) removeRow(container, row, { optionsHTML, fieldName });
    });
}

function appendRow(container, { optionsHTML, fieldName }) {
    const row = document.createElement('div');
    row.className = 'multi-select__row';

    const select = document.createElement('select');
    select.className = 'multi-select__select';
    select.name = fieldName;
    select.innerHTML = optionsHTML;
    row.appendChild(select);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'multi-select__remove';
    btn.setAttribute('aria-label', 'Удалить');
    btn.title = 'Удалить';
    btn.textContent = '×';
    btn.hidden = true;
    row.appendChild(btn);

    container.appendChild(row);
    autoSizeSelect(select);
    return row;
}

function removeRow(container, row, meta) {
    const rows = container.querySelectorAll('.multi-select__row');
    if (rows.length <= 1) {
        const sel = row.querySelector('select');
        if (sel) {
            sel.value = '';
            autoSizeSelect(sel);
        }
    } else {
        row.remove();
    }
    refresh(container, meta);
}

function syncRemoveButton(row) {
    const sel = row.querySelector('select');
    const btn = row.querySelector('.multi-select__remove');
    if (sel && btn) btn.hidden = !sel.value;
}

function refresh(container, meta) {
    let rows = Array.from(container.querySelectorAll('.multi-select__row'));
    const last = rows[rows.length - 1];
    if (last && last.querySelector('select').value) {
        appendRow(container, meta);
    }

    rows = Array.from(container.querySelectorAll('.multi-select__row'));
    rows.slice(0, -1).forEach((row) => {
        if (!row.querySelector('select').value) row.remove();
    });

    rows = Array.from(container.querySelectorAll('.multi-select__row'));
    const chosen = new Set();
    rows.forEach((row) => {
        const v = row.querySelector('select').value;
        if (v) chosen.add(v);
    });

    rows.forEach((row) => {
        const sel = row.querySelector('select');
        Array.from(sel.options).forEach((opt) => {
            if (!opt.value) return;
            opt.disabled = opt.value !== sel.value && chosen.has(opt.value);
        });
        syncRemoveButton(row);
    });
}

/* ============================================================
   3. Автоширина <select> под выбранный пункт
   ============================================================ */

// Один переиспользуемый скрытый span для замеров.
let _measurer = null;
function getMeasurer() {
    if (_measurer) return _measurer;
    _measurer = document.createElement('span');
    _measurer.setAttribute('aria-hidden', 'true');
    _measurer.style.cssText = [
        'position:absolute',
        'top:-9999px',
        'left:-9999px',
        'visibility:hidden',
        'white-space:pre',
        'pointer-events:none',
    ].join(';');
    document.body.appendChild(_measurer);
    return _measurer;
}

/**
 * Устанавливает <select> ширину по тексту выбранного пункта
 * (или placeholder'а, если ничего не выбрано) с учётом padding,
 * border и места под стрелку.
 */
function autoSizeSelect(select) {
    if (!select) return;

    const option = select.options[select.selectedIndex];
    const text = (option && option.textContent) ? option.textContent : '';

    const measurer = getMeasurer();
    const cs = getComputedStyle(select);

    // Копируем шрифтовые свойства — иначе измерение соврёт.
    measurer.style.fontFamily  = cs.fontFamily;
    measurer.style.fontSize    = cs.fontSize;
    measurer.style.fontWeight  = cs.fontWeight;
    measurer.style.fontStyle   = cs.fontStyle;
    measurer.style.letterSpacing = cs.letterSpacing;
    measurer.style.textTransform = cs.textTransform;
    measurer.textContent = text;

    const textWidth = measurer.getBoundingClientRect().width;

    const padLeft   = parseFloat(cs.paddingLeft)   || 0;
    const padRight  = parseFloat(cs.paddingRight)  || 0;
    const bordLeft  = parseFloat(cs.borderLeftWidth)  || 0;
    const bordRight = parseFloat(cs.borderRightWidth) || 0;

    // Место под стрелку, которую рисуем в CSS (padding-right = 36px уже включён
    // в padRight, но на всякий случай добавим запас).
    const MIN_WIDTH = 160; // чтобы placeholder «— выберите роль —» не сжимался в точку
    const width = Math.max(
        MIN_WIDTH,
        Math.ceil(textWidth + padLeft + padRight + bordLeft + bordRight)
    );

    select.style.width = width + 'px';
}