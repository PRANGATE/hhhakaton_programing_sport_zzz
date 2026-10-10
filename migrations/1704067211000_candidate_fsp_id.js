/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  // ФСП ID — строка, без ограничений по формату:
  // реальная интеграция появится после хакатона, тогда можно навесить CHECK.
  pgm.addColumns({ schema: 'profile', name: 'candidates' }, {
    fsp_id: { type: 'text' },
  });
}

export async function down(pgm) {
  pgm.dropColumns({ schema: 'profile', name: 'candidates' }, ['fsp_id']);
}