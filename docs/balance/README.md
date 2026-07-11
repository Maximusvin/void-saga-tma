# Перевірка балансу

`src/game/balanceSimulator.ts` програє детермінований шлях від сцени 1 до 10 000 на тих самих формулах, які використовує серверне ядро. Він не замінює плейтест, але ловить числові стіни, зламані sinks і регресії великих чисел до того, як вони потраплять у UI.

## Модель

- 4 taps/s;
- очікуване значення критичного удару;
- без combo bonus, offline rewards та затримок UI;
- boss gems автоматично витрачаються на summon;
- deterministic summon sequence відтворює розподіл Common/Rare/Epic/Legendary `60/28/10/2`;
- adversarial RNG sequence завжди повертає Common roll, але проходить через той самий hard pity, що й серверне ядро;
- duplicate дає rarity-scaled shards; ascension коштує 3 shards для Common, 2 для Rare/Epic і 3 для Legendary та відкриває наступні 50 рівнів;
- звичайний stage містить 3 encounters до stage 200, 4 до stage 1000 і 5 далі; boss-stage містить одного боса;
- цільовий TTK: до 10 секунд на звичайного ворога та до 40 секунд для боса;
- hard limit boss-спроби зростає від 45 до 60 секунд за difficulty band; simulator окремо перевіряє target TTK і серверний enrage deadline;
- перед боєм купується найкращий доступний апгрейд, поки TTK не вкладається в ціль;
- ROI з різницею до 0,1% вважається еквівалентним, тоді прокачується герой нижчого рівня;
- click gold оцінюється за часткою tap damage у загальному DPS.

Це модель активного дисциплінованого гравця, а не прогноз реальної тривалості сесії. Для продуктових рішень її треба поєднувати з телеметрією та ручним плейтестом.

## Сценарії

- `baseline-three-summons`: два унікальні герої та один Common duplicate після стартових трьох summon;
- `unlucky-common-start`: старт із трьох Common, після якого нові summon можуть відновити roster;
- `adversarial-rng-pity`: нескінченна серія найгіршого Common roll; кожен 60-й summon примусово дає Legendary;
- `solo-common`: гравець використовує Common duplicates, але свідомо ігнорує нових героїв.

Baseline, невдалий Common-only старт і adversarial RNG не мають TTK walls до stage 10 000. Adversarial сценарій окремо доводить, що hard pity спрацьовує навіть тоді, коли RNG ніколи сам не дає Legendary. `solo-common` уперше виходить за TTK budget на stage 774 і накопичує 8 673 progression-blocked stages. Отже, невдала випадкова серія лишається відновлюваною, але довгострокова відмова від колекціонування більше не є оптимальною.

Baseline досягає stage 150 приблизно за 59 хвилин модельного active combat, stage 1000 за 7,6 години, а stage 10 000 за 82,4 години. Він виконує 11 995 окремих level increases як математичні кроки. UI не має вимагати стільки команд: bounded `MAX` групує до 50 послідовних рівнів, не змінюючи gold/power результат симуляції.

## Запуск

```bash
npm run balance:simulate
npm run balance:simulate -- --write
```

`--write` оновлює [baseline checkpoints](baseline-progression.csv) і [scenario summary](scenario-summary.csv). Серверні тести перевіряють, що committed таблиці точно відповідають формулам.
