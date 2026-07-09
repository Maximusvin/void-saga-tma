import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRiftEnemyVisual } from './riftVisuals';

describe('rift enemy visuals', () => {
  it('cycles normal enemy visuals by stage', () => {
    const stageOne = getRiftEnemyVisual(1, false);
    const stageTwo = getRiftEnemyVisual(2, false);
    const stageThree = getRiftEnemyVisual(3, false);
    const stageFour = getRiftEnemyVisual(4, false);

    assert.equal(stageOne.id, 'rift-wisp');
    assert.equal(stageTwo.id, 'void-stalker');
    assert.equal(stageThree.id, 'rift-bulwark');
    assert.equal(stageFour.id, stageOne.id);
  });

  it('normalizes invalid stages to the first visual', () => {
    assert.equal(getRiftEnemyVisual(0, false).id, 'rift-wisp');
    assert.equal(getRiftEnemyVisual(-12, false).id, 'rift-wisp');
    assert.equal(getRiftEnemyVisual(1.8, false).id, 'rift-wisp');
  });

  it('uses a dedicated boss visual independent of stage cycling', () => {
    const bossVisual = getRiftEnemyVisual(5, true);

    assert.equal(bossVisual.id, 'rift-overlord');
    assert.equal(bossVisual.archetype, 'overlord');
    assert.ok(bossVisual.particleCount > getRiftEnemyVisual(5, false).particleCount);
    assert.ok(bossVisual.coreRadius > getRiftEnemyVisual(5, false).coreRadius);
  });
});
