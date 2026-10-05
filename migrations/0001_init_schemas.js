/* eslint-disable camelcase */
export const shorthands = undefined;

const SCHEMAS = [
  'auth', 'profile', 'catalog', 'test', 'matching',
  'invite', 'vacancy', 'fsp', 'notification',
  'ai', 'chat', 'moderation', 'ats',
];

export async function up(pgm) {
  for (const name of SCHEMAS) {
    pgm.sql(`CREATE SCHEMA IF NOT EXISTS ${name};`);
  }
}

export async function down(pgm) {
  for (const name of [...SCHEMAS].reverse()) {
    pgm.sql(`DROP SCHEMA IF EXISTS ${name} CASCADE;`);
  }
}