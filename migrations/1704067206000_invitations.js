/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable({ schema: 'invite', name: 'invitations' }, {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    employer_id:   { type: 'uuid', notNull: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    candidate_id:  { type: 'uuid', notNull: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    vacancy_title: { type: 'text' },
    offer:         { type: 'text', notNull: true },
    salary_from:   { type: 'integer', notNull: true, check: 'salary_from >= 0' },
    salary_to:     { type: 'integer', notNull: true, check: 'salary_to >= salary_from' },
    channel:       { type: 'text', notNull: true, default: 'telegram' },
    status:        { type: 'text', notNull: true, default: 'sent',
                     check: "status IN ('sent','viewed','accepted','rejected')" },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex({ schema: 'invite', name: 'invitations' }, ['employer_id', 'created_at']);
  pgm.createIndex({ schema: 'invite', name: 'invitations' }, ['candidate_id', 'created_at']);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'invite', name: 'invitations' });
}