# Welcome Back — модалка офлайн-нагород

**Дата:** 2026-07-10
**Статус:** затверджено до реалізації
**Гілка:** `feat/claude/welcome-back-offline-rewards`

## Проблема

Двигун уже нараховує офлайн-золото: дія `claim_offline_rewards` авто-фіриться на старті гри та при поверненні з фону, і повертає подію `offline_rewards_claimed` з полями `goldReward`, `elapsedSeconds`, `cappedSeconds`, `passivePower`. Але ця подія **відкидається** — золото тихо додається до снапшота, а гравцю не показується нічого.

У idle-RPG (як референсний Dungeon Crusher) екран «поки тебе не було, герої заробили X» — це серцевина циклу й головний гачок повернення. Зараз його нема.

## Ціль

Показувати модалку «З поверненням» із зароблене-поки-офлайн золотом, коли гравець повертається після **значущої** відсутності. Коротка відсутність нагороду й далі нараховує тихо (без модалки), щоб не спамити.

## Не-цілі (YAGNI)

- «Подвоїти за рекламу» / будь-яка монетизація.
- Історія клеймів, налаштування порога в UI.
- Зміна економіки чи формул нарахування (двигун лишається як є).

## Тригер і поріг

Модалка зʼявляється, коли claim повертає `offline_rewards_claimed` з `goldReward > 0` **і** `cappedSeconds >= GAME_BALANCE.offlineRewardModalMinSeconds`.

- Новий баланс-констант `offlineRewardModalMinSeconds = 5 * 60` (5 хв). Двигун і далі заробляє від `offlineRewardMinSeconds = 60`; поріг стосується **лише показу модалки**.
- Той самий поріг застосовується до обох наявних call-site: холодний старт (перший claim) і повернення з фону (`visibilitychange`). Це рівно поведінка «холодний старт + resume за порогом».
- **Дедуп безкоштовний:** `claimOfflineRewardsAction` зсуває `lastSeenAt` на «зараз». Наступний claim одразу дає ~0 elapsed → `null` → модалка не дублюється й не блимає двічі за одну відсутність.

## Архітектура

Три ізольовані одиниці + два адитивні дотики до наявних файлів.

### 1. `src/game/offlineReward.ts` (нова, чиста, без React/DOM)

```ts
export interface OfflineRewardSummary {
  goldReward: GameNumber;   // скільки золота нараховано
  awaySeconds: number;      // cappedSeconds — вікно, за яке заплачено
  awayLabel: string;        // "2г 14хв" — людський формат
  passivePower: GameNumber; // швидкість загону (для рядка контексту)
  cappedAt: boolean;        // true, якщо реальна відсутність > стелі 8г
}

export const summarizeOfflineReward = (
  events: readonly GameEvent[],
  minSeconds: number,
): OfflineRewardSummary | null;

export const formatAwayDuration = (seconds: number): string; // "45хв", "2г 14хв", "8г"
```

`summarizeOfflineReward` сам знаходить у масиві подію `offline_rewards_claimed` (перший claim повертає масив events) і повертає `null`, якщо її нема, або `goldReward <= 0`, або `cappedSeconds < minSeconds`. `cappedAt = elapsedSeconds > cappedSeconds`. Приймання масиву робить стор тривіальним: `setOfflineReward(summarizeOfflineReward(events, minSeconds))`.

**Чому окремий модуль:** уся логіка «показувати чи ні» і форматування — чиста функція, тестується без браузера. Стор і компонент лишаються тонкими.

### 2. `src/components/WelcomeBackModal.tsx` + `.css` (нові, самодостатні)

Пропси: `{ reward: OfflineRewardSummary; onCollect: () => void }`. Рендерить оверлей:

- Заголовок «З поверненням».
- Рядок часу: «Тебе не було {awayLabel}» + приписка «максимум 8г» коли `cappedAt`.
- Велике золото: `+{formatNumber(goldReward)}` у золотому акценті.
- Рядок контексту: «Загін фармив {formatNumber(passivePower)}/с».
- Кнопка «Забрати» (`btn-primary`) → `onCollect`.

Поважає `prefers-reduced-motion` (через `useReducedMotion`). Легка юnorth: мʼякий shimmer монет, без важких `filter`/великих blur (узгоджено з профілем рендера). Обгортка — `AnimatePresence` у батька.

### 3. `useGameState.ts` (адитивно)

- Новий стан `const [offlineReward, setOfflineReward] = useState<OfflineRewardSummary | null>(null)`.
- Хелпер усередині хука `applyOfflineRewardEvents(events)`: `const summary = summarizeOfflineReward(events, GAME_BALANCE.offlineRewardModalMinSeconds); if (summary) setOfflineReward(summary);`. Умова `if (summary)` важлива: claim без нагороди не має гасити вже показану модалку.
- Два наявні call-site (`void runGameAction({ type: 'claim_offline_rewards' })`) → `void runGameAction(...).then(applyOfflineRewardEvents)`.
- Експорт `offlineReward` і `dismissOfflineReward: () => setOfflineReward(null)`.

### 4. `App.tsx` (адитивно, один блок)

Над/поряд із `RealmSwitcher`, у `AnimatePresence`:

```tsx
{gameState.offlineReward && (
  <WelcomeBackModal
    reward={gameState.offlineReward}
    onCollect={gameState.dismissOfflineReward}
  />
)}
```

### 5. `src/game/balance.ts` (адитивно)

Додати `offlineRewardModalMinSeconds: 5 * 60` у `GAME_BALANCE`.

## Потік даних

```
старт / visibilitychange
  → runGameAction('claim_offline_rewards')   (уже існує)
  → двигун: offline_rewards_claimed { goldReward, cappedSeconds, elapsedSeconds, passivePower }
  → applyOfflineRewardEvents → summarizeOfflineReward(event, offlineRewardModalMinSeconds)
  → якщо summary != null: setOfflineReward(summary)
  → App рендерить <WelcomeBackModal>
  → гравець тисне «Забрати» → dismissOfflineReward() → стан null → модалка зникає
```

Золото вже нараховане у снапшоті двигуном; модалка нічого не додає — лише показує. Це гарантує, що показане число = реально нараховане (жодного розходження UI ↔ стан).

## Обробка помилок / крайові

- Немає активних героїв → `passivePower = 0` → `goldReward = 0` → `null` → модалки нема. Коректно.
- Відсутність < 5 хв → `null` → золото додане тихо, модалки нема.
- Backend `error`/`loading` → `automaticActionsEnabled` = false → claim не фіриться (як зараз). Модалка зʼявиться, коли sync відновиться і claim пройде. Коректно.
- Реальна відсутність > 8г → показуємо вікно 8г + приписку «максимум 8г».

## Тести

- **Юніт `offlineReward.test.ts`:** нижче порога → `null`; ≥ порога → сумарі з правильними полями; не-offline подія → `null`; `goldReward = 0` → `null`; `cappedAt` true коли `elapsed > capped`; `formatAwayDuration` для хв/год/стелі. (Покриває нову поверхню — B5.)
- **e2e `navigation.spec.ts`:** сид `rift_heroes_save` з `lastSeenAt` ~1 год тому і активним героєм → завантаження → модалка «З поверненням» видима із золотом → клік «Забрати» → модалка зникла. Чистий DOM (не WebGL) → без headless-GPU-флаку. Falsification: без сиду-давнини модалка не зʼявляється.

## Режими

Працює і в backend-, і в local-режимі: `canDispatchAutomaticGameActions` повертає true при `!apiEnabled`, тож offline-claim (а отже модалка) активний і в прев'ю/e2e.

## Колізія з Codex

Codex паралельно тримає незакомічений `ShopView` і редагує `useGameState.ts` / `App.tsx`. Усі мої дотики до цих файлів — **адитивні** (новий стан + новий блок рендера). Пуш рано; за потреби ребейз тривіальний. Нові файли (`offlineReward.ts`, `WelcomeBackModal.*`) колізій не мають.
