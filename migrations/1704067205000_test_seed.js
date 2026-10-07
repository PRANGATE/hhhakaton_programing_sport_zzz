/* eslint-disable camelcase */
export const shorthands = undefined;

export async function up(pgm) {
  pgm.sql(`
    INSERT INTO test.questions
      (specialization_id, grade_id, topic, difficulty, kind, prompt, options, correct, is_anchor)
    VALUES
      ('backend','junior','language',1,'single',
       'Что вернёт выражение 2 + "2" в JavaScript?',
       '["\\"22\\"","4","NaN","ошибка"]'::jsonb, '0'::jsonb, true),

      ('backend','junior','db',1,'single',
       'Что делает SQL-оператор SELECT?',
       '["читает данные","изменяет данные","удаляет таблицу","создаёт индекс"]'::jsonb, '0'::jsonb, false),

      ('backend','middle','language',3,'single',
       'Что напечатает этот код на Go?\\n\\nfunc main(){\\n  ch := make(chan int, 1)\\n  ch <- 1\\n  close(ch)\\n  v, ok := <-ch\\n  fmt.Println(v, ok)\\n}',
       '["1 true","1 false","0 false","deadlock"]'::jsonb, '0'::jsonb, true),

      ('backend','middle','db',3,'single',
       'Что такое проблема «N+1 запросов»?',
       '["лишние N+1 запросов при обходе связей","ошибка транзакции","вид блокировки","тип индекса"]'::jsonb, '0'::jsonb, true),

      ('backend','middle','db',3,'single',
       'Оптимистичная блокировка — это…',
       '["проверка версии строки при обновлении","захват строки до чтения","блокировка всей таблицы","отключение транзакций"]'::jsonb, '0'::jsonb, true),

      ('backend','middle','architecture',3,'single',
       'Зачем нужен идемпотентный ключ в POST-запросе?',
       '["защита от дублей при ретраях","ускорение ответа","кеширование GET","сжатие тела"]'::jsonb, '0'::jsonb, false),

      ('backend','senior','architecture',4,'single',
       'Что даёт уровень изоляции SERIALIZABLE?',
       '["эквивалент последовательного выполнения транзакций","только защиту от грязного чтения","отключение MVCC","блокировку всей БД"]'::jsonb, '0'::jsonb, true),

      ('backend','senior','architecture',4,'single',
       'Смысл паттерна Outbox в микросервисах?',
       '["надёжная публикация событий через транзакцию в БД","сжатие событий","маршрутизация HTTP","кеш на клиенте"]'::jsonb, '0'::jsonb, false),

      ('frontend','junior','layout',1,'single',
       'Что делает CSS-свойство display: flex?',
       '["включает flex-контейнер","скрывает элемент","делает текст жирным","анимирует"]'::jsonb, '0'::jsonb, false),

      ('frontend','middle','react',3,'single',
       'Зачем нужен ключ (key) в списках React?',
       '["стабильная идентификация элементов при реконсиляции","стилизация","кеширование","доступность"]'::jsonb, '0'::jsonb, true)
    ON CONFLICT DO NOTHING;
  `);
}

export async function down(pgm) {
  pgm.sql(`DELETE FROM test.questions;`);
}