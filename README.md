# Void Saga TMA

Telegram Mini App прототип клікер/RPG-гри: гравець б'є монстрів у Rift, отримує gold/gems, призиває героїв і прокачує roster для passive DPS.

## Стек

- Vite
- React 19
- TypeScript
- Framer Motion
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

Frontend зі станом через backend:

```bash
VITE_GAME_API_URL=http://127.0.0.1:8787 VITE_PLAYER_ID=dev-player npm run dev
```

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Поточна структура

- `server/` - Node API з локальною SQLite persistence для player snapshots.
- `src/game/balance.ts` - єдине місце для economy/combat/summon balance: HP scaling, rewards, crit, upgrade cost, summon pool, rarity colors/icons.
- `src/game/engine.ts` - чисті action-розрахунки для бою, summon і upgrade.
- `src/game/types.ts` - спільні типи гри.
- `src/store/useGameState.ts` - React state adapter: backend API source of truth через `VITE_GAME_API_URL` або `localStorage` fallback без API.
- `src/views/TheRift.tsx` - основний бойовий екран.
- `src/views/SummonCircle.tsx` - gacha summon flow.
- `src/views/HeroesRoster.tsx` - список героїв і upgrade.
- `src/utils/telegram.ts` та `src/utils/haptics.ts` - безпечна інтеграція з Telegram WebApp bridge.

## Анімаційний підхід

Проєкт використовує `framer-motion`. Це не ігровий renderer, а якісна React-бібліотека для DOM/UI-анімацій: transitions, gestures, spring-анімації, появи/зникнення елементів, micro-interactions.

`PixiJS` - інший клас інструмента: canvas/WebGL renderer для sprite-based 2D-ігор, сцен, камер, particle systems і великої кількості об'єктів. Для поточного Telegram idle/clicker UI `framer-motion` доречний. Якщо Rift має стати повноцінною 2D-битвою зі спрайтами, картою, projectile physics і десятками ефектів на екрані, тоді варто винести бойову сцену в `PixiJS`, а React лишити для HUD/меню.

## Примітки для розвитку

- Backend persistence має локальний SQLite scaffold, а frontend вже може працювати через backend adapter, якщо задано `VITE_GAME_API_URL`.
- Без `VITE_GAME_API_URL` frontend лишається в автономному `localStorage` fallback для швидкого прототипування.
- Telegram user binding читає `Telegram.WebApp.initDataUnsafe.user.id`, але server-side initData validation ще не підключена.
- Economy винесена в typed balance-конфіг, але самі формули ще прототипні й потребують плейтесту.
- UI оптимізований під мобільний екран, але ще потребує окремої Telegram theme/viewport політики перед публічним запуском.

## Backend API

- `GET /api/health`
- `GET /api/game/content`
- `GET /api/game/state?playerId=<id>`
- `POST /api/game/action`

Action payload:

```json
{
  "playerId": "telegram-or-dev-id",
  "action": { "type": "deal_damage", "amount": 25, "source": "tap" }
}
```
