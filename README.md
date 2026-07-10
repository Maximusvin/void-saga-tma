# Void Saga TMA

Telegram Mini App прототип клікер/RPG-гри: гравець б'є монстрів у Rift, отримує gold/gems, призиває героїв і прокачує roster для passive DPS.

## Стек

- Vite
- React 19
- TypeScript
- Framer Motion
- PixiJS 8
- Lucide React
- Canvas Confetti
- Oxlint

## Локальний запуск

```bash
npm ci
npm run dev
```

Backend API:

```bash
npm run server:dev
```

SQLite файл за замовчуванням створюється в `data/void-saga.sqlite`. Для локального smoke або ізольованого середовища можна задати інший шлях:

```bash
VOID_SAGA_DB_PATH=data/dev.sqlite npm run server:dev
```

Telegram auth режим для backend:

```bash
TELEGRAM_BOT_TOKEN=<bot-token-from-botfather> npm run server:dev
```

Frontend зі станом через backend:

```bash
VITE_GAME_API_URL=http://127.0.0.1:8787 VITE_PLAYER_ID=dev-player npm run dev
```

Production build:

```bash
npm run build
```

VPS deployment через наявний Coolify/Traefik reverse proxy описано в [`docs/vps-deployment.md`](docs/vps-deployment.md). Production compose не публікує host-порти та зберігає SQLite у named volume.

Lint:

```bash
npm run lint
```

Server тести:

```bash
npm run test:server
```

Browser navigation regression:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Детермінована перевірка economy від сцени 1 до 10 000:

```bash
npm run balance:simulate
```

Припущення, сценарії та committed розрахункові таблиці описані в [`docs/balance/README.md`](docs/balance/README.md).

## Поточна структура

- `server/` - Node API з versioned SQLite migrations, player snapshots та bounded idempotency ledger.
- `src/game/content.ts` - versioned content seed: heroes, summon pool, rarity metadata, stage bands і boss rules.
- `src/game/balance.ts` - формули economy/combat/summon balance: HP scaling, rewards, crit, upgrade cost і helper exports для UI.
- `src/game/balanceSimulator.ts` - відтворювана TTK/ROI/economy симуляція та CSV-звіти до stage 10 000.
- `src/game/engine.ts` - чисті action-розрахунки для бою, summon і upgrade.
- `src/game/types.ts` - спільні типи гри.
- `src/store/useGameState.ts` - React state adapter: backend API source of truth через `VITE_GAME_API_URL` або `localStorage` fallback без API.
- `src/api/actionOutbox.ts` - локальний ordered outbox для retry тієї самої команди після network failure або reload.
- `src/views/TheRift.tsx` - основний бойовий екран.
- `src/views/SummonCircle.tsx` - gacha summon flow.
- `src/views/HeroesRoster.tsx` - список героїв і upgrade.
- `src/utils/telegram.ts` та `src/utils/haptics.ts` - безпечна інтеграція з Telegram WebApp bridge.
- `src/observability/` - privacy-safe client error contract і доставлення Telegram-authenticated telemetry у backend runtime logs.

## Анімаційний підхід

Проєкт використовує `framer-motion` для DOM/UI-анімацій: transitions, gestures, появи/зникнення елементів і micro-interactions.

`PixiJS` рендерить істоту Rift, hit/death particles і shockwaves через Canvas/WebGL. Він завантажується окремим lazy chunk, а один `Application` живе протягом усього бойового екрану; зміна stage перебудовує лише display tree, не WebGL-контекст. React лишається власником HUD і меню.

## Примітки для розвитку

- Backend persistence має локальний SQLite scaffold, а frontend вже може працювати через backend adapter, якщо задано `VITE_GAME_API_URL`.
- Без `VITE_GAME_API_URL` frontend лишається в автономному `localStorage` fallback для швидкого прототипування.
- Якщо `TELEGRAM_BOT_TOKEN` заданий, backend вимагає signed `Telegram.WebApp.initData` у заголовку `x-telegram-init-data` і сам виводить `playerId` у форматі `telegram:<id>`.
- Якщо `TELEGRAM_BOT_TOKEN` не заданий, backend дозволяє dev `playerId` fallback лише поза `NODE_ENV=production`; production працює fail-closed.
- Frontend підключає офіційний `telegram-web-app.js` у `<head>`, використовує stable Telegram viewport і передає лише raw `initData`, який перевіряє backend. Після перевірки backend повертає bounded `playerProfile` з ім'ям, username і HTTPS `photoUrl`; HUD не довіряє `initDataUnsafe` у production, не надсилає referrer для фото й має fallback з ініціалами.
- React render crash показує відновлюваний fallback замість чорного екрана; render/global errors надсилаються у bounded endpoint `POST /api/client-errors`, який редагує credential-like дані, хешує player id і rate-limit-ить події.
- Backend приймає лише кількість taps/passive ticks, сам рахує combo/crit/damage і зберігає результат команди транзакційно; клієнт не може передати власний damage або summon RNG.
- Passive tick повертає один агрегований hit із per-hero `heroContributions`; warband HUD і projectiles відтворюють лише цей підтверджений event, не локальний декоративний DPS-таймер.
- Gold, power, HP, damage, costs і rewards використовують `GameNumber` на базі `decimal.js-light` та серіалізуються як decimal strings; legacy numeric snapshots мігрують під час читання.
- Snapshot schema v4 зберігає серверний deadline поточної boss-спроби. Hero progression із v3 лишається незмінною: один герой на content template, duplicate summon дає shards, ascension за 2 shards відкриває наступні 50 рівнів, а backend відхиляє upgrade понад level cap.
- `upgrade_hero` підтримує `amount: 1 | 10 | "max"`: сервер сам рахує точну сумарну ціну, купує доступні рівні до cap і обмежує одну команду 50 рівнями. Відсутній `amount` backward-compatible означає `1`.
- Frontend групує taps у 80 ms batches до 20 taps, а підтверджена команда видаляється з outbox лише після відповіді API.
- Economy має typed balance-конфіг і versioned content seed, але самі формули ще прототипні й потребують плейтесту.
- Offline rewards рахуються backend/core action `claim_offline_rewards`: reward залежить від hero passive power, має мінімальний offline window і capped максимум.
- UI оптимізований під мобільний і stable Telegram viewport, але ще потребує окремої Telegram theme-політики перед публічним запуском.

## Backend API

- `GET /api/health`
- `GET /api/game/content` повертає `contentVersion`, `content`, `balance` і backward-compatible `summonPool`
- `GET /api/game/state?playerId=<id>` у dev fallback або `GET /api/game/state` з `x-telegram-init-data` у Telegram auth режимі; відповідь містить snapshot і перевірений `playerProfile`
- `POST /api/game/action`
- `POST /api/client-errors` приймає bounded client telemetry з Telegram auth і записує privacy-safe structured event у backend runtime logs

Action payload:

```json
{
  "playerId": "dev-player-only-without-TELEGRAM_BOT_TOKEN",
  "commandId": "cmd:example-0001",
  "action": { "type": "combat_batch", "tapCount": 8, "passiveTicks": 0 }
}
```

У Telegram auth режимі `playerId` у body не потрібен і не є джерелом правди; backend бере гравця з валідованого `x-telegram-init-data`.

Offline reward action:

```json
{
  "commandId": "cmd:example-0002",
  "action": { "type": "claim_offline_rewards" }
}
```

Bounded bulk upgrade action:

```json
{
  "commandId": "cmd:example-0003",
  "action": {
    "type": "upgrade_hero",
    "heroId": "void-grunt",
    "amount": "max"
  }
}
```

Допустимі значення `amount`: `1`, `10`, `"max"`. Поле можна пропустити для backward-compatible `+1`.
