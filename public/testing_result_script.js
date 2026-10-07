(function () {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el = document.getElementById('result');

  const raw = sessionStorage.getItem('fsp.result');
  if (!raw) { el.innerHTML = '<p>Нет результата. <a href="/survey.html">Пройти тест</a>.</p>'; return; }
  const r = JSON.parse(raw);

  const stampClass = r.passed ? 'stamp' : 'stamp stamp--bad';
  const stampText = r.passed
    ? `${(r.attempt.specialization_id || '').toUpperCase()} · ${(r.attempt.target_grade_id || '').toUpperCase()}`
    : 'НЕ ПРОЙДЕНО';

  el.innerHTML = `
    <div class="hero">
      <div class="${stampClass}">${esc(stampText)}</div>
      <div class="score">
        <b>${r.score}%</b> правильных · порог 60%
        <div class="bar"><i style="width:${r.score}%"></i></div>
      </div>
    </div>

    ${!r.passed && r.suggested_lower ? `
      <div class="suggest">
        Грейд не понижается автоматически.
        <a class="btn-primary" href="/survey.html">Пройти тест уровнем ниже · ${r.suggested_lower.toUpperCase()}</a>
      </div>` : ''}

    <h2>Разбор ответов</h2>
    <ul class="breakdown">
      ${r.breakdown.map((b, i) => `
        <li class="row ${b.is_correct ? 'ok' : 'bad'}">
          <span class="num">${i + 1}</span>
          <span class="prompt">${esc(b.prompt).replace(/\n/g, '<br>')}</span>
          <span class="verdict">${b.is_correct ? '✓' : '✗'}</span>
        </li>`).join('')}
    </ul>

    <p class="actions">
      <a class="btn-ghost" href="/profile.html">К профилю →</a>
    </p>
  `;
})();