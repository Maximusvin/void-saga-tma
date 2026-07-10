# ADR 0002: логічні realm-сервери

## Статус

Прийнято.

## Контекст

Продукту потрібні світи `S-1`, `S-2`, ... із незалежним стартом прогресії, ручним або автоматичним відкриттям і подальшим об'єднанням старих світів. Це не session-based multiplayer server: у Void Saga немає окремого realtime-процесу з IP/портом для кожної сесії, як у [GameLift game sessions](https://docs.aws.amazon.com/gameliftservers/latest/developerguide/gamelift-sdk-interactions.html). Створювати окремий контейнер і БД на кожен `S-*` означало б дублювати deploy, backup, Telegram auth та міграції, а merge вимагав би ризикового фізичного переносу даних.

Поточна схема використовувала `players.id` одночасно як account identity та progression key. Вона не дозволяла одному Telegram-акаунту мати окремі проходження на кількох світах.

## Рішення

### Realm є логічним світом

Один shared HTTP API process обслуговує всі світи. Кількість logical realms не вимагає окремих deploy-ів, але поточний SQLite writer, in-memory rate limiter і player locks ще не дозволяють безпечно запускати кілька API replicas.

- `realms` зберігає `S-*` і консолідовані `M-*`;
- `realm_characters` зв'язує Telegram account, окремий character та origin realm;
- `players.id` лишається progression key, але для нових світів дорівнює opaque `characterId`;
- `account_realm_state` зберігає активний character;
- `game_commands.player_id` фактично key-ується character, тому idempotency не перетинає світи.

Legacy `players` атомарно backfill-яться як персонажі `S-1`; snapshot та command ledger не переписуються.

### Lifecycle

- `open`: світ іграбельний і приймає нових персонажів;
- `locked`: іграбельний для наявних персонажів, але новий старт заборонено;
- `merged`: origin realm лишається незмінним, але соціальні й рейтингові запити використовують `canonicalRealmId` консолідованого `M-*`.

Новий `S-*` блокує попередній open realm. Автоматичний reconcile може запустити світ за interval, soft capacity після minimum age або hard capacity. За замовчуванням automation вимкнена; policy активує оператор.

Realm mutation виконується через `BEGIN IMMEDIATE`: SQLite одразу резервує write transaction, тому конкуруючі join/create/merge не можуть одночасно пройти перевірку capacity або sequence. Це відповідає [офіційній моделі SQLite transactions](https://www.sqlite.org/lang_transaction.html). `busy_timeout` дає другому процесу коротке bounded очікування замість миттєвого `SQLITE_BUSY`.

### Merge

`merge-next` бере найстарішу contiguous-групу locked standard realms, створює `M-N`, записує `realm_merge_sources` і переводить sources у `merged`. Snapshot фізично не переноситься. Якщо один account мав characters на `S-1` і `S-5`, після `S-1...S-10 → M-1` обидва characters лишаються окремими, але мають спільний canonical realm.

### Монетизація

`realm_entitlements` є server-only ledger для launch pack / founder pack. Унікальні `provider_event_id` та `(character, realm, sku)` забороняють повторне застосування одного платежу чи one-time pack. Клієнт не може створити entitlement або передати собі ресурси. Payment webhook і конкретні grants додаються окремим рішенням після вибору провайдера.

## Операційна модель

- ручні операції: bundled `realm-admin.mjs` усередині API container;
- періодична оцінка: systemd timer раз на десять хвилин;
- public admin endpoint відсутній;
- create, merge та policy changes пишуться в `realm_operations`;
- auto launch/merge вимкнені до явної policy-команди.

## Межа масштабування

SQLite лишається прийнятним для одного API writer та поточного прототипного навантаження. До горизонтального масштабування API або високої конкурентності realm joins/purchases repository переноситься на Postgres; shared engine, API contracts і character/realm IDs не змінюються.

## Наслідки

- новий світ не вимагає deploy або нової БД;
- merge не ризикує snapshot-ами;
- один account може мати кілька незалежних characters;
- рейтинги й guild systems мають завжди key-уватися `canonicalRealmId`, а economy/progression — `characterId`;
- будь-яка realm-specific покупка key-ується одночасно character та realm.
