import bcrypt from 'bcryptjs';

export const shorthands = undefined;

export async function up(pgm) {
  // bcrypt cost 12, тот же, что и в auth.service.js
  const hash = await bcrypt.hash('1', 12);

  // citext + UNIQUE + ON CONFLICT — идемпотентно
  pgm.sql(`
    INSERT INTO auth.users (email, password_hash, role, email_verified_at)
    VALUES ('admin@ad.min', '${hash}', 'admin', now())
    ON CONFLICT (email) DO NOTHING;
  `);
}

export async function down(pgm) {
  pgm.sql(`DELETE FROM auth.users WHERE email = 'admin@ad.min';`);
}