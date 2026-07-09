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

- `Rift` - активна бойова сцена, boss phase, tap skills, auto DPS.
- `Heroes` - roster grid, rarity filters, upgrade affordance, team/power summary.
- `Summon` - gacha portal, drop rates, limited banners, shard fallback пізніше.
- `Dungeons` - карта зон, boss gates, reward preview, auto-advance.
- `Inventory` - лут, артефакти, crafting materials.
- `Events` - rotating bosses, daily claims, limited hero banners.
- `Profile` - Telegram identity, stats, settings, save status.

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
- `claim_offline_rewards`

SQLite використовується як локальна development database через Node 24 `node:sqlite`. Versioned migrations підхоплюють legacy `players` table, а bounded command ledger тримає останні 128 command events на гравця. Межа repository навмисно мала, щоб її можна було перенести на Postgres без зміни core engine.
