# ADR 0004: рейтинг кампанії в межах canonical realm

## Статус

Прийнято.

## Контекст

Void Saga запускає незалежні logical realms `S-1`, `S-2`, ... і згодом об'єднує старі realms у `M-*`. Це не сезони: прогрес героя не скидається. Попередній екран Leagues показував статичний `Preseason / Unranked` без серверного джерела даних.

Рейтинг не може покладатися на клієнтський score або перетворювати `GameNumber` у SQLite `REAL`: пізні значення power перевищують точність IEEE-754. Також API не має повертати Telegram id, account id чи character id інших гравців.

## Рішення

1. Leaderboard є all-time таблицею кампанії всередині поточного **canonical realm**.
2. Порядок: `stage DESC`, `enemy_index DESC`, `progress_updated_at ASC`, технічний стабільний tie-break за character id лише всередині БД.
3. Division визначається campaign milestone:
   - Bronze: stages 1–49;
   - Silver: 50–199;
   - Gold: 200–999;
   - Mythic: 1000+.
4. `players.snapshot_json` лишається авторитетним gameplay state. Колонки `stage`, `enemy_index`, `progress_updated_at` є індексованою проєкцією, яку `GameRepository` оновлює атомарно разом зі snapshot.
5. Після merge recursive realm scope включає source realms у таблицю нового `M-*`; гравці з інших відкритих realms не потрапляють у неї.
6. API повертає top-50, окрему позицію поточного гравця та population. Публічна entry містить лише bounded display name, HTTPS photo, stage/wave, division і Warband power.
7. Verified Telegram profile синхронізується на bootstrap/realm/leaderboard запитах. Combat hot path не створює додаткового profile write.
8. Відповідь персоналізована й має `Cache-Control: private, no-store`.

## Наслідки

- Новий realm автоматично має окрему конкурентну таблицю без окремої БД або deploy.
- Після merge рейтинги source realms об'єднуються без фізичного переносу characters.
- Division відображає довгостроковий прогрес, а rank — реальну конкуренцію на сервері.
- Поточний SQLite single-writer достатній для одного API replica та realm capacity до 10 000 players. Перед горизонтальним масштабуванням API ranking projection і locks треба перенести у спільну БД/координацію згідно з ADR 0002.
- Сезонні рейтинги, weekly damage, rewards і anti-cheat snapshots є окремими майбутніми контрактами; вони не повинні перевантажувати цю all-time таблицю.
