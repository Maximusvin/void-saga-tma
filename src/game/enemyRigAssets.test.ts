import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnemyAtlasManifest } from './enemyRigManifest';
import { getRiftEnemyVisual } from './riftVisuals';

const REQUIRED_FRAMES = [
  'back', 'torso', 'head', 'neck_beard', 'pelvis',
  'left_shoulder', 'left_upper_arm', 'left_forearm', 'left_hand',
  'right_shoulder', 'right_upper_arm', 'right_forearm', 'right_hand',
  'left_thigh', 'left_shin_foot', 'right_thigh', 'right_shin_foot',
  'moss_left', 'moss_center', 'moss_right', 'chest_glow',
] as const;

const assetPath = (filename: string) => fileURLToPath(new URL(
  `../../public/assets/rift/ironroot-rig/${filename}`,
  import.meta.url,
));

const readManifest = (variant: 'high' | 'low') => parseEnemyAtlasManifest(JSON.parse(
  readFileSync(assetPath(`ironroot-atlas-${variant}.json`), 'utf8'),
) as unknown);

describe('Ironroot rig assets', () => {
  it('publishes non-empty high and low atlases within the mobile budgets', () => {
    const high = statSync(assetPath('ironroot-atlas-high.webp')).size;
    const low = statSync(assetPath('ironroot-atlas-low.webp')).size;

    assert.ok(high > 0 && high <= 450_000, `high atlas is ${high} bytes`);
    assert.ok(low > 0 && low <= 200_000, `low atlas is ${low} bytes`);
  });

  it('contains every rig component inside both atlas bounds', () => {
    for (const variant of ['high', 'low'] as const) {
      const manifest = readManifest(variant);
      assert.equal(manifest.variant, variant);
      assert.equal(manifest.size.width, variant === 'high' ? 1024 : 512);
      assert.equal(manifest.size.height, variant === 'high' ? 1024 : 512);
      assert.equal(Object.keys(manifest.frames).length, REQUIRED_FRAMES.length);

      for (const frameName of REQUIRED_FRAMES) {
        const frame = manifest.frames[frameName];
        assert.ok(frame, `${variant} atlas misses ${frameName}`);
        assert.ok(frame.x + frame.width <= manifest.size.width);
        assert.ok(frame.y + frame.height <= manifest.size.height);
      }
    }
  });

  it('routes only Ironroot through the layered rig with a static fallback', () => {
    const ironroot = getRiftEnemyVisual(2, false);
    const mirefang = getRiftEnemyVisual(1, false);

    assert.equal(ironroot.id, 'ironroot-marauder');
    assert.equal(ironroot.rig?.kind, 'layered-pixi');
    assert.equal(ironroot.asset, '/assets/rift/ironroot-marauder.webp');
    assert.equal(mirefang.rig, undefined);
  });
});
