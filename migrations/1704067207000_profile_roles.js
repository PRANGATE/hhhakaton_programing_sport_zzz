/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumn({ schema: 'profile', name: 'candidates' }, {
    roles: { type: 'jsonb', notNull: true, default: pgm.func("'[]'::jsonb") },
  });
}

export async function down(pgm) {
  pgm.dropColumn({ schema: 'profile', name: 'candidates' }, 'roles');
}