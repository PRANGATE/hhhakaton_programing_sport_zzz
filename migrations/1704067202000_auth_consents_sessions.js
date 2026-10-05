/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  // Согласия по 152-ФЗ
  pgm.createTable({ schema: 'auth', name: 'consents' }, {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:     { type: 'uuid', notNull: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    kind:        { type: 'text', notNull: true, check: "kind IN ('processing','publish')" },
    version:     { type: 'text', notNull: true },
    accepted_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    ip:          { type: 'inet' },
  });
  pgm.createIndex({ schema: 'auth', name: 'consents' }, ['user_id']);
  pgm.createIndex({ schema: 'auth', name: 'consents' }, ['user_id', 'kind']);

  // Сессии (refresh-токены)
  pgm.createTable({ schema: 'auth', name: 'sessions' }, {
    id:            { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id:       { type: 'uuid', notNull: true, references: { schema: 'auth', name: 'users' }, onDelete: 'CASCADE' },
    refresh_hash:  { type: 'text', notNull: true },           // sha256 от refresh-токена
    user_agent:    { type: 'text' },
    ip:            { type: 'inet' },
    created_at:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at:    { type: 'timestamptz', notNull: true },
    revoked_at:    { type: 'timestamptz' },
  });
  pgm.createIndex({ schema: 'auth', name: 'sessions' }, ['user_id']);
  pgm.createIndex({ schema: 'auth', name: 'sessions' }, ['refresh_hash'], { unique: true });
  pgm.createIndex({ schema: 'auth', name: 'sessions' }, ['expires_at']);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'auth', name: 'sessions' });
  pgm.dropTable({ schema: 'auth', name: 'consents' });
}