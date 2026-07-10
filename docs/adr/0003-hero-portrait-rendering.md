# ADR 0003: рендеринг і анімація портретів героїв

## Статус

Прийнято, 2026-07-10.

## Контекст

Колекція має масштабуватися від простих Common до виразних Legendary героїв і лишатися плавною у Telegram Android WebView. PixiJS уже рендерить бойову сцену, але окремий canvas/WebGL context або skeleton runtime для кожної картки створив би зайве GPU/CPU навантаження. Водночас статичні emoji не дають потрібного відчуття цінності рідкісного героя.

## Рішення

1. Базовий asset кожного героя - оригінальний квадратний `512x512 WebP` без тексту, рамки та локалізованих елементів.
2. Collection grid рендерить звичайні `<img>` з lazy loading, async decoding, `content-visibility: auto` та containment. У сітці портрети статичні.
3. Легкий 2.5D motion дозволений лише в active formation, summon reveal і короткому combat volley. Common лишається статичним; Rare отримує aura, Epic - aura/embers, Legendary - breathe/light/motes. `prefers-reduced-motion` та автоматичний render profile вимикають або скорочують ефекти без ручного меню графіки.
4. Поточний Heroes-екран має бюджет не більше восьми одночасних portrait animations навіть на high profile. Сітка зі 120 героями перевіряється browser test.
5. Для майбутніх premium full-body Epic/Legendary анімацій цільовий runtime - `@esotericsoftware/spine-pixi-v8`, бо він працює всередині наявного PixiJS 8 renderer і дозволяє спільно використовувати skeleton data між instances. Runtime підключається лише разом із реальним `.skel`, `.atlas` і texture bundle, після перевірки Spine runtime license; порожню залежність наперед не додаємо.
6. Перша full-body вертикаль для Void Lord реалізована як ліниво завантажуваний багатошаровий PixiJS 2.5D rig: окремі body, left wing і right wing sprites, ореол, chest core, ground sigil та обмежені light motes. Це не підміняє skeletal deformation, але дає незалежний рух великих форм без додаткового runtime.
7. Showcase створює приватний ticker лише після відкриття, автоматично використовує `30/45/60 FPS` і low/high WebP відповідно до render profile, ставиться на паузу у прихованій вкладці та знищує Application і вивантажує texture assets після закриття. Filters, dynamic masks і покадрове перемальовування складних Graphics не використовуються.

## Authoring pipeline для Spine

- Художник готує окремі шари: torso/head, front/back hair, arms, cape, wings, weapon, glow/flame overlays.
- Мінімальний набір анімацій: `idle`, `breathe`, `attack`, `hit`, `ultimate`; для портрета окремо blink, shoulder/chest breathing та rarity effect loop.
- Експорт: binary `.skel` для меншого payload, `.atlas`, WebP/PNG texture pages; texture page не перевищує mobile GPU budget.
- Runtime bundle ліниво вантажиться лише для вибраного героя, summon reveal або активної бойової моделі. Grid і невидимі герої ніколи не створюють skeleton instance.

Rive лишається придатним для vector/state-machine UI, а Live2D - для великих talking busts із face/physics rig. Вони не є default pipeline для мальованих бойових collectible heroes, щоб не підтримувати паралельно три runtime-и.

## Наслідки

- Поточна колекція має преміальний вигляд без збільшення основного JS bundle окремим animation runtime.
- Рідкість читається через арт, frame treatment і обмежений motion, а не через важкі постійні particle systems.
- Для справжньої skeletal deformation потрібна окрема authoring-робота; CSS motion не імітує повноцінний Spine rig.
- Перший showcase є production-ready proof of pipeline: наступний перехід на Spine змінить внутрішню реалізацію rig, але не контракт hero content і не UX відкриття героя.

## Джерела

- Spine Pixi runtime: https://esotericsoftware.com/spine-pixi
- PixiJS performance tips: https://pixijs.com/8.x/guides/concepts/performance-tips
- Rive Web runtime: https://rive.app/docs/runtimes/web/web-js
- Live2D Cubism SDK for Web: https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/
