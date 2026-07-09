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

Поточна реалізація лишається DOM-based, поки будується core/backend foundation. Наступний візуальний milestone може замінити лише арену `TheRift` на PixiJS без переписування economy чи backend logic.

## Технічна архітектура

```text
src/game/*        shared deterministic core і content tables
server/*          API, SQLite persistence, Telegram identity
src/store/*       frontend adapter для game state
src/views/*       Telegram Mini App UI
```

Backend приймає action, читає player snapshot із SQLite, застосовує shared game engine, зберігає новий snapshot і повертає events. Так combat, summon і upgrade rules не живуть у UI-компонентах.

## Перший backend slice

- `GET /api/health`
- `GET /api/game/content`
- `GET /api/game/state?playerId=...`
- `POST /api/game/action`

Підтримані actions:

- `deal_damage`
- `summon`
- `upgrade_hero`
- `claim_offline_rewards`

SQLite використовується як локальна development database через Node 24 `node:sqlite`. Межа repository навмисно мала, щоб її можна було перенести на Postgres без зміни core engine.
