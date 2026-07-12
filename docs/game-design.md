# Void Saga: напрям гри

## Аналіз референсу

Dungeon Crusher працює не лише через клік по монстру, а через поєднання простого бойового циклу з довгими цілями:

- проходження stage із рядовими монстрами й босами;
- колекціонування та прокачування героїв;
- offline/idle нагороди;
- кілька ресурсів із різними spending loops;
- лут, крафт, артефакти, події, клани й конкурентні режими;
- прогресія з великими числами, де гравець завжди бачить наступне досяжне покращення.

Технічний розтин конкурента (движок Unity 6 WebGL, файли, як зроблені 3D-герої й локації) і вибір власного стеку — у [research/dungeon-crusher-teardown.md](research/dungeon-crusher-teardown.md) та [ADR 0006](adr/0006-engine-and-asset-pipeline.md).

Void Saga не має копіювати всі системи одразу. Перша якісна ціль - компактне Telegram-native idle RPG ядро, яке можна розвивати без переписування.

## Продуктові опори

1. **Rift combat** - один активний монстр або бос, tap damage, passive hero DPS, stage progression.
2. **Hero collection** - summon, рідкісні герої, рівні героїв, сумарна сила roster.
3. **Dungeon map** - зони, boss gates, enemy families, reward modifiers.
4. **Events** - timed encounters, rotating summon pools, daily claims.
5. **Backend-owned progress** - Telegram user save, античит-валидація, майбутні offline rewards.

## Модель екранів

- `Campaign` - головний маршрут прогресії: активна Rift-сцена, boss phase, tap skills, auto DPS. У UI це центральна primary-дія.
- `Heroes` - активна Warband із чотирьох слотів, продуктивна collection grid, rarity/team filters, sorting, upgrade та team power summary.
- `Summon` - gacha portal із фактичними drop rates, pity, collection progress, duplicate shards і прямим переходом до Warband.
- `Leagues` - постійний realm-scoped рейтинг прогресії з дивізіонами та зрозумілим шляхом до наступного milestone; це не сезон.
- `Dungeons` - карта зон, boss gates, reward preview, auto-advance.
- `Inventory` - лут, артефакти, crafting materials.
- `Events` - rotating bosses, daily claims, limited hero banners.
- `Profile` - перевірені backend-ом Telegram identity/photo, stats, settings, save status. На бойовому екрані компактний profile HUD завжди показує ім'я та поточний progression level; за відсутності фото використовує ініціали.

### Навігація

Нижній control dock має чотири постійні напрямки: `Summon · Campaign · Leagues · Heroes`. `Campaign` візуально пріоритетна, але кожен пункт має однакову touch-зону не менше 44 px. Іконки лишаються векторними DOM/SVG-елементами, а підписи - окремим UI-текстом: локалізація не потребує перемальовування asset-ів.

### World servers

`S-1`, `S-2`, ... - довгоживучі логічні світи, не сезони. Новий character починає з чистого snapshot; account identity, Telegram profile і платіжна історія лишаються спільними. Новий світ відкривається оператором або policy за віком/заповненням, а попередній перестає приймати нові старти.

Старі contiguous-групи об'єднуються як `S-1...S-10 → M-1`. Origin character та його economy не зливаються з іншим character того самого account; `M-1` лише стає canonical realm для рейтингів, guilds, подій і matchmaking cohort.

Launch/founder offers можуть бути realm-specific, але grant створюється лише backend payment adapter-ом і застосовується один раз. Клієнт не надсилає bonus amount. Детальні інваріанти описані в [ADR 0002](adr/0002-logical-realm-servers.md).

### Leagues v1

Перший конкурентний режим - постійний асинхронний рейтинг усередині logical realm без live PvP і без сезонного скидання:

- дивізіони залежать від campaign milestone: `Bronze` від stage 1, `Silver` від 50, `Gold` від 200, `Mythic` від 1000;
- server-authoritative порядок визначають stage, wave і passive power як tie-breaker;
- API повертає до 50 реальних лідерів, загальну кількість гравців та окрему позицію поточного гравця, якщо він поза top;
- рейтинг ізольований у `S-*`, а після merge охоплює всі source realms його canonical `M-*` без злиття character progress;
- display name і bounded HTTPS photo походять із перевіреного Telegram profile; за відсутності фото UI генерує ініціали;
- UI показує точний прогрес до наступного дивізіону й повертає в Campaign; вигаданих суперників, season rewards або promotion/relegation немає.

Backend-межа: читання через authenticated `GET /api/game/leaderboard`; `LeaderboardRepository` формує realm scope рекурсивно через merge sources. Сезонний турнір, якщо буде потрібен пізніше, є окремим режимом і не змінює модель довгоживучих серверів.

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

Hero collection використовує один запис на content template. Перша картка відкриває героя, duplicate конвертується в pool-scaled shards, а ascension витрачає shards і відкриває наступні 50 рівнів. Ascension не додає прихований power multiplier: сила все ще купується за gold, а duplicate лише розширює level cap. Snapshot schema v3 об'єднує legacy-дублікати, зберігає їхню сумарну силу та видає shards за зайві копії.

Standard summon використовує відкриті odds `Common 65% · Rare 26.2% · Epic 8% · Legendary 0.8%`. Snapshot schema v7 зберігає server-authoritative Legendary pity: після 60 невдач кожен roll додає 3 процентні пункти до Legendary rate, а 80-та спроба гарантує Legendary. Rarity визначається до template, тому новий герой не роздуває шанс своєї rarity. Новий character отримує 30 gems на три summon. У content version 009 кожна rarity має два live templates: duplicate rewards дорівнюють `2/4/6/10`, а перше відкриття другого template тієї самої rarity дає базові `1/2/3/5` shards. Це зберігає очікувану швидкість ascension конкретного героя без прихованого rarity power creep.

Кожен hero template має явний combat profile. `Balanced`, `Tap` та `Idle` по-різному розподіляють силу між натисканням і passive DPS, але нормалізовані до однакового expected damage за `4 taps/s` із production crit rate. Heroes UI показує focus поруч із роллю, а summon reveal пояснює його до додавання в Warband. Таким чином вибір складу є зрозумілим, а не прихованою різницею коефіцієнтів.

Campaign stage більше не дорівнює одному миттєвому kill. Schema v7 зберігає `enemyIndex`: stages 1–200 мають чотири звичайні encounters, 201–1000 — п'ять, далі — шість; boss-stage завжди містить одного боса. Engine сам визначає `stageCleared`, наступний encounter, HP і rewards. Tap gold нараховується лише з фактично знятого HP, тому overkill не створює валюту.

Snapshot schema v5 зберігає ordered `activeHeroIds` із максимум чотирьох унікальних owned hero ids. Legacy save без цього поля автоматично отримує перших чотирьох героїв; новий унікальний summon займає вільний слот. Tap bonus, passive hit, per-hero contribution та offline rewards використовують лише активну Warband. Команда `set_active_warband` передає повний ordered склад, а shared engine повторно перевіряє ліміт, унікальність і ownership.

Boss-stage має сервер-авторитетну спробу тривалістю 60, 65 або 75 секунд залежно від difficulty band. Deadline живе у snapshot schema v4 і створюється shared engine під час входу на boss-stage або першого combat action для legacy save. Якщо час вичерпано після завдання шкоди, наступний combat batch спочатку повертає HP боса до максимуму, скидає combo, створює новий deadline і записує `boss_enraged`, а потім застосовує поточний tap. Клієнт показує countdown із різниці `bossEncounterEndsAt - updatedAt`, тому годинник телефона не визначає результат бою.

Content version 010 робить encounter type частиною shared battle core. Після onboarding stages звичайні вороги детерміновано чергують `Unbound`, `Cracked carapace` (`Tap +20% / Auto -20%`) і `Phaseborn` (`Auto +20% / Tap -20%`). Trait виводиться зі `stage + enemyIndex`, не з клієнтського payload і не з RNG, тому replay тієї самої команди завжди має той самий результат.

Фази `Dominion veil`, `Fracture breach`, `Cataclysm flux` визначаються content table за поточним відсотком HP (`67%`, `34%`, `0%`) і не дублюються у snapshot. Перша й третя фази дають `Auto +15% / Tap -15%`, середня відкриває коротке `Tap +30% / Auto -30%` вікно. Shared engine повторно визначає phase перед кожним hit, тому один batch може коректно перейти поріг HP. Timer, enrage reset і reward лишаються server-authoritative; UI лише показує поточну назву й dominant bonus.

Passive combat лишається одним агрегованим server-authoritative hit на секунду, щоб кількість героїв не прискорювала stage progression через кілька окремих overkill. Подія `monster_hit(source=passive)` містить `heroContributions` із точним `heroId` і damage кожного учасника. Warband HUD, hero-specific projectiles і damage feedback запускаються лише після цієї події; клієнтський таймер не вигадує атаки й не визначає damage. Legacy command events без breakdown нормалізуються з порожнім `heroContributions`.

Per-hero contribution використовує combat profile template, а не raw `hero.power`: Tap-specialist має слабший authoritative auto-hit, Idle-specialist — сильніший. Encounter multiplier застосовується і до агрегованого hit, і до кожного contribution, щоб event breakdown відповідав фактичній шкоді.

Collection grid не створює Pixi/WebGL context на картку: портрети є оптимізованими WebP, картки використовують `content-visibility: auto`, а ambient motion запускається лише в active formation, summon reveal та короткому combat volley. Рішення й майбутній Spine pipeline зафіксовані в [ADR 0003](adr/0003-hero-portrait-rendering.md).

Bulk upgrade має режими `+1`, `+10`, `MAX`. Shared quote послідовно рахує кожну floor-ціну, тому preview та backend action використовують однакову арифметику. `+10` купує до десяти доступних рівнів, `MAX` — до level cap, доступного gold або hard limit у 50 рівнів. Клієнт не передає власну ціну, power чи кінцевий level.

## Перший backend slice

- `GET /api/health`
- `GET /api/game/content`
- `GET /api/game/state?playerId=...`
- `GET /api/game/realms?playerId=...`
- `POST /api/game/realms/join`
- `POST /api/game/realms/select`
- `POST /api/game/action`

Підтримані actions:

- `combat_batch`
- `set_active_warband`
- `summon`
- `upgrade_hero`
- `ascend_hero`
- `claim_offline_rewards`

SQLite використовується як локальна development database через Node 24 `node:sqlite`. Versioned migrations підхоплюють legacy `players` table, а bounded command ledger тримає останні 128 command events на гравця. Окрема append-only таблиця `progression_milestones` зберігає перший перетин ключових stages і не втрачає economy-телеметрію під час очищення ledger. Межа repository навмисно мала, щоб її можна було перенести на Postgres без зміни core engine.
