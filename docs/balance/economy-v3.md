# Economy v3 і лінійка героїв

## Цілі прогресії

Це soft-launch baseline до появи достатньої production-телеметрії. Час означає дисциплінований active combat із чотирма taps/s та оптимальними апгрейдами, а не календарний час.

| Checkpoint | Ціль | Simulator |
| --- | ---: | ---: |
| Stage 25 | 12–20 хв | 14,9 хв |
| Stage 50 | 25–40 хв | 30,4 хв |
| Stage 150 | 90–110 хв | 93,5 хв |
| Stage 250 | 150–180 хв | 161 хв |
| Stage 1 000 | 10–14 год | 11,8 год |
| Stage 10 000 | не менше 100 год active combat | 120 год |

Baseline та unlucky start мусять проходити stage 10 000 без hard wall. Solo-Common має перестати бути оптимальним до stage 2 000; після розширення пулу поточна перша межа — stage 330.

## Faucet і sink

| Контур | Правило | Причина |
| --- | --- | --- |
| Normal kill gold | `18%` max HP кожного encounter | Чотири–шість ворогів формують stage reward без одного великого стрибка |
| Boss gold | `125% → 115%` max HP за difficulty band | Boss лишається помітним reward, але не фінансує десятки рівнів сам |
| Tap gold | `10%` фактично знятого HP | Overkill не карбує зайву валюту |
| Offline gold | `2.5%` Warband power за секунду, максимум 8 год | Повернення корисне, але не замінює всі active sinks |
| Hero upgrade | Base 100 gold, `×1.5` за level, rarity cost `1/1.8/3.4/7` | ROI лишається чисельно стабільним і прогнозованим |
| Summon | 10 gems; boss дає 2 gems | Один earned summon приблизно на 25 stage |
| Ascension | Common 3, Rare 2, Epic 2, Legendary 3 shards | Common-only roster має межу, higher rarity duplicates цінніші |

## Summon contract

| Rarity | Rate | Duplicate shards у пулі з 2 templates | Portrait tier |
| --- | ---: | ---: | --- |
| Common | 65% | 2 | Статичний оптимізований WebP |
| Rare | 26,2% | 4 | Легка aura-анімація лише у видимій картці |
| Epic | 8% | 6 | Layered idle у reveal та active Warband |
| Legendary | 0,8% | 10 | Повноцінний premium showcase за окремим lazy chunk |

Після 60 невдалих summon починається soft pity: кожна наступна спроба додає 3 процентні пункти до Legendary rate, пропорційно зменшуючи решту rarity. Вісімдесятий summon без Legendary є hard pity. Odds і залишок до pity мають бути видимі поруч із summon action.

Rarity roll і template roll є різними контрактами. Додавання нового героя не змінює сумарний шанс його rarity: `summonWeight` розподіляє лише вже виграний rarity між templates. Standard pool вимагає однакових ваг усередині rarity, бо на цьому інваріанті побудована pool-scaled shard compensation. Rate-up banner може змінювати ваги лише разом із новою content version, окремим shard contract і повторним simulator gate; базові rarity rates він не змінює.

Щоб новий template не розмивав ascension-прогрес, duplicate reward множиться на кількість активних templates тієї самої rarity. Якщо гравець уже має іншого героя цієї rarity, перше відкриття нового template одразу дає базову компенсацію `1/2/3/5` shards. Тому математичне очікування shards для конкретного героя не падає під час розширення пулу, а перше відкриття rarity не отримує зайвої нагороди.

Бойові профілі змінюють стиль, а не базову силу. За еталонних `4 taps/s` і production crit expectation усі вісім templates мають однаковий множник `1,44 × hero power`: `Tap` переносить більше сили в активні натискання, `Idle` — у passive DPS, `Balanced` зберігає співвідношення `1/1`. Warband бере максимум чотирьох героїв; simulator окремо обирає бойову четвірку за фактичним DPS та інвестиційну четвірку за довгостроковим ROI.

Під час міграції зі schema v6 на v7 наявні герої, stage, gold і gems зберігаються. Перший перехід зі старого hard pity 60 на Economy v3 не збільшує вже обіцяну відстань до гарантії: database migration v6 одноразово додає 20 до `summonPity` наявних профілів із cap 79. Нові профілі після міграції стартують із `0` та нової 80-pull шкали.

## Лінійка з 16 героїв

У production content зараз активні вісім рядків зі статусом `Live`. Решта — затверджена черга контенту: template не додається до summon pool, доки немає окремого portrait asset, kit contract і render-budget test.

| Rarity | Герой | Архетип | Бойова функція | Візуальний напрям | Статус |
| --- | --- | --- | --- | --- | --- |
| Common | Void Grunt | Vanguard | Базовий frontliner | Потерта сталева броня, бірюзові тріщини | Live |
| Common | Rift Scavenger | Ranger | Tap specialist | Саморобний арбалет, плащ мандрівника | Live |
| Common | Ash Guard | Defender | Стабільний passive DPS | Обпалений щит, попелястий обладунок | Planned |
| Common | Mire Alchemist | Support | Підсилення команди | Скляні флакони, болотне зелене світіння | Planned |
| Rare | Void Mage | Arcanist | Arcane projectile | Синя маска, контрольована aura | Live |
| Rare | Storm Ranger | Ranger | Tap specialist | Лук-блискавка, рух волосся від вітру | Live |
| Rare | Iron Cleric | Support | Warband sustain | Латунний halo, біле м'яке світло | Planned |
| Rare | Dusk Assassin | Slayer | Boss finisher | Фіолетовий дим, парні клинки | Planned |
| Epic | Void Knight | Spellblade | Hybrid carry | Темна броня, magenta embers | Live |
| Epic | Ember Oracle | Oracle | Idle specialist | Вогняне волосся, layered flame idle | Live |
| Epic | Frost Colossus | Defender | Boss endurance | Крижаний панцир, холодний туман | Planned |
| Epic | Abyss Reaver | Slayer | Execute damage | Живий чорний клинок, shadow trail | Planned |
| Legendary | Void Lord | Sovereign | Universal carry | Крилатий celestial dragon sovereign | Live |
| Legendary | Seraph Aurelia | Celestial | Idle specialist | Біло-золота броня, halo та м'яке сяйво | Live |
| Legendary | Infernal Tyrant | Demon | Escalating boss damage | Живе полум'я, жар під бронею | Planned |
| Legendary | Chrono Wyrm | Dragon | Tempo control | Сегментоване тіло, часові кільця | Planned |

Перший контентний пакет після Economy v3 ввів `Rift Scavenger`, `Storm Ranger`, `Ember Oracle`, `Seraph Aurelia`: по одному template кожної rarity, чотири оригінальні `512x512 WebP` і окремі combat profiles. Наступний пакет не розширює summon pool, доки не пройде такий самий asset, economy й render-budget gate.

## Production-телеметрія

Simulator задає стартову криву, але не підміняє поведінку реальних гравців. Database migration v5 додає append-only таблицю `progression_milestones`: repository транзакційно записує перше досягнення stages `5, 10, 25, 50, 100, 150, 250, 500, 1 000, 2 500, 5 000, 10 000` разом із server timestamp.

Первинний ключ `(player_id, stage)` робить повтор command ідемпотентним; індекс `(stage, reached_at)` підтримує cohort-аналіз. Старим профілям історичні milestones не вигадуються: вони почнуть давати дані лише на наступних ще не пройдених checkpoints. Після достатньої вибірки цільові вікна змінюються через content version, simulator і committed CSV одним PR.
