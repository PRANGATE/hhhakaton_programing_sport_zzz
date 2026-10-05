/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    INSERT INTO catalog.specializations (id, name, sort_order) VALUES
      ('backend',        'Backend',              10),
      ('frontend',       'Frontend',             20),
      ('mobile',         'Mobile',               30),
      ('data-analytics', 'Data & Analytics',     40),
      ('devops',         'DevOps / SRE',         50),
      ('qa',             'QA',                   60),
      ('infosec',        'Information Security', 70),
      ('gamedev',        'Game Dev',             80)
    ON CONFLICT (id) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO catalog.grades (id, name, level) VALUES
      ('junior', 'Junior', 1),
      ('middle', 'Middle', 2),
      ('senior', 'Senior', 3)
    ON CONFLICT (id) DO NOTHING;
  `);

  pgm.sql(`
    INSERT INTO catalog.stacks (id, name, category, sort_order) VALUES
      ('go',              'Go',              'language',  10),
      ('java',            'Java',            'language',  20),
      ('python',          'Python',          'language',  30),
      ('javascript',      'JavaScript',      'language',  40),
      ('typescript',      'TypeScript',      'language',  50),
      ('csharp',          'C#',              'language',  60),
      ('cpp',             'C++',             'language',  70),
      ('kotlin',          'Kotlin',          'language',  80),
      ('swift',           'Swift',           'language',  90),
      ('rust',            'Rust',            'language', 100),
      ('postgresql',      'PostgreSQL',      'database',  10),
      ('mysql',           'MySQL',           'database',  20),
      ('mongodb',         'MongoDB',         'database',  30),
      ('redis',           'Redis',           'database',  40),
      ('clickhouse',      'ClickHouse',      'database',  50),
      ('kafka',           'Kafka',           'broker',    10),
      ('rabbitmq',        'RabbitMQ',        'broker',    20),
      ('react',           'React',           'framework', 10),
      ('vue',             'Vue',             'framework', 20),
      ('nextjs',          'Next.js',         'framework', 30),
      ('django',          'Django',          'framework', 40),
      ('fastapi',         'FastAPI',         'framework', 50),
      ('spring',          'Spring',          'framework', 60),
      ('express',         'Express',         'framework', 70),
      ('docker',          'Docker',          'infra',     10),
      ('kubernetes',      'Kubernetes',      'infra',     20),
      ('terraform',       'Terraform',       'infra',     30),
      ('nginx',           'nginx',           'infra',     40),
      ('gitlab-ci',       'GitLab CI',       'infra',     50),
      ('github-actions',  'GitHub Actions',  'infra',     60)
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function down(pgm) {
  pgm.sql(`DELETE FROM catalog.stacks;`);
  pgm.sql(`DELETE FROM catalog.grades;`);
  pgm.sql(`DELETE FROM catalog.specializations;`);
}