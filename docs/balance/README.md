# Перевірка балансу

`src/game/balanceSimulator.ts` програє детермінований шлях від сцени 1 до 10 000 на тих самих формулах, які використовує серверне ядро. Він не замінює плейтест, але ловить числові стіни, зламані sinks і регресії великих чисел до того, як вони потраплять у UI.

## Модель

- 4 taps/s;
- очікуване значення критичного удару;
- без combo bonus, offline rewards, summon RNG та затримок UI;
- boss gems автоматично витрачаються на summon;
- deterministic summon sequence використовує production rarity roll `65/26.2/8/0.8`, soft pity після 60 невдач і hard pity на 80-й спробі;
- duplicate дає rarity-scaled shards; ascension коштує 3 shards для Common, 2 для Rare/Epic і 3 для Legendary та відкриває наступні 50 рівнів;
- звичайний stage містить 4 encounters до stage 200, 5 до stage 1000 і 6 далі; boss-stage містить одного боса;
- цільовий TTK: до 14 секунд на звичайного ворога та до 55 секунд для боса;
- hard limit boss-спроби зростає від 60 до 75 секунд за difficulty band; simulator окремо перевіряє target TTK і серверний enrage deadline;
- перед боєм купується найкращий доступний апгрейд, поки TTK не вкладається в ціль;
- ROI з різницею до 0,1% вважається еквівалентним, тоді прокачується герой нижчого рівня;
- click gold оцінюється за часткою tap damage у загальному DPS.

Це модель активного дисциплінованого гравця, а не прогноз реальної тривалості сесії. Для продуктових рішень її треба поєднувати з телеметрією та ручним плейтестом.

## Сценарії

- `baseline-three-summons`: два унікальні герої та один Common duplicate після стартових трьох summon;
- `unlucky-common-start`: старт із трьох Common, після якого нові summon можуть відновити roster;
- `solo-common`: гравець використовує Common duplicates, але свідомо ігнорує нових героїв.

Baseline та невдалий Common-only старт не мають TTK walls до stage 10 000. `solo-common` уперше виходить за TTK budget на stage 1 660 і накопичує 6 303 progression-blocked stages. Отже, невдала випадкова серія лишається відновлюваною, але довгострокова відмова від колекціонування більше не є оптимальною.

Baseline досягає stage 150 приблизно за 93,5 хвилини модельного active combat, stage 1000 за 11,8 години, а stage 10 000 за 119 годин. Він виконує 11 895 окремих level increases як математичні кроки. UI не має вимагати стільки команд: bounded `MAX` групує до 50 послідовних рівнів, не змінюючи gold/power результат симуляції.

Production repository окремо записує перший перетин ключових stage у `progression_milestones`. Це дає реальну cohort-тривалість без залежності від bounded command ledger і без довіри до клієнтського часу; контракт описаний у [Economy v3](economy-v3.md).

## Запуск

```bash
npm run balance:simulate
npm run balance:simulate -- --write
```

`--write` оновлює [baseline checkpoints](baseline-progression.csv) і [scenario summary](scenario-summary.csv). Серверні тести перевіряють, що committed таблиці точно відповідають формулам.
