# Ironroot Marauder: 3D authoring source

`ironroot-marauder.blend` — джерело правди для mesh, armature та чотирьох runtime-кліпів: `Idle`, `HitLeft`, `HitRight`, `Death`.

## Походження

- Identity reference: `public/assets/rift/ironroot-marauder.webp`.
- Base mesh: Tripo API, модель `P1-20260311`, image-to-3D, 12 000 face limit, PBR texture.
- Auto-rig: Tripo `v2.5-20260210`, `biped`.
- Фінальні анімації: власні Blender actions; Tripo preset `hurt/fall` не використовується у runtime.
- Точні SHA-256 вихідного референса, `.blend` і runtime GLB зафіксовано в `provenance.json`, щоб ліцензійний доказ не можна було непомітно перенести на інший binary asset.

## Комерційне використання

Чинні [Tripo Terms of User Agreement](https://www.tripo3d.ai/terms), востаннє оновлені 2025-07-11, застосовуються до Tripo Services, включно з API. Пункт 3.2 прямо дозволяє використовувати Outputs для законних комерційних і некомерційних цілей. Пункт 5.2.1 водночас залишає за Tripo права на Inputs і Outputs Free Users. Отже, цей API trial output можна використовувати в грі на невиключній основі, але він не заявляється як ексклюзивна власність проєкту й постачається без гарантій Tripo.

Перевірено 2026-07-11. Це provenance-рішення стосується лише binary assets, SHA-256 яких записані в `provenance.json`; нова генерація потребує окремої перевірки чинних на той момент умов.

## Runtime export

1. Blender експортує один GLB з armature, skinning і всіма actions.
2. glTF Transform стискає geometry через Meshopt.
3. glTF Transform кодує texture maps у browser-native WebP.
4. High profile обмежує texture до 1024 px; low — до 512 px.
5. `src/game/enemyRigAssets.test.ts` перевіряє контейнер, кліпи, extensions і вагові бюджети.

## Повторна перевірка source і raw export

```powershell
blender `
  --background "art-source/rift/ironroot-3d/ironroot-marauder.blend" `
  --python-exit-code 1 `
  --python "art-source/rift/ironroot-3d/verify_source.py" -- `
  --report "$env:TEMP/ironroot-source-report.json" `
  --render-dir "$env:TEMP/ironroot-contact-frames" `
  --export "$env:TEMP/ironroot-raw.glb"
```

Скрипт не змінює `.blend`: він перевіряє цілісний renderable mesh, armature, weights, actions і object scale, повторно експортує raw GLB та створює кадри для contact-sheet gate.

Після перевірки raw GLB обидва runtime-профілі відтворюються однією version-pinned командою:

```powershell
npm run asset:ironroot:optimize -- "$env:TEMP/ironroot-raw.glb"
```

Не редагувати файли в `public/assets/rift/ironroot-3d/` вручну: вони є похідним runtime-експортом із цього `.blend`.
