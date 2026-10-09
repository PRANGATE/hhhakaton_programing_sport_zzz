/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`CREATE SCHEMA IF NOT EXISTS news;`);

  pgm.createTable({ schema: 'news', name: 'posts' }, {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    title:        { type: 'text', notNull: true },
    body:         { type: 'text', notNull: true },
    author_id:    { type: 'uuid', references: { schema: 'auth', name: 'users' }, onDelete: 'SET NULL' },
    published_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex({ schema: 'news', name: 'posts' }, ['published_at']);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'news', name: 'posts' });
  pgm.sql(`DROP SCHEMA IF EXISTS news CASCADE;`);
}