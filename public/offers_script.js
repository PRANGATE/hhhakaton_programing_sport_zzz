(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const TOKEN_KEY = 'fsp.access';

  const STATUS_LABEL = {
    sent: 'Отправлено', viewed: 'Просмотрено',
    accepted: 'Принято', rejected: 'Отклонено',
  };

  async function api(path, opts = {}) {
    const res = await fetch('/api/v1' + path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (localStorage.getItem(TOKEN_KEY) || ''),
        ...(opts.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || 'http_error'), { status: res.status, body });
    return body;
  }

  const fmt = n => Number(n).toLocaleString('ru-RU') + ' ₽';
  const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let items = [];
  let currentId = null;

  function renderList() {
    const el = document.getElementById('offersList');
    el.innerHTML = '';
    items.forEach(o => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'offer-card offer-card--' + o.status;
      if (o.id === currentId) card.classList.add('is-active');
      card.innerHTML = `
        <span class="offer-card__company">${escapeHtml(o.employer_company || o.employer_email || 'Компания')}</span>
        <span class="offer-card__position">${escapeHtml(o.vacancy_title || 'Без привязки к вакансии')}</span>
        <span class="offer-card__meta">
          <span class="offer-card__salary">${fmt(o.salary_from)} – ${fmt(o.salary_to)}</span>
          <span class="status status--${o.status}">${STATUS_LABEL[o.status]}</span>
        </span>`;
      card.addEventListener('click', () => selectOffer(o.id));
      el.appendChild(card);
    });
  }

  function renderDetail() {
    const detailEl = document.getElementById('offersDetail');
    const o = items.find(x => x.id === currentId);
    if (!o) {
      detailEl.innerHTML = '<div class="offers__empty">Выберите предложение слева.</div>';
      return;
    }
    const isFinal = ['accepted','rejected'].includes(o.status);
    const contact = o.status === 'accepted'
      ? `<a class="offer-detail__contact" href="${o.contact_telegram ? 'https://t.me/' + o.contact_telegram.replace(/^@/, '') : 'mailto:' + (o.contact_email || o.employer_email || '')}">
           ${escapeHtml(o.contact_telegram || o.contact_email || o.employer_email || '—')}
         </a>`
      : `<div style="color:var(--muted); font-size:13px">🔒 Раскроется после «Принять»</div>`;

    detailEl.innerHTML = `
      <div class="offer-detail__head">
        <div>
          <h2 class="offer-detail__company">${escapeHtml(o.employer_company || o.employer_email || 'Компания')}</h2>
          <p class="offer-detail__position">${escapeHtml(o.vacancy_title || 'Приглашение без привязки к вакансии')}</p>
        </div>
        <div>
          <p class="offer-detail__salary">${fmt(o.salary_from)} – ${fmt(o.salary_to)}</p>
          <p style="margin:6px 0 0; text-align:right;">
            <span class="status status--${o.status}">${STATUS_LABEL[o.status]}</span>
          </p>
        </div>
      </div>
      <div class="offer-detail__section">
        <span class="offer-detail__label">Описание предложения</span>
        <p class="offer-detail__text">${escapeHtml(o.offer || '')}</p>
      </div>
      <div class="offer-detail__section">
        <span class="offer-detail__label">Контакт работодателя</span>
        ${contact}
      </div>
      <div class="offer-detail__actions">
        <button type="button" class="btn-reject" id="rejectOffer" ${isFinal ? 'disabled' : ''}>Отклонить</button>
        <button type="button" class="btn-accept" id="acceptOffer" ${isFinal ? 'disabled' : ''}>Принять</button>
      </div>`;

    const acc = detailEl.querySelector('#acceptOffer');
    const rej = detailEl.querySelector('#rejectOffer');
    if (acc) acc.addEventListener('click', () => setStatus('accepted'));
    if (rej) rej.addEventListener('click', () => setStatus('rejected'));
  }

  async function selectOffer(id) {
    currentId = id;
    // Открытие «sent» → на бэке переводится в «viewed»
    try {
      const { invitation } = await api('/invitations/' + id);
      const i = items.findIndex(x => x.id === id);
      if (i >= 0) items[i] = { ...items[i], ...invitation };
    } catch (err) { console.warn(err); }
    renderList();
    renderDetail();
  }

  async function setStatus(status) {
    try {
      const { invitation } = await api('/invitations/' + currentId + '/status', {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      const i = items.findIndex(x => x.id === currentId);
      if (i >= 0) items[i] = { ...items[i], ...invitation };
      renderList(); renderDetail();
    } catch (err) { alert('Не удалось: ' + err.message); }
  }

  async function init() {
    if (!localStorage.getItem(TOKEN_KEY)) { location.href = '/'; return; }
    const el = document.getElementById('offersList');
    try {
      const { items: got } = await api('/invitations');
      items = got;
      if (items.length) currentId = items[0].id;
      renderList();
      renderDetail();
    } catch (err) {
      el.innerHTML = `<div class="offers__empty">Ошибка: ${escapeHtml(err.message)}</div>`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();