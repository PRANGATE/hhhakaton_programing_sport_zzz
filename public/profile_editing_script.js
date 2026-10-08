/**
 * ФСП · Платформа ИТ-вакансий — логика формы подтверждения профиля.
 *
 * Договорённости с HTML:
 *   • <input id="phone"> — маска телефона.
 *   • <div class="multi-select" data-multi-select="..." data-name="...">
 *       с одной готовой .multi-select__row внутри (шаблон строки).
 *
 * Скрипт ничего не хардкодит: находит мультивыборы по [data-multi-select],
 * список опций берёт из первого <select> внутри контейнера,
 * а ширину каждого <select> подгоняет под выбранный пункт.
 *
 * Плюс: при загрузке страницы тянет профиль из /api/v1/profile/me,
 * предзаполняет поля, а по кнопке «Сохранить профиль» отправляет PATCH.
 */

const TOKEN_KEY = 'fsp.access';

document.addEventListener('DOMContentLoaded', () => {
    initPhoneMask('phone');
    document.querySelectorAll('[data-multi-select]').forEach(initMultiSelect);

    const saveBtn   = document.getElementById('saveProfile');
    const cancelBtn = document.getElementById('cancelProfile');

    if (saveBtn) saveBtn.addEventListener('click', saveProfile);

    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        const dirty = ['lastName','firstName','middleName','telegram','phone','about','experience']
            .some(id => {
                const el = document.getElementById(id);
                return el && el.value !== el.defaultValue;
            });
        if (dirty && !confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
        location.href = '/profile.html';
    });

    loadForEdit();
});

/* ============================================================
   API-хелпер
   ============================================================ */

async function api(path, opts = {}) {
    const res = await fetch('/api/v1' + path, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + (localStorage.getItem(TOKEN_KEY) || ''),
            ...(opts.headers || {}),
        },
    });
    if (res.status === 401) {
        localStorage.removeItem('fsp.access');
        localStorage.removeItem('fsp.refresh');
        localStorage.removeItem('fsp.user');
        sessionStorage.clear();
        location.href = '/';
        throw new Error('unauthorized');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
    return body;
}

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

function autoSizeSelect(select) {
    if (!select) return;

    const option = select.options[select.selectedIndex];
    const text = (option && option.textContent) ? option.textContent : '';

    const measurer = getMeasurer();
    const cs = getComputedStyle(select);

    measurer.style.fontFamily     = cs.fontFamily;
    measurer.style.fontSize       = cs.fontSize;
    measurer.style.fontWeight     = cs.fontWeight;
    measurer.style.fontStyle      = cs.fontStyle;
    measurer.style.letterSpacing  = cs.letterSpacing;
    measurer.style.textTransform  = cs.textTransform;
    measurer.textContent = text;

    const textWidth = measurer.getBoundingClientRect().width;

    const padLeft   = parseFloat(cs.paddingLeft)   || 0;
    const padRight  = parseFloat(cs.paddingRight)  || 0;
    const bordLeft  = parseFloat(cs.borderLeftWidth)  || 0;
    const bordRight = parseFloat(cs.borderRightWidth) || 0;

    const MIN_WIDTH = 160;
    const width = Math.max(
        MIN_WIDTH,
        Math.ceil(textWidth + padLeft + padRight + bordLeft + bordRight)
    );

    select.style.width = width + 'px';
}

/* ============================================================
   4. Загрузка профиля и предзаполнение формы
   ============================================================ */

function splitName(full) {
    const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    return {
        lastName:   parts[0] || '',
        firstName:  parts[1] || '',
        middleName: parts.slice(2).join(' '),
    };
}

function setVal(id, v) {
    const el = document.getElementById(id);
    if (!el) return;
    const val = v == null ? '' : String(v);
    el.value = val;
    el.defaultValue = val;   // важно для проверки dirty
}

async function loadForEdit() {
    try {
        const resp = await api('/profile/me');
        console.log('[FSP] profile response:', resp);

        const profile = resp?.profile;
        if (!profile) {
            console.warn('[FSP] profile is empty, ничего не заполняем');
            return;
        }

        console.log('[FSP] email =', profile.email);

        const { lastName, firstName, middleName } = splitName(profile.full_name);
        setVal('lastName',   lastName);
        setVal('firstName',  firstName);
        setVal('middleName', middleName);
        setVal('email',      profile.email || '');

        if (profile.telegram) {
            const handle = String(profile.telegram)
                .replace(/^https?:\/\/t\.me\//i, '')
                .replace(/^@/, '');
            setVal('telegram', '@' + handle);
        } else {
            setVal('telegram', '');
        }

        setVal('phone',      profile.phone || '');
        setVal('experience', profile.experience_years != null ? profile.experience_years : '');
        setVal('about',      profile.about || '');

        fillMultiSelect('roles',  profile.roles  || []);
        fillMultiSelect('stacks', profile.stacks || []);
    } catch (err) {
        console.error('[FSP] load profile failed', err);
    }
}

/**
 * Заполняет конкретный мультивыбор выбранными значениями из профиля.
 * Полностью перестраивает строки, чтобы не сбить нумерацию.
 */
function fillMultiSelect(kind, items) {
    const container = document.querySelector(`[data-multi-select="${kind}"]`);
    if (!container) return;

    const templateSelect = container.querySelector('select');
    if (!templateSelect) return;
    const optionsHTML = templateSelect.innerHTML;
    const fieldName   = templateSelect.getAttribute('name') || `${kind}[]`;

    // Очищаем контейнер, оставляя только что пересозданные строки.
    container.innerHTML = '';

    // Всегда есть хотя бы одна пустая строка-приглашение.
    const values = Array.isArray(items) && items.length ? items : [''];

    values.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'multi-select__row';

        const sel = document.createElement('select');
        sel.className = 'multi-select__select';
        sel.name = fieldName;
        sel.innerHTML = optionsHTML;
        sel.value = typeof it === 'string' ? it : (it.id || '');
        row.appendChild(sel);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'multi-select__remove';
        btn.setAttribute('aria-label', 'Удалить');
        btn.title = 'Удалить';
        btn.textContent = '×';
        btn.hidden = !sel.value;
        row.appendChild(btn);

        container.appendChild(row);
        autoSizeSelect(sel);
    });

    // refresh добавит пустую строку, если последняя заполнена,
    // выставит disabled на выбранные пункты и покажет/скроет кнопки.
    refresh(container, { optionsHTML, fieldName });
}

/* ============================================================
   5. Чтение и сохранение
   ============================================================ */

function readMulti(kind) {
    const container = document.querySelector(`[data-multi-select="${kind}"]`);
    if (!container) return [];
    const out = [];
    container.querySelectorAll('select').forEach(sel => {
        const v = sel.value;
        if (!v) return;
        const opt = sel.options[sel.selectedIndex];
        out.push({ id: v, name: opt ? opt.textContent.trim() : v });
    });
    return out;
}

function normalizeTelegram(raw) {
    let v = String(raw || '').trim();
    if (!v) return '';
    v = v.replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
    return v ? '@' + v : '';
}

async function saveProfile() {
    const btn = document.getElementById('saveProfile');
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Сохраняем…';

    try {
        const fullName = [
            document.getElementById('lastName').value,
            document.getElementById('firstName').value,
            document.getElementById('middleName').value,
        ].map(s => String(s || '').trim()).filter(Boolean).join(' ');

        const expRaw = document.getElementById('experience').value;
        const exp = expRaw === '' ? null : Number(expRaw);

        const payload = {};

        if (fullName)          payload.full_name = fullName;

        const tg = normalizeTelegram(document.getElementById('telegram').value);
        if (tg)                payload.telegram = tg;

        const ph = document.getElementById('phone').value.trim();
        if (ph)                payload.phone = ph;

        const about = document.getElementById('about').value.trim();
        if (about)             payload.about = about;

        if (exp != null && Number.isFinite(exp)) payload.experience_years = exp;

        payload.roles  = readMulti('roles');
        payload.stacks = readMulti('stacks');

        await api('/profile/me', {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });

        location.href = '/profile.html';
    } catch (err) {
        btn.disabled = false;
        btn.textContent = orig;
        const msg = err.body?.details?.[0]?.message
                 || err.body?.error
                 || err.message;
        alert('Не удалось сохранить: ' + msg);
    }
}