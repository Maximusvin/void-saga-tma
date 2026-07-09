# ADR 0001: Decimal-рядки для economy-значень

- Статус: прийнято
- Дата: 2026-07-10

## Контекст

Gold, hero power, damage і monster health зберігалися як JavaScript `number`. Уже на ранній прогресії це давало значення на кшталт `1002.5999999999999`, а експоненційне зростання HP на тисячах stage зрештою перевищує межу `Number` і серіалізується як `null` замість `Infinity`.

Гра потребує:

- детермінованої арифметики для shared frontend/backend core;
- компактного JSON і SQLite snapshot;
- підтримки щонайменше десятків тисяч stage;
- безпечної міграції наявних numeric snapshots;
- малого впливу на Telegram Mini App bundle.

## Рішення

Economy-значення мають тип `GameNumber`: брендований канонічний decimal-рядок. Арифметику виконує `decimal.js-light` із 32 внутрішніми significant digits і серіалізацією до 24 significant digits.

До `GameNumber` належать:

- `gold`;
- hero `power`;
- `monsterHealth` і `monsterMaxHealth`;
- damage, gold rewards і upgrade costs у game events.

Цілими JavaScript numbers залишаються stage, hero level, gems, combo/tap counters і часові інтервали. Їхні реальні межі не наближаються до `Number.MAX_SAFE_INTEGER`, а decimal-тип ускладнив би API без користі.

У JSON значення виглядають так:

```json
{
  "schemaVersion": 2,
  "gold": "1002.6",
  "monsterMaxHealth": "2.70551056716679295639618e+794"
}
```

`normalizeGameSnapshot` приймає schema v1 numeric values, очищає типовий binary drift до 15 надійних significant digits, повертає schema v2 і не пропускає `NaN`, `Infinity` або від'ємні economy-значення. Repository одразу переписує прочитаний legacy snapshot у канонічному форматі. Старі command events нормалізуються під час replay.

UI ніколи не перетворює economy-значення у `number`. Винятки мають обмежений діапазон:

- health ratio конвертується лише після clamp до `0..100`;
- decorative projectile speed використовує capped power.

## Розглянуті альтернативи

### Власна mantissa/exponent реалізація

Відхилено через високий ризик помилок нормалізації, округлення, порівняння та віднімання на різних порядках.

### `break_eternity.js`

Бібліотека якісно підходить для incremental games із тетрацією та багатошаровими експонентами, але поточна прогресія використовує звичайні степені. Її швидкісна модель із Number-мантисою не закриває вимогу точнішої decimal-арифметики краще за обране рішення.

### Повний `decimal.js`

Функціонально підходить, але містить непотрібні для гри математичні операції й додавав близько 13.8 kB gzip до main chunk. `decimal.js-light` залишає потрібний subset і додає близько 6.3 kB gzip.

## Наслідки

- Звичайні оператори `+`, `-`, `*`, `/` для economy-значень більше не компілюються.
- API-клієнти мають трактувати economy-поля як decimal strings.
- 24 significant digits є свідомою межею: дуже мала нагорода відносно величезного balance може перестати змінювати його. Для idle economy це передбачувана поведінка, а не binary drift.
- Перехід до hyper-operators у майбутньому вимагатиме нового ADR і, ймовірно, іншого числового engine.
