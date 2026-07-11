import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRiftEnemyVisual, hasSkinnedThreeRig } from './riftVisuals';

const REQUIRED_CLIPS = ['Death', 'HitLeft', 'HitRight', 'Idle'] as const;

interface GlbJson {
  animations?: Array<{ name?: string }>;
  extensionsRequired?: string[];
  meshes?: unknown[];
  skins?: unknown[];
}

const assetPath = (filename: string) => fileURLToPath(new URL(
  `../../public/assets/rift/ironroot-3d/${filename}`,
  import.meta.url,
));

const readGlbJson = (filename: string): GlbJson => {
  const bytes = readFileSync(assetPath(filename));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${filename} has an invalid GLB header`);
  assert.equal(bytes.readUInt32LE(4), 2, `${filename} is not glTF 2.0`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${filename} reports the wrong byte length`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${filename} has no JSON chunk`);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim()) as GlbJson;
};

describe('Ironroot 3D assets', () => {
  it('publishes non-empty high and low GLBs within the mobile budgets', () => {
    const high = statSync(assetPath('ironroot-high.glb')).size;
    const low = statSync(assetPath('ironroot-low.glb')).size;

    assert.ok(high > 0 && high <= 2_300_000, `high GLB is ${high} bytes`);
    assert.ok(low > 0 && low <= 1_000_000, `low GLB is ${low} bytes`);
  });

  it('contains one skinned mesh, all runtime clips, Meshopt, and KTX2', () => {
    for (const variant of ['high', 'low'] as const) {
      const glb = readGlbJson(`ironroot-${variant}.glb`);
      const clipNames = glb.animations?.map(animation => animation.name) ?? [];

      assert.equal(glb.meshes?.length, 1);
      assert.equal(glb.skins?.length, 1);
      assert.deepEqual([...clipNames].sort(), [...REQUIRED_CLIPS].sort());
      assert.ok(glb.extensionsRequired?.includes('EXT_meshopt_compression'));
      assert.ok(glb.extensionsRequired?.includes('KHR_texture_basisu'));
    }
  });

  it('routes only Ironroot through the skinned Three.js rig with a static fallback', () => {
    const ironroot = getRiftEnemyVisual(2, false);
    const mirefang = getRiftEnemyVisual(1, false);

    assert.equal(ironroot.id, 'ironroot-marauder');
    assert.ok(hasSkinnedThreeRig(ironroot));
    assert.equal(ironroot.rig.kind, 'skinned-three');
    assert.equal(ironroot.asset, '/assets/rift/ironroot-marauder.webp');
    assert.equal(mirefang.rig, undefined);
  });
});
