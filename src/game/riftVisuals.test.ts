import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRiftEnemyVisual } from './riftVisuals';

describe('rift enemy visuals', () => {
  it('cycles normal enemy visuals by stage', () => {
    const stageOne = getRiftEnemyVisual(1, false);
    const stageTwo = getRiftEnemyVisual(2, false);
    const stageThree = getRiftEnemyVisual(3, false);
    const stageFour = getRiftEnemyVisual(4, false);

    assert.equal(stageOne.id, 'mirefang-stalker');
    assert.equal(stageTwo.id, 'ironroot-marauder');
    assert.equal(stageThree.id, 'ashveil-oracle');
    assert.equal(stageFour.id, stageOne.id);
    assert.equal(new Set([stageOne.asset, stageTwo.asset, stageThree.asset]).size, 3);
    assert.ok([stageOne, stageTwo, stageThree].every(visual => visual.name.length > 0 && visual.title.length > 0));
  });

  it('normalizes invalid stages to the first visual', () => {
    assert.equal(getRiftEnemyVisual(0, false).id, 'mirefang-stalker');
    assert.equal(getRiftEnemyVisual(-12, false).id, 'mirefang-stalker');
    assert.equal(getRiftEnemyVisual(1.8, false).id, 'mirefang-stalker');
  });

  it('uses a dedicated boss visual independent of stage cycling', () => {
    const bossVisual = getRiftEnemyVisual(5, true);

    assert.equal(bossVisual.id, 'crowned-rift-sovereign');
    assert.equal(bossVisual.archetype, 'sovereign');
    assert.equal(bossVisual.zone, 'Sovereign Gate');
    assert.notEqual(bossVisual.backdrop, getRiftEnemyVisual(4, false).backdrop);
    assert.ok(bossVisual.particleCount > getRiftEnemyVisual(5, false).particleCount);
    assert.ok(bossVisual.coreRadius > getRiftEnemyVisual(5, false).coreRadius);
  });
});
