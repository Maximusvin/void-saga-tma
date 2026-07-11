# ADR 0004: цілісний skinned 3D-противник у браузерній сцені

## Статус

Прийнято, 2026-07-11. Попереднє рішення про багатошаровий Pixi-rig відхилено після візуальної перевірки: межі частин і неприродні суглоби були помітні в русі.

## Контекст

Ironroot Marauder має постійно виглядати живим, за один кадр реагувати на напрямок тапу та помирати перед переходом до наступного ворога. Відео й покадрові sprite sheets створюють завеликий payload, а розкладення однієї ілюстрації на 2D-частини не відновлює приховану геометрію та дає видимі шви. Для прийнятної якості потрібен цілісний об’ємний персонаж зі шкірою, скелетом і vertex weights.

## Рішення

1. `Ironroot Marauder` на stage 2 використовує цілісний skinned GLB: один mesh, один PBR material, один skeleton і кліпи `Idle`, `HitLeft`, `HitRight`, `Death`.
2. Модель отримана через image-to-3D pipeline Tripo P1 із чинного дизайн-референсу. Автоматичні preset-анімації відхилено через надмірний root motion. Фінальні кліпи вручну поставлено в Blender зі стабільними стопами, компенсацією таза, запізненням голови та рук.
3. Three.js завантажується через `React.lazy` лише коли поточний scene-enemy має `rig.kind = skinned-three`. Pixi-сцена на цей час демонтована, тому одночасно існує рівно один canvas і один WebGL context.
4. `Idle` працює циклічно. `HitLeft` і `HitRight` переводяться у additive clips та граються з пулу з чотирьох actions; часті тапи додають обмежену реакцію без скидання всього skeleton у rest pose. `EnemyCritSignal` підсилює локальне світло, але не додає другого recoil.
5. `Death` є one-shot clip із `clampWhenFinished`; чинна затримка scene handoff лишає Ironroot на екрані до завершення падіння. Backend, `monster_hit`, batching, damage та economy не змінюються.
6. `prefers-reduced-motion` вимикає idle, зменшує вагу hit і пришвидшує короткий death feedback.
7. Якщо WebGL, GLB або Meshopt не завантажуються, компонент показує чинний `ironroot-marauder.webp`. Інші противники залишаються на статичному Pixi pipeline.
8. Tripo API trial output використовується на невиключній комерційній основі згідно з пунктом 3.2 чинних Tripo Terms. Tripo зберігає права Free User output за пунктом 5.2.1; проєкт не заявляє ексклюзивне володіння. Ліцензійний висновок прив'язано SHA-256 до конкретних source/runtime binaries у `art-source/rift/ironroot-3d/provenance.json`.
9. Наступний Ironroot encounter у фоновому idle-вікні preload-ить lazy runtime та відповідний automatic render profile GLB. Version query прив'язаний до SHA-256, тому production може кешувати модель як `immutable` без ризику застарілого арту.

## Арт-пайплайн і бюджети

- Authoring source: `art-source/rift/ironroot-3d/ironroot-marauder.blend`, поза `public`.
- Геометрія: 11 881 triangles, 56 source bones, один skinned mesh, один material.
- High runtime: `1024px WebP + Meshopt`, 704 812 байтів.
- Low runtime: `512px WebP + Meshopt`, 505 544 байти.
- Runtime animation payload усередині GLB: `Idle`, два directional hit clips і `Death`; окремі відео або sprite sheets не постачаються.
- WebP декодується браузером; окремий Basis/KTX2 transcoder більше не постачається. Це прибрало 584 862 байти статичних decoder assets і KTX2 loader із lazy JS.
- Lazy Three.js runtime розділений Rolldown на чанки не більше 500 КБ; CI-бюджет становить максимум 170 КБ gzip. Разом із моделлю cold network budget — 720 КБ для LOW/AVERAGE та 920 КБ для HIGH.
- Компроміс WebP: GPU розгортає текстури в RGBA. Runtime вимірює conservative proxy як `canvas RGBA + decoded texture RGBA`: до 3,2 МБ texture bytes для LOW/AVERAGE і до 12,6 МБ для HIGH, загальний proxy до 17 МБ. Це не vendor-specific точний VRAM counter, якого WebGL не надає.

## Верифікація

- Blender contact sheets перевіряють silhouette stability, planted feet, відсутність root scale та читабельність ключових поз.
- Asset-тест читає GLB container, перевіряє один mesh/skin, точний набір кліпів, `EXT_meshopt_compression`, `EXT_texture_webp`, MIME та high/low бюджети.
- Playwright перевіряє один canvas, `skinned-three`, різний hit для лівого/правого тапу, 10 rapid taps без scene rebuild, death handoff, context-loss cleanup і static fallback.
- Окремий browser gate для Telegram Android `LOW`, `AVERAGE`, `HIGH` вимірює first-load latency, long tasks, canvas bytes, renderer resource counts і GPU memory proxy; automatic profile не додає ручних налаштувань гравцеві.
- Shader pipeline компілюється через `WebGLRenderer.compileAsync`, щоб не блокувати перший кадр синхронним compile. GitHub software-WebGL логує фактичний max long task і має лише аварійний regression ceiling 1000 мс; це не заявлений mobile target. Hardware browser QA лишається окремим доказом реальної затримки.
- Build gate читає Vite manifest, рахує лише додатковий lazy dependency closure відносно initial entry та gzip-ить реальні production chunks. Нульовий або випадково eager test surface не може пройти.

## Наслідки

- Силует більше не складається з видимих 2D-частин; рух задає skeleton усередині цілісного mesh.
- Разова ціна — складніший authoring і 0,51–0,70 МБ на противника замість сотень кілобайт 2D-atlas.
- Three.js не потрапляє в initial entry; preload починається лише коли наступний encounter справді потребує 3D.
- Перед масштабуванням на десятки ворогів потрібні спільний Blender export profile, LOD policy та перевірка ліцензійних умов кожного генеративного постачальника.
