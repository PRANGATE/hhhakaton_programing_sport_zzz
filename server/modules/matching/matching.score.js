// server/modules/matching/matching.score.js
//
// Формульный скоринг. Живёт отдельно от мока, потому что используется
// роутером на реальных данных из БД.
//
// score = 0.50*test + 0.25*fsp + 0.15*freshness + 0.10*stackMatch

export const scoreCandidate = (c, need) => {
  const test = (Number(c.test_score) || 0) / 100;

  const fspArr = Array.isArray(c.fsp) ? c.fsp : [];
  const fsp =
    fspArr.length === 0
      ? 0
      : Math.min(
          1,
          fspArr.length * 0.4 +
            fspArr.filter((a) => a.place === 'Золото').length * 0.3
        );

  let freshness = 0;
  if (c.test_date) {
    const daysAgo = Math.max(
      0,
      (Date.now() - new Date(c.test_date).getTime()) / 86_400_000
    );
    freshness = Math.max(0, 1 - daysAgo / 365);
  }

  const needStacks = (need.stack || []).map((s) => String(s).toLowerCase());
  const candStacks = (c.stacks || []).map((s) => String(s).toLowerCase());
  const matched = needStacks.filter((s) => candStacks.includes(s)).length;
  const stackMatch = needStacks.length ? matched / needStacks.length : 0;

  const score =
    0.5 * test + 0.25 * fsp + 0.15 * freshness + 0.1 * stackMatch;

  return { score, matched, needTotal: needStacks.length, fsp: fsp > 0 };
};

export const explain = (c, s) => {
  const parts = [];
  if (s.needTotal) parts.push(`стек ${s.matched}/${s.needTotal}`);
  parts.push(`тест ${c.test_score}%`);
  parts.push(s.fsp ? 'есть достижения ФСП' : 'ФСП не привязан');
  return parts.join(' · ');
};