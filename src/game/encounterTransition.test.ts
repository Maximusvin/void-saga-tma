import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gameNumber } from './gameNumber';
import {
  createEncounterTransition,
  getEncounterTransitionDurationMs,
  getEncounterTransitionKey,
} from './encounterTransition';
import type { GameEvent } from './types';

const defeatEvents = (source: 'passive' | 'tap'): GameEvent[] => [
  {
    type: 'monster_hit',
    comboCount: 0,
    damage: gameNumber(10),
    heroContributions: [],
    isCrit: false,
    monsterHealth: gameNumber(0),
    source,
    stage: 2,
  },
  {
    type: 'monster_defeated',
    enemiesInStage: 4,
    enemyIndex: 0,
    gemReward: 0,
    goldReward: gameNumber(25),
    nextEnemyIndex: 1,
    nextStage: 2,
    stage: 2,
    stageCleared: false,
  },
];

describe('encounter transition', () => {
  it('captures the defeated encounter instead of the already-advanced snapshot', () => {
    const transition = createEncounterTransition(defeatEvents('passive'), 7);

    assert.ok(transition);
    assert.equal(transition.id, 7);
    assert.equal(transition.defeatedStage, 2);
    assert.equal(transition.enemyIndex, 0);
    assert.equal(transition.nextEnemyIndex, 1);
    assert.equal(transition.source, 'passive');
    assert.equal(transition.wasBoss, false);
    assert.equal(getEncounterTransitionKey(transition), '2:0');
    assert.equal(getEncounterTransitionDurationMs(transition), 900);
  });

  it('returns null when combat did not defeat an enemy', () => {
    assert.equal(createEncounterTransition(defeatEvents('tap').slice(0, 1), 1), null);
  });
});
