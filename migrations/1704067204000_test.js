/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  // Пул заданий. seed_min/max — «сложностной коридор» для калибровки.
  pgm.createTable({ schema: 'test', name: 'questions' }, {
    id:                 { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    specialization_id:  { type: 'text', notNull: true },   // backend/frontend/…
    grade_id:           { type: 'text', notNull: true },   // junior/middle/senior
    topic:              { type: 'text', notNull: true },   // algorithms / db / …
    difficulty:         { type: 'smallint', notNull: true, default: 2 }, // 1..5
    kind:               { type: 'text', notNull: true, check: "kind IN ('single','multi','text')" },
    prompt:             { type: 'text', notNull: true },
    options:            { type: 'jsonb' },                 // для single/multi
    correct:            { type: 'jsonb' },                 // индекс или массив индексов
    rubric:             { type: 'jsonb' },                 // для свободного ответа
    is_anchor:          { type: 'boolean', notNull: true, default: false },
    active:             { type: 'boolean', notNull: true, default: true },
    created_at:         { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex({ schema: 'test', name: 'questions' }, ['specialization_id','grade_id','active']);

  // Попытки
  pgm.createTable({ schema: 'test', name: 'attempts' }, {
    id:               { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:          { type: 'uuid', notNull: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    specialization_id:{ type: 'text', notNull: true },
    target_grade_id:  { type: 'text', notNull: true },
    awarded_grade_id: { type: 'text' },
    score:            { type: 'smallint' },
    status:           { type: 'text', notNull: true, default: 'in_progress',
                        check: "status IN ('in_progress','passed','failed','expired')" },
    question_ids:     { type: 'jsonb', notNull: true },
    started_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    finished_at:      { type: 'timestamptz' },
  });
  pgm.createIndex({ schema: 'test', name: 'attempts' }, ['user_id','started_at']);

  // Ответы
  pgm.createTable({ schema: 'test', name: 'answers' }, {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    attempt_id:   { type: 'uuid', notNull: true, references: { schema: 'test', name: 'attempts' }, onDelete: 'CASCADE' },
    question_id:  { type: 'uuid', notNull: true, references: { schema: 'test', name: 'questions' }, onDelete: 'CASCADE' },
    payload:      { type: 'jsonb' },   // { choice: 2 } | { choices:[0,2] } | { text: "…" }
    is_correct:   { type: 'boolean' },
    score:        { type: 'smallint' }, // 0..100
    answered_at:  { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex({ schema: 'test', name: 'answers' }, ['attempt_id']);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'test', name: 'answers' });
  pgm.dropTable({ schema: 'test', name: 'attempts' });
  pgm.dropTable({ schema: 'test', name: 'questions' });
}