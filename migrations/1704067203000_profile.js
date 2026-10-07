/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  // Профиль кандидата
  pgm.createTable({ schema: 'profile', name: 'candidates' }, {
    user_id:            { type: 'uuid', primaryKey: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    full_name:          { type: 'text' },
    telegram:           { type: 'text' },
    phone:              { type: 'text' },
    about:              { type: 'text' },
    experience_years:   { type: 'numeric(4,1)' },
    industry_id:        { type: 'text' },       // отрасль
    specialization_id:  { type: 'text', references: { schema: 'catalog', name: 'specializations' }, onDelete: 'SET NULL' },
    target_grade_id:    { type: 'text', references: { schema: 'catalog', name: 'grades' }, onDelete: 'SET NULL' },
    current_grade_id:   { type: 'text', references: { schema: 'catalog', name: 'grades' }, onDelete: 'SET NULL' },
    stacks:             { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") }, // [{id,name}]
    soft_skills:        { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
    visibility:         { type: 'jsonb', notNull: true, default: pgm.func(`'{"stacks":true,"experience":true,"soft_skills":false}'::jsonb`) },
    created_at:         { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:         { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex({ schema: 'profile', name: 'candidates' }, ['specialization_id']);
  pgm.createIndex({ schema: 'profile', name: 'candidates' }, ['current_grade_id']);

  // Работодатель
  pgm.createTable({ schema: 'profile', name: 'employers' }, {
    user_id:          { type: 'uuid', primaryKey: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    company_name:     { type: 'text', notNull: true },
    industry_id:      { type: 'text' },
    contact_person:   { type: 'text' },
    contact_email:    { type: 'text' },
    contact_telegram: { type: 'text' },
    contact_phone:    { type: 'text' },
    default_channel:  { type: 'text', notNull: true, default: 'telegram' }, // telegram | email | phone
    description:      { type: 'text' },
    created_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // История смен грейда (для лимита «не чаще 1 раза в 3 месяца»)
  pgm.createTable({ schema: 'profile', name: 'grade_history' }, {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:     { type: 'uuid', notNull: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    grade_id:    { type: 'text', notNull: true },
    changed_at:  { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex({ schema: 'profile', name: 'grade_history' }, ['user_id']);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'profile', name: 'grade_history' });
  pgm.dropTable({ schema: 'profile', name: 'employers' });
  pgm.dropTable({ schema: 'profile', name: 'candidates' });
}