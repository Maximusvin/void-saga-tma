# Технічний розтин конкурента: Dungeon Crusher + вибір стеку

> Дослідження 2026-07-11 (DevTools + reverse-engineering асетів + емпіричний тест Unity + прогін власного hero-конвеєра). Мета документа — зафіксувати результати, щоб не розслідувати це повторно. Геймплейний аналіз референсу лишається в [game-design.md](../game-design.md); анімаційний pipeline ironroot — в [ADR 0004](../adr/0004-layered-enemy-animation.md); рішення по стеку — в [ADR 0006](../adr/0006-engine-and-asset-pipeline.md).

## 1. Конкурент: як він побудований

**Гра:** Dungeon Crusher: Soul Hunters, `playdungeoncrusher.com`. **Розробник:** RedSkyLab (RSL) — видно з IL2CPP-збірок `RSL.Core.dll`, `RSL.WebGL.dll`, `RSL.Android/iOS` та домену `redskylab.io`.

### Движок і стек

| Шар | Значення | Звідки дізнано |
|---|---|---|
| Движок | **Unity `6000.3.12f1`** (Unity 6.3) | console: `Initialize engine version: 6000.3.12f1` |
| Компіляція | **IL2CPP** (C# → C++ → WASM) | `Il2CppData/`, `global-metadata.dat` |
| Рендер | **URP** (Universal Render Pipeline), WebGL 2.0 / OpenGL ES 3.0 | 229× `com.unity.render-pipelines.universal`, `Lit` shader ×193 |
| Фізика | **PhysX 4.1.2** | console: `[Physics::Module] Name: PhysX` |
| Аудіо | **FMOD** | сигнатура в `framework.js` |
| Ввід | новий **Input System** | `Input System module state changed: Initialized` |
| Збірка | **mobile-first** (Android/iOS), веб — порт | `RSL.Android/iOS`; текстури в **ETC2**, десктопний веб декомпресує на льоту (`WARNING: RGBA Compressed ETC2 ... not supported, decompressing texture`) |

### Файли, які були досліджені (payload завантаження, ~60 MB)

| Файл | Розмір | Що це |
|---|---|---|
| `bcc4d55…loader.js` | ~30 KB | Unity-завантажувач + `UnityCache` (кешує білд у **IndexedDB**, тому повторний вхід швидкий) |
| `9bac891…framework.js` | 0.38 MB | Emscripten glue-код Unity |
| `ef98f5f…wasm` | 9.86 MB стисн. / **47.8 MB** розпак. | увесь код движка + гри (IL2CPP) |
| `446a708…data` | **50.9 MB** (Brotli) / **76 MB** розпак. | контейнер `UnityWebData1.0` з усіма асетами |

Усередині `.data` (розпарсено заголовок UnityWebData): `data.unity3d` (≈53 MB — усі сцени/моделі/текстури), `Il2CppData/Metadata/global-metadata.dat` (≈15 MB — рядкова таблиця імен усіх C#-класів), `sharedassets*.resource` (текстури оточення), IL2CPP-ресурси RSL. **Немає окремих asset-bundle'ів на локації/героїв** — усе в одному пакеті (нормально для idle з фіксованим контентом).

**Як саме читалося** (щоб повторити за потреби):
1. Розміри — через `performance.getEntriesByType('resource')` у DevTools (переживає dev-tools-late-attach).
2. `.data` завантажено `curl --compressed` із Range-запитом → Brotli-розпаковка (фізичний файл стиснений; Range на розпакований offset дає `416`, тому качався цілком і розпаковувався).
3. Заголовок `UnityWebData1.0` розпарсено в Python (signature → int32 headerSize → записи `offset/size/nameLen/name`), звідти взято offset `global-metadata.dat`.
4. `global-metadata.dat` — це plaintext-таблиця імен класів; grep-нуто на сигнатури движків/систем. Magic не стандартний (`af1bb1fa` замість `17af1ffb`) — часткова обфускація header'а, але рядкова таблиця читабельна.

### Герої та вороги — це справжнє 3D (не 2D / не Spine)

Головний висновок. Докази з `global-metadata.dat`:
- **За 3D:** `SkinnedMeshRenderer`, `Avatar`×249, `Rig`×422, `HumanBone`, `BlendShape`, `LODGroup`×45 + **`InstaLOD`**×42 (комерційний decimation/LOD-інструмент для 3D-мешів), `Animator`×133, `AnimationClip`×21.
- **Проти 2D/Spine:** `Spine.*` — **0 збігів**; `SpriteRenderer` — лише 6 (UI-дрібниці).
- **Вигляд «мальованого 2D»** досягається не 2D-артом, а 3D під ортокамерою збоку + URP post-process: `Outline`×63, `Bloom`×64, `PostProcess`×161, `DecalProjector`×12, `RenderTexture`×114 (динамічні тіні — console: `[RenderedShadow] Release & Destroy render texture`).
- **Смерть:** `OnDeath`/`DeathAnim`/`DefaultDeathTime` + частковий ragdoll (`Rigidbody`×12, `HingeJoint`×7 на PhysX). **Тап:** `TapDamage`, `ClickDamage`×39, `ApplyHit`, `AttackHitEvent`.

### Локація, «сік» і механіка

- **Ефект «камера їде вправо, фон — вліво»** = власний `BaseLevelScroller` (`AutoScroll`, `ApplyScrollInertia`, `ApplyBackgroundPosition`, `AdjustBackgroundSizeForBorders`), **не Cinemachine** (0 збігів). `Background`×228 — багатошарові фони. `BillboardFaceCameraPos` — дальні білборди.
- **Золото — це партикли:** `ClickerGoldDrop`, **`CoinsParticlesCountByGold`** (кількість монеток-часток масштабується від суми золота), `BlinkCoins`. Idle-ядро: `ApplyOfflineGold`, `CanMultiplyOfflineGold`, `AggregatedLootData`.
- Окрема карткова бойова система `Battler*` (`BattlerHeroClass/Race/Ability`, `BattlerCardAttackHitEffect`) — схоже на арену поверх основного клікера.

### Backend і монетизація

- `api.playdungeoncrusher.io` — геймплейний API (profile / ping / achievements), REST + polling.
- `www.redskylab.io/api/v2/chats/REALM_13_RU/messages` — клани/чат (шардовані «realm»-и, як `REALM_13`).
- `config.uca.cloud.unity3d.com`, `cdp.cloud.unity3d.com/v1/events` — Unity Cloud config + аналітика (ріжеться adblock'ом як `ERR_BLOCKED_BY_CLIENT` — це клієнтський блок, не серверний).
- **Платежі:** Xsolla + CloudPayments + RoboKassa (TinkoffPay). **Логін:** Facebook / VK / Mail.ru / Apple / Odnoklassniki / Discord. **Аналітика:** Amplitude + GA + Facebook Pixel + AppsFlyer.

## 2. Що з цього брати, а що ні

**Не копіювати — движок.** Unity WebGL = ~60 MB перший вантаж + 512 MB heap (console: `Memory: Total = 512`). Для Telegram Mini App це вбиває миттєвий старт. Деталі рішення — [ADR 0006](../adr/0006-engine-and-asset-pipeline.md).

**Копіювати — техніки** (двигун-агностичні, реалізовні на нашому Pixi/Three):
- 2.5D-скролер локації → `TilingSprite`-паралакс + зміна біомів (уже спроєктовано у [rift-biome-journey](../superpowers/specs/2026-07-10-rift-biome-journey-design.md)).
- Фонтан монет із кількістю за сумою золота (їхній `CoinsParticlesCountByGold`).
- Outline + bloom для читабельності силуету (у Pixi — фільтри; у Three — post-process).
- Об'ємні герої через справжнє 3D (їхній підхід) — ми робимо те саме через AI→3D→Three.js (див. §3 і ADR 0004), без ліцензійних і вагових проблем Unity-порту.

**Юридично:** їхні моделі/текстури — власність RedSkyLab. Витягувати й перевикористовувати їх заборонено (copyright + ризик бану Google Play). Ми генеруємо власні асети з документованим provenance (Tripo/Higgsfield), як у `art-source/rift/ironroot-3d/provenance.json`.

## 3. Власний hero-конвеєр (перевірено end-to-end 2026-07-11)

Підтверджує й розширює [ADR 0004](../adr/0004-layered-enemy-animation.md). Плоску AI-картинку **не можна розрізати** на частини для анімації (за прихованою геометрією немає даних → шви й діри). Робочий шлях — 3D:

1. **2D-арт:** Higgsfield `nano_banana_2` (Nano Banana Pro), `--aspect_ratio 3:4 --resolution 2k`. Для анімо-придатного спрайта — промпт фронтальної симетричної пози, руки вздовж тіла, без крил/плаща, чистий фон.
2. **Вирізка фону:** локальний `rembg` (Higgsfield `image_background_remover`/`image_decompose` headless віддають порожнє).
3. **2D → 3D:** Higgsfield `image_to_3d --image <png> --should_texture true` → текстурований GLB (ретрай на транзієнтний `502`). `--enable_rigging true` додає скелет (під ретаргет кліпів).
4. **Перевірка GLB:** Blender 5.1 headless (`blender --background --python`, `import_scene.gltf`, turntable ~6 с).
5. **Показ у грі:** `GLTFLoader` + `MeshoptDecoder` (як у `RiftThreeEnemyScene`), `AnimationMixer` з іменованими кліпами `Idle/HitLeft/HitRight/Death` (або code-driven idle для нерігованого GLB).

**Пастки (щоб не наступати вдруге):**
- `autosprite` (2D frame-анімація) **зламаний headless** — 5 систематичних спроб `status: failed` без деталі, як `image_decompose`. Веб-онлі; для анімації йти в 3D або керувати веб-інтерфейсом через браузер.
- `image_to_3d` інколи дає HTTP `502` — вирішується ретраєм.
- **Металеві PBR-матеріали GLB рендеряться чорними** в Three без environment-мапи → `scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture`. Варто додати і в бойову сцену.
- Текстура з `image_to_3d` виходить **світлішою/простішою** за 2D-оригінал — 2D лишається для портретів/карток, 3D — для бою; для якості потрібен дотекстуринг у Blender або `enable_pbr`.

**Артефакти сесії** (демо, не закомічені в основну гру): `hero-demo.html`, `src/heroDemo.ts`, `public/hero3d.glb`, `public/hero-turntable.gif` — інтерактивна Three-сцена + turntable-GIF героя, згенерованого цим конвеєром.

## 4. Стек-порівняння для агента (чому веб, а не Unity)

Емпіричний тест Unity 6000.5.3 (окремий проєкт `C:/AI Project/unity-idle-test`, не в репо): агент **може** через CLI+C# створити проєкт, написати геймплей, зібрати сцену (`-executeMethod SceneBuilder.Build`), зібрати Windows-плеєр (`-buildWindows64Player`) і зробити headless-рендер — **але наосліп** (немає Game View), ~4 холодні цикли движка на фікс одного бага, asset-importer чинить опір. У вебі агент замикає цикл «зібрав → побачив → виправив» сам (браузер: DOM/console/скрін). Повний вердикт і наслідки — [ADR 0006](../adr/0006-engine-and-asset-pipeline.md).
