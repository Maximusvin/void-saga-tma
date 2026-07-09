import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeGameSnapshot, normalizeStoredGameEvents } from './snapshot';

const timestamp = '2026-07-09T12:00:00.000Z';

describe('game snapshot normalization', () => {
  it('migrates legacy numeric economy fields to schema v2 strings', () => {
    const snapshot = normalizeGameSnapshot({
      comboCount: 3,
      comboExpiresAt: null,
      gems: 50,
      gold: 1002.5999999999999,
      heroes: [{ id: 'legacy', level: 2, name: 'Legacy Hero', power: 10.5, rarity: 'Rare' }],
      lastSeenAt: timestamp,
      monsterHealth: 75.25,
      monsterMaxHealth: 100,
      stage: 1,
      updatedAt: timestamp,
    });

    assert.ok(snapshot);
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.gold, '1002.6');
    assert.equal(snapshot.heroes[0]?.power, '10.5');
    assert.equal(snapshot.monsterHealth, '75.25');
    assert.equal(snapshot.monsterMaxHealth, '100');
    assert.doesNotMatch(JSON.stringify(snapshot), /Infinity|NaN/);
  });

  it('falls back from invalid economy values without leaking non-finite JSON', () => {
    const snapshot = normalizeGameSnapshot({
      gems: 50,
      gold: Number.POSITIVE_INFINITY,
      heroes: [],
      monsterHealth: 'NaN',
      monsterMaxHealth: '-1',
      stage: 1,
    });

    assert.ok(snapshot);
    assert.equal(snapshot.gold, '1000');
    assert.equal(snapshot.monsterHealth, '100');
    assert.equal(snapshot.monsterMaxHealth, '100');
    assert.doesNotMatch(JSON.stringify(snapshot), /Infinity|NaN/);
  });

  it('normalizes legacy command events to the string API contract', () => {
    const events = normalizeStoredGameEvents([
      {
        type: 'monster_hit',
        comboCount: 1,
        damage: 1.2000000000000002,
        isCrit: false,
        monsterHealth: 98.8,
        source: 'tap',
        stage: 1,
      },
      { type: 'monster_defeated', stage: 1, nextStage: 2, goldReward: 50, gemReward: 0 },
    ]);

    assert.equal(events[0]?.type, 'monster_hit');
    assert.equal(events[0]?.type === 'monster_hit' ? events[0].damage : null, '1.2');
    assert.equal(events[1]?.type === 'monster_defeated' ? events[1].goldReward : null, '50');
  });
});
