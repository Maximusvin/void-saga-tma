# Стенд порівняння анімації героя (eval-прототип)

Ізольований прототип, щоб наживо порівняти три підходи до «живої» базової анімації
героя (дихання, похитування, волосся, реакція на тап) на стеку проєкту (React 19 +
**pixi.js 8** + Vite):

| Панель | Технологія | Що показує |
|---|---|---|
| **Процедурний Pixi** | `pixi.js` 8, sine-математика на шарах | На **вашому** герої: авторський шаровий void-маг (голова/волосся/тіло рухаються окремо) + перемикач на реальний `void-knight.webp` (плоский варіант — межа техніки) |
| **Spine** | `@esotericsoftware/spine-pixi-v8` 4.3 | Рантайм на офіційному sample `spineboy`: скелетний idle + тригер удару |
| **Rive** | `@rive-app/canvas` 2.38 | Рантайм на офіційному sample `vehicles.riv`: WASM + state-machine-інтерактив |

## Запуск

```bash
npm run dev
# відкрити http://localhost:5173/prototypes/hero-animation/
```

## Чому Spine/Rive — на sample-персонажах, а не на вашому герої

Skeletal/mesh-риг (Spine, Rive, Live2D) **не робиться кодом** — це проприєтарні
GUI-редактори + ручна робота художника. Тому демо Spine/Rive міряють **рантайм**
(вага бандла, плавність, механіка тапу), а не «вашого героя». Процедурний Pixi —
єдиний підхід, який агент реально будує на реальному арті без редактора.

## Ізоляція від прод-збірки

- Vite прод-збірка (`vite build`) бере лише кореневий `index.html`, тож ця сторінка
  **не потрапляє** в бандл TMA.
- `tsconfig.app.json` включає лише `src`, тож `tsc -b` не типчекає прототип.
- Власний `tsconfig.json` тут — для окремого типчеку:
  `npx tsc -p prototypes/hero-animation/tsconfig.json`.
- `@esotericsoftware/spine-pixi-v8` і `@rive-app/canvas` встановлені як
  **devDependencies** — не йдуть у прод.

## Прибрати після рішення

```bash
npm uninstall @esotericsoftware/spine-pixi-v8 @rive-app/canvas
rm -rf prototypes/hero-animation
```

Sample-ассети (`spineboy`, `vehicles.riv`) — офіційні приклади Esoteric Software і
Rive, лежать у `assets/` лише для цього стенду.
