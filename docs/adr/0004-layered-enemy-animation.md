# ADR 0004: багатошарова анімація противників у PixiJS

## Статус

Прийнято, 2026-07-10.

## Контекст

Противник у Telegram Mini App має постійно виглядати живим, реагувати на точку удару без затримки та не створювати відео-пакет на кілька мегабайт. Водночас деформація єдиного PNG дає «гумовий» силует, а покадровий sprite sheet погано масштабується на десятки противників. У грі вже є один PixiJS canvas із керованим ticker lifecycle, тому окремий WebGL context або skeleton runtime для першої вертикалі додав би зайву складність.

## Рішення

1. `Ironroot Marauder` на stage 2 використовує внутрішній adapter `EnemyRig` із реалізаціями `layered-pixi` та `static-sprite`. Інші противники зберігають чинний статичний pipeline.
2. Layered rig складається з 21 перекривного елемента: корпус, таз, голова, борода, плечі, сегменти рук і ніг, кисті, стопи, кристали, glow та три локальні mesh-смуги моху. Приховані ділянки під суглобами присутні в authoring source; runtime не ріже готовий PNG.
3. Великі тверді форми рухаються ієрархічними Pixi containers. Локальний `MeshPlane` застосовується лише до моху, де вигин природний; камінь і суглоби не розтягуються.
4. `idle` поєднує несинхронні частоти дихання, перенесення ваги, голови, бороди, моху та glow. `prefers-reduced-motion` вимикає idle, але залишає короткий малий recoil.
5. `EnemyImpactSignal` несе унікальний id і нормалізовану точку удару. Пружинний solver додає обмежений імпульс до поточного стану, тому до 10 тапів за секунду не перезапускають кліп і не накопичують необмежений рух. `EnemyCritSignal` підсилює світло й частинки, але не створює другий recoil.
6. Смерть Ironroot триває 700 мс: старий rig лишається в canvas, коліна підкошуються, корпус і вторинні елементи запізнюються, після чого canvas переходить до наступного противника. Серверний `monster_hit`, batching, damage та economy не змінюються.
7. `RiftEnemyVisualSpec.rig` містить high/low atlas, manifest і чинний `asset` як fallback. Runtime завантажує один варіант за render profile та повертається до `static-sprite`, якщо atlas або manifest невалидний.
8. Root rig має постійний нормалізований scale `1`. Розмір у сцені задається одноразовим fit-scale, а не анімацією всього силуету. Глобальні squash, skew і shake `.rift-beast-shell` для Ironroot вимкнені.

## Арт-пайплайн і бюджети

- Authoring source: `art-source/rift/ironroot/ironroot-rig-source.ora`; файл не потрапляє в `public`.
- High atlas: `1024x1024 WebP`, 285 814 байтів при бюджеті до 450 КБ.
- Low atlas: `512x512 WebP`, 106 274 байти при бюджеті до 200 КБ.
- Обидва manifests містять однаковий набір із 21 frame та перевіряються asset-тестом.
- Тонкі краї моху й бороди проходять alpha-перевірку; magenta-key source не постачається в runtime.

## Верифікація

- Unit-тести перевіряють напрямок recoil, bounded rapid taps, повернення до rest pose, delta-time clamp, reduced-motion, crit без другого імпульсу та death progress.
- Asset-тест перевіряє frame set, межі atlas, ненульові розміри, high/low parity і вагові бюджети.
- Playwright перевіряє один canvas, відсутність scene rebuild на тапах, лівий/правий recoil, 10 rapid taps, нормалізований scale `1`, death handoff та static fallback.

## Коли переходити на Spine

Spine стає виправданим, коли щонайменше кілька противників потребуватимуть спільного authoring pipeline, складних constraints, skin swapping або довших наборів `idle/hit/attack/death`. Adapter `EnemyRig` є точкою заміни: зовнішні impact/crit/death сигнали та `RiftEnemyVisualSpec` не повинні змінитися. До появи реального `.skel/.atlas` bundle і підтвердженої ліцензії залежність `spine-pixi-v8` не додаємо.

## Наслідки

- Перший противник отримує живу реакцію без відео, sprite sheet і деформації цілісного PNG.
- Один canvas і чинний lifecycle зберігають GPU/CPU бюджет Telegram WebView.
- Ціна якості переноситься в одноразову підготовку перекривних шарів, а не в runtime payload.
- Для наступного противника можна повторити той самий adapter і solver або обґрунтовано перейти на Spine, не переписуючи бойовий контракт.
