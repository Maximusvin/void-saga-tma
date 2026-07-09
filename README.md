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

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

## Поточна структура

- `src/store/useGameState.ts` - локальний game state, persistence у `localStorage`, combat/reward/upgrade логіка.
- `src/views/TheRift.tsx` - основний бойовий екран.
- `src/views/SummonCircle.tsx` - gacha summon flow.
- `src/views/HeroesRoster.tsx` - список героїв і upgrade.
- `src/utils/telegram.ts` та `src/utils/haptics.ts` - безпечна інтеграція з Telegram WebApp bridge.

## Примітки для розвитку

- Save поки локальний, без backend і без Telegram user binding.
- Economy поки прототипна: reward/drop/upgrade формули не винесені в баланс-конфіг.
- UI оптимізований під мобільний екран, але ще потребує окремої Telegram theme/viewport політики перед публічним запуском.
