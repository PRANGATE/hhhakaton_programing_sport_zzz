/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.createTable({ schema: 'catalog', name: 'specializations' }, {
    id:             { type: 'text', primaryKey: true },
    name:           { type: 'text', notNull: true },
    description:    { type: 'text' },
    sort_order:     { type: 'integer', notNull: true, default: 0 },
    effective_from: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'catalog', name: 'grades' }, {
    id:             { type: 'text', primaryKey: true },
    name:           { type: 'text', notNull: true },
    level:          { type: 'integer', notNull: true },
    description:    { type: 'text' },
    effective_from: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'catalog', name: 'stacks' }, {
    id:                { type: 'text', primaryKey: true },
    name:              { type: 'text', notNull: true },
    category:          { type: 'text', notNull: true },
    specialization_id: { type: 'text', references: { schema: 'catalog', name: 'specializations' }, onDelete: 'SET NULL' },
    sort_order:        { type: 'integer', notNull: true, default: 0 },
    effective_from:    { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex({ schema: 'catalog', name: 'stacks' }, ['specialization_id']);
  pgm.createIndex({ schema: 'catalog', name: 'stacks' }, ['category']);
}

export async function down(pgm) {
  pgm.dropTable({ schema: 'catalog', name: 'stacks' });
  pgm.dropTable({ schema: 'catalog', name: 'grades' });
  pgm.dropTable({ schema: 'catalog', name: 'specializations' });
}