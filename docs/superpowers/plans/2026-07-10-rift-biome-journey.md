# Rift Biome Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behind the rift combat, render a persistent procedural parallax world that scrolls right on each mob defeat and morphs seamlessly between biomes, giving the Dungeon-Crusher feel of marching through one long evolving location.

**Architecture:** A renderer-free `biome` module owns biome selection, stage roles, and the continuous terrain math (unit-tested). `RiftPixiScene` gains a persistent `world` container (created in the app-init effect, never rebuilt with the combat scene) that draws sky/terrain/props from biome specs, scrolls `cameraX` on each defeat signal, and crossfades biome parameters at boundaries. `TheRift` shows a biome-enter banner and an Elite marker. No engine, `STAGE_BANDS`, or `GAME_BALANCE` change — biomes key off `stage` and the existing every-5 boss cadence.

**Tech Stack:** React 19, TypeScript (strict), PixiJS v8.19, framer-motion, Vite, Playwright, node:test.

## Global Constraints

- TypeScript strict; no implicit `any`. Type all new signatures.
- Prose to the operator and in repo docs/PR: Ukrainian. Code, identifiers, commit type-prefix: English.
- Do not touch `src/game/engine.ts`, `src/game/content.ts` `STAGE_BANDS`, or `GAME_BALANCE` boss/economy fields.
- Reuse the generic pool in `src/views/shardPool.ts` (`createShardPool`) for props — do not write a second pool.
- Respect the render profile (`getGameRenderProfile()` in `src/utils/renderQuality.ts`): fewer layers/props on `low`.
- Respect `prefers-reduced-motion`: no smooth scroll, static props.
- Every merge stays green: `npx tsc -b`, `npm run lint`, `npm run test:server`, `npm run build`, `npx playwright test`.

---

### Task 1: Biome module (pure, renderer-free)

**Files:**
- Create: `src/game/biome.ts`
- Test: `src/game/biome.test.ts`

**Interfaces:**
- Produces:
  - `BIOME_LENGTH: number` (10)
  - `type StageRole = 'mob' | 'mini-boss' | 'biome-boss'`
  - `interface BiomeSpec { id: string; name: string; skyTop: number; skyBottom: number; terrain: readonly [number, number, number]; prop: number; amplitude: number; frequency: number; propDensity: number }`
  - `BIOMES: readonly BiomeSpec[]`
  - `getBiomeIndexForStage(stage: number): number`
  - `getBiomeForStage(stage: number): BiomeSpec`
  - `getStageRole(stage: number): StageRole`
  - `terrainOffsetAt(worldX: number, spec: BiomeSpec): number`
  - `blendTerrain(worldX: number, from: BiomeSpec, to: BiomeSpec, t: number): number`
  - `propSlotAt(index: number, spec: BiomeSpec): { x: number; scale: number } | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/game/biome.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BIOMES,
  BIOME_LENGTH,
  blendTerrain,
  getBiomeForStage,
  getBiomeIndexForStage,
  getStageRole,
  propSlotAt,
  terrainOffsetAt,
} from './biome';

describe('biome selection', () => {
  it('groups every ten stages into a biome', () => {
    assert.equal(getBiomeIndexForStage(1), 0);
    assert.equal(getBiomeIndexForStage(10), 0);
    assert.equal(getBiomeIndexForStage(11), 1);
    assert.equal(getBiomeIndexForStage(20), 1);
    assert.equal(getBiomeIndexForStage(21), 2);
  });

  it('wraps biome specs so the journey never runs out', () => {
    const first = getBiomeForStage(1);
    const wrapped = getBiomeForStage(1 + BIOMES.length * BIOME_LENGTH);
    assert.equal(wrapped.id, first.id);
  });

  it('reads every tenth stage as the biome boss and mid-biome boss stages as mini-bosses', () => {
    assert.equal(getStageRole(10), 'biome-boss');
    assert.equal(getStageRole(20), 'biome-boss');
    assert.equal(getStageRole(5), 'mini-boss');
    assert.equal(getStageRole(15), 'mini-boss');
    assert.equal(getStageRole(3), 'mob');
    assert.equal(getStageRole(7), 'mob');
  });
});

describe('seamless terrain', () => {
  const spec = BIOMES[0];

  it('is continuous — a one-pixel step never jumps the silhouette', () => {
    let maxDelta = 0;
    for (let x = 0; x < 6000; x += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(terrainOffsetAt(x + 1, spec) - terrainOffsetAt(x, spec)));
    }
    assert.ok(maxDelta < spec.amplitude * 0.05, `step ${maxDelta} too large`);
  });

  it('stays continuous across the internal period wrap', () => {
    // Whatever period the sampler folds worldX into, crossing it must not jump.
    const before = terrainOffsetAt(4095.999, spec);
    const after = terrainOffsetAt(4096.001, spec);
    assert.ok(Math.abs(after - before) < spec.amplitude * 0.05);
  });

  it('blends two biomes continuously in the transition factor', () => {
    const from = BIOMES[0];
    const to = BIOMES[1 % BIOMES.length];
    const a = blendTerrain(1234, from, to, 0);
    const mid = blendTerrain(1234, from, to, 0.5);
    const b = blendTerrain(1234, from, to, 1);
    assert.equal(a, terrainOffsetAt(1234, from));
    assert.equal(b, terrainOffsetAt(1234, to));
    assert.ok(Math.abs(mid - (a + b) / 2) < 1e-9);
  });
});

describe('deterministic props', () => {
  it('returns the same slot for the same index', () => {
    assert.deepEqual(propSlotAt(7, BIOMES[0]), propSlotAt(7, BIOMES[0]));
  });

  it('spaces props left to right', () => {
    const a = propSlotAt(3, BIOMES[0]);
    const b = propSlotAt(4, BIOMES[0]);
    if (a && b) {
      assert.ok(b.x > a.x);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/game/biome.test.ts`
Expected: FAIL — `Cannot find module './biome'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/game/biome.ts
export const BIOME_LENGTH = 10;

export type StageRole = 'mob' | 'mini-boss' | 'biome-boss';

export interface BiomeSpec {
  id: string;
  name: string;
  skyTop: number;
  skyBottom: number;
  terrain: readonly [number, number, number]; // far, mid, near
  prop: number;
  amplitude: number;
  frequency: number; // integer, so the terrain wraps cleanly (see TERRAIN_PERIOD)
  propDensity: number; // 0..1
}

export const BIOMES: readonly BiomeSpec[] = [
  { id: 'luminous-verge', name: 'Luminous Verge', skyTop: 0x123a3d, skyBottom: 0x2a6f63, terrain: [0x1c4f4a, 0x14403c, 0x0c2a28], prop: 0x8ff6de, amplitude: 44, frequency: 3, propDensity: 0.55 },
  { id: 'ember-deep', name: 'Ember Deep', skyTop: 0x2a1220, skyBottom: 0x7a2f2a, terrain: [0x5a2320, 0x431a1c, 0x2a1012], prop: 0xffb066, amplitude: 52, frequency: 2, propDensity: 0.45 },
  { id: 'astral-reach', name: 'Astral Reach', skyTop: 0x181149, skyBottom: 0x4b3aa0, terrain: [0x2f2a72, 0x231e55, 0x161238], prop: 0xb79bff, amplitude: 38, frequency: 4, propDensity: 0.6 },
  { id: 'frost-hollow', name: 'Frost Hollow', skyTop: 0x10303f, skyBottom: 0x336d86, terrain: [0x235066, 0x1a3d50, 0x102632], prop: 0x9fe6ff, amplitude: 46, frequency: 3, propDensity: 0.5 },
  { id: 'sunken-ruins', name: 'Sunken Ruins', skyTop: 0x1a2a1f, skyBottom: 0x3f6b45, terrain: [0x2c4a30, 0x213a26, 0x152618], prop: 0xbff29a, amplitude: 42, frequency: 2, propDensity: 0.52 },
] as const;

export const getBiomeIndexForStage = (stage: number): number => {
  return Math.floor((Math.max(1, Math.floor(stage)) - 1) / BIOME_LENGTH);
};

export const getBiomeForStage = (stage: number): BiomeSpec => {
  return BIOMES[getBiomeIndexForStage(stage) % BIOMES.length];
};

export const getStageRole = (stage: number): StageRole => {
  const normalized = Math.max(1, Math.floor(stage));
  if (normalized % 10 === 0) {
    return 'biome-boss';
  }
  if (normalized % 5 === 0) {
    return 'mini-boss';
  }
  return 'mob';
};

// Fold worldX into one period so sin() keeps precision at huge stages. Frequencies
// are integers, so every term completes a whole number of cycles over the period
// and the silhouette is continuous where worldX wraps.
const TERRAIN_PERIOD = 4096;

export const terrainOffsetAt = (worldX: number, spec: BiomeSpec): number => {
  const wrapped = ((worldX % TERRAIN_PERIOD) + TERRAIN_PERIOD) % TERRAIN_PERIOD;
  const t = (wrapped / TERRAIN_PERIOD) * Math.PI * 2;
  const f = spec.frequency;
  return spec.amplitude * (
    0.6 * Math.sin(t * f) +
    0.3 * Math.sin(t * f * 2) +
    0.1 * Math.sin(t * f * 4)
  );
};

export const blendTerrain = (worldX: number, from: BiomeSpec, to: BiomeSpec, t: number): number => {
  const clamped = Math.max(0, Math.min(1, t));
  return terrainOffsetAt(worldX, from) * (1 - clamped) + terrainOffsetAt(worldX, to) * clamped;
};

const PROP_SPACING = 240;

const hashUnit = (seed: number): number => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

export const propSlotAt = (index: number, spec: BiomeSpec): { x: number; scale: number } | null => {
  const gate = hashUnit(index);
  if (gate > spec.propDensity) {
    return null;
  }
  const jitter = hashUnit(index * 1.7) * PROP_SPACING * 0.5;
  return { x: index * PROP_SPACING + jitter, scale: 0.7 + hashUnit(index * 2.3) * 0.7 };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/game/biome.test.ts`
Expected: PASS, all cases.

Note on Step 3 continuity: `terrainOffsetAt` uses only phase-0 sines, so at the period wrap all terms return to their start value — the continuity test passes. If you add phase offsets later, keep frequencies integer or the wrap test fails.

- [ ] **Step 5: Commit**

```bash
git add src/game/biome.ts src/game/biome.test.ts
git commit -m "feat: add biome selection and seamless terrain math"
```

---

### Task 2: Persistent parallax world in the rift scene

**Files:**
- Modify: `src/views/RiftPixiScene.tsx` (add a persistent world container in the app-init effect — the effect with deps `[]` that calls `app.init`)
- Reuse: `src/views/shardPool.ts` (`createShardPool` for props)
- Reference: `src/game/biome.ts`, `src/utils/renderQuality.ts`

**Interfaces:**
- Consumes: `getBiomeForStage`, `terrainOffsetAt`, `propSlotAt`, `BiomeSpec` from `./biome`; `createShardPool` from `./shardPool`; `getGameRenderProfile` from `../utils/renderQuality`.
- Produces: a `world` container drawn behind the combat `scene`; `host.dataset.biome` reflecting the current biome id.

- [ ] **Step 1: Read the current file**

Run: read `src/views/RiftPixiScene.tsx`. Locate the app-init effect (deps `[]`, calls `await app.init(...)`, sets `appRef.current`, `setRendererReady(true)`) and the combat-scene effect (deps `[renderedEnemy, rendererReady]`). The world lives in the app-init effect so it survives enemy rebuilds.

- [ ] **Step 2: Build the world (no scroll yet)**

Inside the app-init effect, after `host.append(app.canvas)` and before `setRendererReady(true)`, create a `world` Container, add it to `app.stage` FIRST (lowest layer, before the combat scene is added later), and draw:
- a full-bleed sky `Graphics` rectangle filled with a vertical gradient approximation (two stacked rects or a `Graphics` fill; use `getBiomeForStage(stageRef.current)` colors),
- 3 terrain `Graphics` polygons (far/mid/near) built by sampling `terrainOffsetAt(worldX, spec)` across the viewport width at ~24px steps, closed to the bottom,
- a prop pool via `createShardPool(worldPropsContainer, buildProp, p => p.destroy())` where `buildProp` returns a small crystal `Graphics` (unit shape, tinted per biome).

Position `world` in screen space (it is NOT under `app.stage.position` which centers the combat scene — add `world` directly and set its own coordinates from `(0,0)` top-left; call the existing `resize` to keep width/height). Store references (`worldRef`, layer graphics, prop pool) in refs so the ticker and cleanup can reach them. Scale layer/prop counts by `renderProfileRef.current` (e.g., 2 terrain layers + half props on `low`).

Set `host.dataset.biome = getBiomeForStage(stageRef.current).id`.

- [ ] **Step 3: Verify it renders (screenshot)**

Start Vite on a spare port, seed a save at stage 1, screenshot `.rift-arena`. Confirm the sky+terrain silhouette shows behind the enemy with no seam and reads as a biome. Save the screenshot and inspect it.

Run:
```bash
npx vite --port 5185 --strictPort &
# probe: seed stage 1, screenshot .rift-pixi-scene
```
Expected: a layered horizon behind the centered enemy; no hard vertical seams.

- [ ] **Step 4: Cleanup**

In the app-init effect's cleanup, destroy the prop pool (`pool.destroy()`) and `world.destroy({ children: true })` before/around the existing app teardown. Verify no leak: `npm run test:server` (the `cleanupOwnedPixiScene` tests still pass) and `npx tsc -b`.

- [ ] **Step 5: Commit**

```bash
git add src/views/RiftPixiScene.tsx
git commit -m "feat: render a procedural biome world behind the rift"
```

---

### Task 3: Camera scroll on defeat + biome crossfade

**Files:**
- Modify: `src/views/RiftPixiScene.tsx` (world ticker update)

**Interfaces:**
- Consumes: existing `defeatSignalRef` / `lastHandledDefeatSignalRef` pattern already in the scene; `stageRef`; `blendTerrain`, `getBiomeForStage`.
- Produces: smooth `cameraX` scroll; crossfaded biome params; `host.dataset.biome` updates on biome change.

- [ ] **Step 1: Add world state refs**

Add `cameraXRef` (current scroll px), `cameraTargetXRef` (target), and a `SEGMENT_WIDTH` const (e.g., 220). Add a biome-crossfade ref pair (`fromBiomeRef`, `toBiomeRef`, `biomeBlendRef` 0..1).

- [ ] **Step 2: Add a world ticker callback**

Register a ticker callback (in the app-init effect) that each frame:
- reads the target biome `getBiomeForStage(stageRef.current)`; if it differs from `toBiomeRef.current`, start a crossfade (`fromBiomeRef = toBiomeRef; toBiomeRef = next; biomeBlendRef = 0`) and write `host.dataset.biome = next.id`,
- advances `biomeBlendRef` toward 1 over ~0.6s,
- when `defeatSignalRef.current !== worldLastDefeatRef.current`, set `cameraTargetXRef += SEGMENT_WIDTH` and update `worldLastDefeatRef`,
- eases `cameraXRef` toward `cameraTargetXRef` (lerp factor ~`min(1, deltaMS/800)`); under `prefers-reduced-motion`, snap `cameraXRef = cameraTargetXRef`,
- re-samples each terrain layer polygon using `blendTerrain(worldX, fromBiome, toBiome, biomeBlend)` where `worldX = cameraXRef * parallaxFactor[layer] + screenX`, and shifts sky colors by the same blend,
- spawns/releases props whose `propSlotAt` world x enters/leaves `[cameraXRef - margin, cameraXRef + width + margin]` via the pool, tinting with the blended prop color.

Parallax factors: far ~0.2, mid ~0.5, near ~0.9 — nearer layers scroll faster, selling depth.

- [ ] **Step 3: Verify the scroll + transition (screenshots)**

Seed stage 9, drive kills (dispatch pointerdown on `.monster-button` with high hero power so mobs die), capture frames at stage 9 → 10 (biome boss) → 11 (new biome). Confirm: the world scrolls left smoothly (camera pans right), no seam, and the biome palette crossfades (not a hard cut) crossing stage 10→11. Inspect the screenshots.

- [ ] **Step 4: Verify perf unaffected on the tap path**

Confirm the world only moves on defeat (not per tap): tapping without killing should not scroll. Re-run the shard-pool allocation probe idea informally, or at least confirm `npm run build` and the render-budget e2e still pass:
Run: `npx playwright test e2e/navigation.spec.ts -g "render budget"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/RiftPixiScene.tsx
git commit -m "feat: scroll the biome world on defeat and crossfade biomes"
```

---

### Task 4: Biome-enter banner + Elite marker + e2e

**Files:**
- Modify: `src/views/TheRift.tsx`, `src/views/TheRift.css`
- Modify: `e2e/navigation.spec.ts`
- Reference: `src/game/biome.ts`

**Interfaces:**
- Consumes: `getBiomeIndexForStage`, `getBiomeForStage`, `getStageRole` from `../game/biome`.
- Produces: a `.biome-enter-banner` shown on biome change; an `Elite` label in `.encounter-rank` when `getStageRole(stage) === 'mini-boss'`; `data-biome` already on `.rift-pixi-scene` from Task 3.

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/navigation.spec.ts`:

```ts
test('crosses into a new biome with a banner as the journey advances', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    localStorage.setItem('rift_heroes_save', JSON.stringify({
      schemaVersion: 6,
      activeHeroIds: ['crusher'],
      bossEncounterEndsAt: null,
      comboCount: 0,
      comboExpiresAt: null,
      gems: 50,
      gold: '1000',
      heroes: [{ ascension: 0, id: 'crusher', name: 'Crusher', rarity: 'Legendary', level: 60, power: '1000000000000', shards: 0, templateId: 'void-lord' }],
      stage: 10,
      monsterMaxHealth: '1',
      monsterHealth: '1',
      lastPassiveTickAt: iso(now),
      lastSeenAt: iso(now),
      updatedAt: iso(now),
    }));
  });
  await page.goto('/');

  const scene = page.locator('.rift-pixi-scene');
  await expect(scene).toHaveAttribute('data-biome', 'luminous-verge', { timeout: 8_000 });
  // A one-health stage-10 boss dies to the auto passive tick, advancing to stage 11 (new biome).
  await expect(scene).toHaveAttribute('data-biome', 'ember-deep', { timeout: 10_000 });
  await expect(page.locator('.biome-enter-banner')).toContainText('Ember Deep');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run build && npx playwright test e2e/navigation.spec.ts -g "crosses into a new biome"`
Expected: FAIL — no `.biome-enter-banner`, and `data-biome` never becomes `ember-deep` (banner/marker not implemented; `data-biome` from Task 3 should already flip, so the banner assertion is the hard failure).

- [ ] **Step 3: Implement the banner and marker**

In `TheRift.tsx`: track `getBiomeIndexForStage(stage)` in a ref; when it increases, set a `biomeEnter` state `{ id, name }` (from `getBiomeForStage(stage)`) and clear it after ~2s via `scheduleTimeout`. Render it in an `AnimatePresence` block styled like the existing `rift-clear-banner`, class `biome-enter-banner`, text `Входимо в {name}`. In the `encounter-rank` block, when `getStageRole(stage) === 'mini-boss'` and not a full boss render, prepend an `Elite` label.

Add `.biome-enter-banner` styles to `TheRift.css` (reuse `rift-clear-banner` visual language; distinct accent).

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test e2e/navigation.spec.ts -g "crosses into a new biome"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/TheRift.tsx src/views/TheRift.css e2e/navigation.spec.ts
git commit -m "feat: announce biome entry and mark mini-boss stages"
```

---

### Task 5: Background wiring + full verification

**Files:**
- Modify: `src/App.tsx` (stop forcing the CSS `--rift-backdrop-image` for the rift so the procedural world is the background — keep it for a static far fallback only if a screenshot shows the world alone looks worse)
- Modify: `src/views/TheRift.css` / `src/App.css` as needed for the rift background

**Interfaces:**
- Consumes: nothing new.
- Produces: the rift view shows the procedural world as its background; other views unaffected.

- [ ] **Step 1: Wire the background**

Decide from Task 3 screenshots whether to drop the CSS backdrop image on the rift. If the procedural world stands alone, remove/neutralize `--rift-backdrop-image` usage for `view-rift` (App.tsx `shellStyle` / CSS). Keep the app-shell dark base so nothing flashes. Do not change non-rift views.

- [ ] **Step 2: Screenshot the final look**

Seed stages across two biomes; capture the rift on stage 3 (mob), 5 (Elite), 10 (biome boss), 11 (new biome). Inspect: premium, seamless, on-brand, HUD legible over the world.

- [ ] **Step 3: Full verification**

Run each and confirm green:
```bash
npx tsc -b
npm run lint
npm run test:server
npm run build
npx playwright test
```
Expected: tsc clean; lint clean; unit all pass (incl. `biome.test.ts`); build ok; e2e all pass (incl. the new biome test). If the local angel-showcase tests fail (known headless-WebGL issue), confirm they are unrelated and pass on CI.

- [ ] **Step 4: Commit and open PR**

```bash
git add -A
git commit -m "feat: use the procedural biome world as the rift background"
git push
gh pr create --base main --head feat/claude/rift-biome-journey --title "..." --body "..."
```

- [ ] **Step 5: Watch CI to green, then merge**

Watch `gh pr checks <n> --watch`; merge only when all checks succeed; delete branch; watch main CI to terminal success.

---

## Self-Review

**Spec coverage:**
- Seamless terrain (continuity) → Task 1 (tests) + Task 2/3 (rendering). ✓
- Camera scroll on defeat → Task 3. ✓
- Biome morph/crossfade → Task 3. ✓
- Biome structure (10 stages, boss at 10, mini-boss at 5) → Task 1 (`getStageRole`) + Task 4 (marker). ✓
- Biome-enter banner → Task 4. ✓
- Elite marker → Task 4. ✓
- Persistent world / combat scene untouched → Task 2 (app-init effect). ✓
- Prop pooling (reuse shardPool) → Task 2. ✓
- Render profile + reduced-motion → Task 2/3. ✓
- Background wiring → Task 5. ✓
- Deferred (mini-boss mechanics, per-biome enemy art, map screen) → not in plan by design. ✓

**Placeholder scan:** Task 1 is fully coded. Tasks 2/3/5 are integration against a file that changes upstream, so they specify exact insertion points (named effects), exact refs, exact parallax factors, and screenshot/e2e verification rather than pasting a 600-line file verbatim — concrete, not vague.

**Type consistency:** `getBiomeForStage`/`getBiomeIndexForStage`/`getStageRole`/`terrainOffsetAt`/`blendTerrain`/`propSlotAt` names and signatures match between Task 1 definition and Tasks 2–4 consumption. `data-biome` attribute name consistent across Tasks 2, 3, 4. `.biome-enter-banner` consistent across Task 4. `createShardPool(container, create, destroy)` signature matches `shardPool.ts`.
