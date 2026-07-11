import { createHash } from 'node:crypto';
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

interface IronrootProvenance {
  schema: string;
  provider: string;
  license: {
    commercialUseSection: string;
    freeUserOwnershipSection: string;
    termsUrl: string;
  };
  source: {
    blend: { path: string; sha256: string };
    identityReference: { path: string; sha256: string };
  };
  runtime: Record<'high' | 'low', { bytes: number; path: string; sha256: string }>;
}

const assetPath = (filename: string) => fileURLToPath(new URL(
  `../../public/assets/rift/ironroot-3d/${filename}`,
  import.meta.url,
));

const repoPath = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

const fileSha256 = (path: string) => createHash('sha256').update(readFileSync(repoPath(path))).digest('hex');

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
  it('binds the commercial-use evidence to the exact source and runtime binaries', () => {
    const provenance = JSON.parse(readFileSync(
      repoPath('art-source/rift/ironroot-3d/provenance.json'),
      'utf8',
    )) as IronrootProvenance;

    assert.equal(provenance.schema, 'void-saga.asset-provenance.v1');
    assert.equal(provenance.provider, 'Tripo API');
    assert.equal(provenance.license.termsUrl, 'https://www.tripo3d.ai/terms');
    assert.equal(provenance.license.commercialUseSection, '3.2');
    assert.equal(provenance.license.freeUserOwnershipSection, '5.2.1');

    for (const source of [provenance.source.identityReference, provenance.source.blend]) {
      assert.equal(fileSha256(source.path), source.sha256, `${source.path} changed without provenance`);
    }
    for (const runtime of Object.values(provenance.runtime)) {
      assert.equal(statSync(repoPath(runtime.path)).size, runtime.bytes);
      assert.equal(fileSha256(runtime.path), runtime.sha256, `${runtime.path} changed without provenance`);
    }
  });

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
