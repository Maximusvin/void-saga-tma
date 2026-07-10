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
