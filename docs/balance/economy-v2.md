# Economy v2 і лінійка героїв

## Цілі прогресії

Це soft-launch baseline до появи достатньої production-телеметрії. Час означає дисциплінований active combat із чотирма taps/s та оптимальними апгрейдами, а не календарний час.

| Checkpoint | Ціль | Simulator |
| --- | ---: | ---: |
| Stage 25 | 8–15 хв | 10,1 хв |
| Stage 50 | 15–30 хв | 20,0 хв |
| Stage 150 | 55–80 хв | 59,2 хв |
| Stage 250 | 90–130 хв | 102,8 хв |
| Stage 1 000 | 7–10 год | 7,6 год |
| Stage 10 000 | не менше 72 год active combat | 82,4 год |

Baseline та unlucky start мусять проходити stage 10 000 без hard wall. Solo-Common має перестати бути оптимальним до stage 1 000; поточна перша межа — stage 774.

## Faucet і sink

| Контур | Правило | Причина |
| --- | --- | --- |
| Normal kill gold | `18%` max HP кожного encounter | Три–п'ять ворогів формують stage reward без одного великого стрибка |
| Boss gold | `125% → 115%` max HP за difficulty band | Boss лишається помітним reward, але не фінансує десятки рівнів сам |
| Tap gold | `10%` фактично знятого HP | Overkill не карбує зайву валюту |
| Offline gold | `2.5%` Warband power за секунду, максимум 8 год | Повернення корисне, але не замінює всі active sinks |
| Hero upgrade | Base 100 gold, `×1.5` за level, rarity cost `1/1.8/3.4/7` | ROI лишається чисельно стабільним і прогнозованим |
| Summon | 10 gems; boss дає 2 gems | Один earned summon приблизно на 25 stage |
| Ascension | Common 3, Rare 2, Epic 2, Legendary 3 shards | Common-only roster має межу, higher rarity duplicates цінніші |

## Summon contract

| Rarity | Rate | Duplicate shards | Portrait tier |
| --- | ---: | ---: | --- |
| Common | 60% | 1 | Статичний оптимізований WebP |
| Rare | 28% | 2 | Легка aura-анімація лише у видимій картці |
| Epic | 10% | 3 | Layered idle у reveal та active Warband |
| Legendary | 2% | 5 | Повноцінний premium showcase за окремим lazy chunk |

Hard pity спрацьовує на 60-му summon без Legendary. Odds і залишок до pity мають бути видимі поруч із summon action. Rate-up banner у майбутньому може міняти ваги templates лише всередині rarity; сумарний rarity rate не змінюється без нової content version.

Під час міграції зі schema v6 на v7 наявні герої, stage, gold і gems зберігаються. `summonPity` для старих профілів починається з `0`: попередня схема не зберігала повну історію summon, тому відновлювати лічильник припущенням небезпечно. Нові профілі одразу стартують із v7.

## Лінійка з 16 героїв

У production content зараз активні лише чотири рядки зі статусом `Live`. Решта — затверджена черга контенту: template не додається до summon pool, доки немає окремого portrait asset, kit contract і render-budget test.

| Rarity | Герой | Архетип | Бойова функція | Візуальний напрям | Статус |
| --- | --- | --- | --- | --- | --- |
| Common | Void Grunt | Vanguard | Базовий frontliner | Потерта сталева броня, бірюзові тріщини | Live |
| Common | Rift Scavenger | Ranger | Швидкі одиночні удари | Саморобний арбалет, плащ мандрівника | Planned |
| Common | Ash Guard | Defender | Стабільний passive DPS | Обпалений щит, попелястий обладунок | Planned |
| Common | Mire Alchemist | Support | Підсилення команди | Скляні флакони, болотне зелене світіння | Planned |
| Rare | Void Mage | Arcanist | Arcane projectile | Синя маска, контрольована aura | Live |
| Rare | Storm Ranger | Ranger | Crit pressure | Лук-блискавка, рух волосся від вітру | Planned |
| Rare | Iron Cleric | Support | Warband sustain | Латунний halo, біле м'яке світло | Planned |
| Rare | Dusk Assassin | Slayer | Boss finisher | Фіолетовий дим, парні клинки | Planned |
| Epic | Void Knight | Spellblade | Hybrid carry | Темна броня, magenta embers | Live |
| Epic | Ember Oracle | Arcanist | Area burst | Вогняне волосся, layered flame idle | Planned |
| Epic | Frost Colossus | Defender | Boss endurance | Крижаний панцир, холодний туман | Planned |
| Epic | Abyss Reaver | Slayer | Execute damage | Живий чорний клинок, shadow trail | Planned |
| Legendary | Void Lord | Sovereign | Universal carry | Крилатий celestial dragon sovereign | Live |
| Legendary | Seraph Aurelia | Celestial | Team amplification | Реалістичне дихання, blink, волосся і крила | Planned |
| Legendary | Infernal Tyrant | Demon | Escalating boss damage | Живе полум'я, жар під бронею | Planned |
| Legendary | Chrono Wyrm | Dragon | Tempo control | Сегментоване тіло, часові кільця | Planned |

Перший контентний пакет після Economy v2: `Rift Scavenger`, `Storm Ranger`, `Ember Oracle`, `Seraph Aurelia`. Він додає по одному template кожної rarity та перевіряє, що rarity roll і внутрішня template weight є окремими рівнями випадковості.
