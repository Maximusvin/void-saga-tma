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
7. Якщо WebGL, GLB, Meshopt або KTX2 не завантажуються, компонент показує чинний `ironroot-marauder.webp`. Інші противники залишаються на статичному Pixi pipeline.

## Арт-пайплайн і бюджети

- Authoring source: `art-source/rift/ironroot-3d/ironroot-marauder.blend`, поза `public`.
- Геометрія: 11 881 triangles, 55 bones, один skinned mesh, один material.
- High runtime: `1024px KTX2 + Meshopt`, 2 197 444 байти.
- Low runtime: `512px KTX2 + Meshopt`, 954 684 байти.
- Runtime animation payload усередині GLB: `Idle`, два directional hit clips і `Death`; окремі відео або sprite sheets не постачаються.
- Basis transcoder постачається локально, без зовнішнього CDN і без runtime-залежності від Tripo.

## Верифікація

- Blender contact sheets перевіряють silhouette stability, planted feet, відсутність root scale та читабельність ключових поз.
- Asset-тест читає GLB container, перевіряє один mesh/skin, точний набір кліпів, `EXT_meshopt_compression`, `KHR_texture_basisu` та high/low бюджети.
- Playwright перевіряє один canvas, `skinned-three`, різний hit для лівого/правого тапу, 10 rapid taps без scene rebuild, death handoff і static fallback.
- Фінальний gate — реальне декодування KTX2/Meshopt і screenshot review у мобільних viewport, бо статичний glTF validator не декодує ці розширення.

## Наслідки

- Силует більше не складається з видимих 2D-частин; рух задає skeleton усередині цілісного mesh.
- Разова ціна — складніший authoring і приблизно 0,95–2,20 МБ на противника замість сотень кілобайт 2D-atlas.
- Three.js chunk великий, але lazy і не потрапляє в початковий маршрут до появи Ironroot.
- Перед масштабуванням на десятки ворогів потрібні спільний Blender export profile, LOD policy та перевірка ліцензійних умов кожного генеративного постачальника.
