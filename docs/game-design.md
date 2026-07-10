# Void Saga: напрям гри

## Аналіз референсу

Dungeon Crusher працює не лише через клік по монстру, а через поєднання простого бойового циклу з довгими цілями:

- проходження stage із рядовими монстрами й босами;
- колекціонування та прокачування героїв;
- offline/idle нагороди;
- кілька ресурсів із різними spending loops;
- лут, крафт, артефакти, події, клани й конкурентні режими;
- прогресія з великими числами, де гравець завжди бачить наступне досяжне покращення.

Void Saga не має копіювати всі системи одразу. Перша якісна ціль - компактне Telegram-native idle RPG ядро, яке можна розвивати без переписування.

## Продуктові опори

1. **Rift combat** - один активний монстр або бос, tap damage, passive hero DPS, stage progression.
2. **Hero collection** - summon, рідкісні герої, рівні героїв, сумарна сила roster.
3. **Dungeon map** - зони, boss gates, enemy families, reward modifiers.
4. **Events** - timed encounters, rotating summon pools, daily claims.
5. **Backend-owned progress** - Telegram user save, античит-валидація, майбутні offline rewards.

## Модель екранів

- `Campaign` - головний маршрут прогресії: активна Rift-сцена, boss phase, tap skills, auto DPS. У UI це центральна primary-дія.
- `Heroes` - roster grid, rarity filters, upgrade affordance, team/power summary.
- `Summon` - gacha portal, drop rates, limited banners, shard fallback пізніше.
- `Leagues` - сезонний асинхронний рейтинг із дивізіонами, promotion/relegation і окремими сезонними нагородами.
- `Dungeons` - карта зон, boss gates, reward preview, auto-advance.
- `Inventory` - лут, артефакти, crafting materials.
- `Events` - rotating bosses, daily claims, limited hero banners.
- `Profile` - перевірені backend-ом Telegram identity/photo, stats, settings, save status. На бойовому екрані компактний profile HUD завжди показує ім'я та поточний progression level; за відсутності фото використовує ініціали.

### Навігація

Нижній control dock має чотири постійні напрямки: `Summon · Campaign · Leagues · Heroes`. `Campaign` візуально пріоритетна, але кожен пункт має однакову touch-зону не менше 44 px. Іконки лишаються векторними DOM/SVG-елементами, а підписи - окремим UI-текстом: локалізація не потребує перемальовування asset-ів.

### Leagues v1

Перший конкурентний режим - асинхронні семиденні сезони без live PvP:

- дивізіони `Bronze · Silver · Gold · Mythic`;
- групи до 50 гравців зі схожою progression cohort;
- server-authoritative score із найкращого campaign stage та підтверджених boss clears; roster power використовується лише як tie-breaker, щоб рейтинг не перетворився на чистий spending leaderboard;
- верхня частина групи переходить вище, середина лишається, нижня частина опускається після завершення сезону;
- нагорода створюється один раз у season settlement і забирається idempotent action;
- Telegram `photo_url` не публікується іншим гравцям за замовчуванням: leaderboard використовує окремий game alias та generated initials/avatar, доки гравець явно не дозволить соціальний профіль.

Backend-межа: `league_seasons`, `league_groups`, `league_memberships`, `league_scores`, `league_rewards`; читання через `GET /api/game/leagues/current`, отримання нагороди через idempotent `POST /api/game/action`. До появи цих таблиць UI чесно показує `Preseason / Unranked` і не генерує фальшивих суперників.

## Рішення щодо renderer

`React + Framer Motion` лишаємо для shell UI, HUD, меню, модалок і collection screens.

`PixiJS` підключаємо тільки для бойової сцени, коли з'явиться потреба у sprite animation, багатьох projectiles, layered backgrounds, camera shake і particle systems. React має володіти state і controls; Pixi має володіти canvas-сценою.

HUD і меню лишаються DOM-based, а арена `TheRift` використовує PixiJS для істоти та combat VFX без змішування renderer із economy/backend logic.

## Технічна архітектура

```text
src/game/*        shared deterministic core і content tables
server/*          API, migrations, SQLite persistence, idempotency, Telegram identity
src/store/*       frontend adapter, tap batching і ordered action outbox
src/views/*       Telegram Mini App UI
```

Backend приймає action із `commandId`, читає player snapshot із SQLite, застосовує shared game engine і транзакційно зберігає snapshot та command events. Повтор останньої команди повертає актуальний snapshot без повторного damage/reward. Так combat, summon і upgrade rules не живуть у UI-компонентах.

Economy-значення (`gold`, power, HP, damage, costs і rewards) передаються та зберігаються як канонічні decimal-рядки `GameNumber`. Рішення, межі precision і backward migration описані в [ADR 0001](adr/0001-big-number-economy.md).

Формули прогресії перевіряє детермінований [balance simulator](balance/README.md): він рахує TTK, upgrade ROI, spend, summon, ascension і rewards до сцени 10 000 та зберігає контрольні CSV-таблиці.

Hero collection використовує один запис на content template. Перша картка відкриває героя, duplicate конвертується в rarity-scaled shards, а ascension витрачає shards і відкриває наступні 50 рівнів. Ascension не додає прихований power multiplier: сила все ще купується за gold, а duplicate лише розширює level cap. Snapshot schema v3 об'єднує legacy-дублікати, зберігає їхню сумарну силу та видає shards за зайві копії.

Boss-stage має сервер-авторитетну спробу тривалістю 35 секунд. Deadline живе у snapshot schema v4 і створюється shared engine під час входу на boss-stage або першого combat action для legacy save. Якщо час вичерпано після завдання шкоди, наступний combat batch спочатку повертає HP боса до максимуму, скидає combo, створює новий deadline і записує `boss_enraged`, а потім застосовує поточний tap. Клієнт показує countdown із різниці `bossEncounterEndsAt - updatedAt`, тому годинник телефона не визначає результат бою.

Фази `Dominion`, `Fracture`, `Cataclysm` визначаються content table за поточним відсотком HP (`67%`, `34%`, `0%`) і не дублюються у snapshot. Фази змінюють лише подачу та інтенсивність encounter; damage, timer і reset лишаються у shared core.

Passive combat лишається одним агрегованим server-authoritative hit на секунду, щоб кількість героїв не прискорювала stage progression через кілька окремих overkill. Подія `monster_hit(source=passive)` містить `heroContributions` із точним `heroId` і damage кожного учасника. Warband HUD, hero-specific projectiles і damage feedback запускаються лише після цієї події; клієнтський таймер не вигадує атаки й не визначає damage. Legacy command events без breakdown нормалізуються з порожнім `heroContributions`.

Bulk upgrade має режими `+1`, `+10`, `MAX`. Shared quote послідовно рахує кожну floor-ціну, тому preview та backend action використовують однакову арифметику. `+10` купує до десяти доступних рівнів, `MAX` — до level cap, доступного gold або hard limit у 50 рівнів. Клієнт не передає власну ціну, power чи кінцевий level.

## Перший backend slice

- `GET /api/health`
- `GET /api/game/content`
- `GET /api/game/state?playerId=...`
- `POST /api/game/action`

Підтримані actions:

- `combat_batch`
- `summon`
- `upgrade_hero`
- `ascend_hero`
- `claim_offline_rewards`

SQLite використовується як локальна development database через Node 24 `node:sqlite`. Versioned migrations підхоплюють legacy `players` table, а bounded command ledger тримає останні 128 command events на гравця. Межа repository навмисно мала, щоб її можна було перенести на Postgres без зміни core engine.
