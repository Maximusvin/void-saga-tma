# Джерела портретів героїв

Чотири портрети пакета `void-saga-content-009` згенеровані спеціально для Void Saga через OpenAI image generation 2026-07-11. Сторонні ігрові assets, логотипи, текст, рамки й локалізовані елементи не використовувалися. Фінальні файли конвертовані у квадратний `512x512 WebP` з quality `82`.

| Файл | Authoring direction | SHA-256 |
| --- | --- | --- |
| `rift-scavenger.webp` | Rugged female rift scavenger, improvised crossbow, worn hood and layered travel gear, restrained teal rift light, Common readability | `54E50BF8712FF2081C1C68869A731BE0F2410A4CCA5477954BB10BE55834EBBC` |
| `storm-ranger.webp` | Dark-skinned elven storm ranger, silver wind-swept braids, large diagonal lightning bow, cyan energy and storm-gray backdrop, Rare readability | `8178363C5FAB235E9799D48E977566E0C7340FEB3B6709A04D4C82A8FF3F2019` |
| `ember-oracle.webp` | Mature South Asian fire oracle, layered ceremonial armor, controlled flame halo, warm ember particles, Epic readability | `31D2AA5E20BA23C604C738DE158CD610F38864703928A88A7B15F1D6A9DC5841` |
| `seraph-aurelia.webp` | White-gold celestial woman, luminous halo, feathered wings, refined armor, pale gold and cyan light, Legendary readability | `2AB94595B11449E2694CC07D1CD2C0135C9AB87E9CB5AE9E1B480720D186E5CA` |

Production-файли лежать у `public/assets/heroes/`. Під час заміни будь-якого портрета треба оновити hash, пройти `heroPortraitAssets.test.ts` і перевірити Heroes grid та summon reveal на viewport `320x568`.
