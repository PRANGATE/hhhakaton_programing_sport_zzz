/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`CREATE EXTENSION IF NOT EXISTS citext;`);

  pgm.createTable({ schema: 'auth', name: 'users' }, {
    id:                 { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email:              { type: 'citext', notNull: true, unique: true },
    password_hash:      { type: 'text', notNull: true },
    role:               { type: 'text', notNull: true, check: "role IN ('candidate','employer','moderator','admin')" },
    email_verified_at:  { type: 'timestamptz' },
    created_at:         { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:         { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex({ schema: 'auth', name: 'users' }, 'email');
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'auth', name: 'users' });
}