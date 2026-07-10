# Ironroot Marauder: 3D authoring source

`ironroot-marauder.blend` — джерело правди для mesh, armature та чотирьох runtime-кліпів: `Idle`, `HitLeft`, `HitRight`, `Death`.

## Походження

- Identity reference: `public/assets/rift/ironroot-marauder.webp`.
- Base mesh: Tripo API, модель `P1-20260311`, image-to-3D, 12 000 face limit, PBR texture.
- Auto-rig: Tripo `v2.5-20260210`, `biped`.
- Фінальні анімації: власні Blender actions; Tripo preset `hurt/fall` не використовується у runtime.

## Runtime export

1. Blender експортує один GLB з armature, skinning і всіма actions.
2. glTF Transform стискає geometry через Meshopt.
3. KTX-Software кодує texture maps у KTX2.
4. High profile обмежує texture до 1024 px; low — до 512 px.
5. `src/game/enemyRigAssets.test.ts` перевіряє контейнер, кліпи, extensions і вагові бюджети.

Не редагувати файли в `public/assets/rift/ironroot-3d/` вручну: вони є похідним runtime-експортом із цього `.blend`.
