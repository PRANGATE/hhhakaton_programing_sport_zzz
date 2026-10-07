// Мок-банк кандидатов. В проде это выборка из profile.candidates
// + агрегация test.attempts + fsp.achievements.
// Здесь — статичный набор, чтобы демо работало независимо от БД.

export const MOCK_CANDIDATES = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    anon_id: 'K-1024',
    specialization: 'backend',
    grade: 'middle',
    test_score: 87,
    test_date: '2025-05-09',
    stacks: ['Go', 'PostgreSQL', 'Kafka', 'Docker', 'gRPC'],
    experience_years: 4,
    soft_skills: ['командная работа', 'менторство'],
    fsp: [
      { place: 'Золото', event: 'Нац. чемпионат «Big Data»', year: 2024 },
      { place: 'Бронза', event: 'Algorithms Cup',              year: 2023 },
    ],
    about: 'Backend платёжной платформы: Go, PostgreSQL, Kafka. Люблю highload и распределённые системы.',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    anon_id: 'K-1007',
    specialization: 'backend',
    grade: 'junior',
    test_score: 72,
    test_date: '2025-04-20',
    stacks: ['Python', 'PostgreSQL', 'Docker'],
    experience_years: 1.5,
    soft_skills: ['внимательность к деталям'],
    fsp: [],
    about: 'Начинающий backend-разработчик, ищу команду для роста.',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    anon_id: 'K-1090',
    specialization: 'backend',
    grade: 'senior',
    test_score: 93,
    test_date: '2025-03-15',
    stacks: ['Java', 'Kafka', 'Kubernetes', 'PostgreSQL', 'Spring'],
    experience_years: 8,
    soft_skills: ['архитектурное мышление', 'наставничество'],
    fsp: [{ place: 'Золото', event: 'ФСП Open 2022', year: 2022 }],
    about: 'Проектирую распределённые системы в финтехе, развиваю инженерную культуру.',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    anon_id: 'K-1033',
    specialization: 'frontend',
    grade: 'middle',
    test_score: 81,
    test_date: '2025-05-01',
    stacks: ['TypeScript', 'React', 'Vite', 'Redux'],
    experience_years: 3,
    soft_skills: ['продуктовое мышление'],
    fsp: [],
    about: 'Frontend-разработчик продуктовых интерфейсов.',
  },
];

// Формула ранжирования (fallback без LLM).
// score = 0.50*test + 0.25*fsp + 0.15*freshness + 0.10*stackMatch
export const scoreCandidate = (c, need) => {
  const test = c.test_score / 100;

  const fsp = c.fsp.length === 0 ? 0
    : Math.min(1, c.fsp.length * 0.4 + c.fsp.filter(a => a.place === 'Золото').length * 0.3);

  const daysAgo = Math.max(0, (Date.now() - new Date(c.test_date).getTime()) / 86_400_000);
  const freshness = Math.max(0, 1 - daysAgo / 365);

  const needStacks = (need.stack || []).map(s => s.toLowerCase());
  const candStacks = c.stacks.map(s => s.toLowerCase());
  const matched = needStacks.filter(s => candStacks.includes(s)).length;
  const stackMatch = needStacks.length ? matched / needStacks.length : 0;

  const score = 0.50 * test + 0.25 * fsp + 0.15 * freshness + 0.10 * stackMatch;

  return { score, matched, needTotal: needStacks.length, fsp: fsp > 0 };
};

export const explain = (c, s) => {
  const parts = [];
  if (s.needTotal) parts.push(`стек ${s.matched}/${s.needTotal}`);
  parts.push(`тест ${c.test_score}%`);
  parts.push(s.fsp ? 'есть достижения ФСП' : 'ФСП не привязан');
  return parts.join(' · ');
};