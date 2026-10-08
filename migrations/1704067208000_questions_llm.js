export const shorthands = undefined;

export async function up(pgm) {
  pgm.addColumns({ schema: 'test', name: 'questions' }, {
    generated_by_llm: { type: 'boolean', notNull: true, default: false },
    model:            { type: 'text' },
    prompt_hash:      { type: 'text' },
  });
  pgm.createIndex({ schema: 'test', name: 'questions' }, ['generated_by_llm']);
}

export async function down(pgm) {
  pgm.dropColumns({ schema: 'test', name: 'questions' },
    ['generated_by_llm', 'model', 'prompt_hash']);
}