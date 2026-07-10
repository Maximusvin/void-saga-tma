import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeGameSnapshot, normalizeStoredGameEvents } from './snapshot';

const timestamp = '2026-07-09T12:00:00.000Z';

describe('game snapshot normalization', () => {
  it('migrates legacy numeric economy fields and progression to schema v6', () => {
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
    assert.equal(snapshot.schemaVersion, 6);
    assert.deepEqual(snapshot.activeHeroIds, ['legacy']);
    assert.equal(snapshot.bossEncounterEndsAt, null);
    // A pre-v6 save carries no idle watermark, so the next tick is granted at once
    // instead of back-paying every second since the save was written.
    assert.equal(snapshot.lastPassiveTickAt, null);
    assert.equal(snapshot.gold, '1002.6');
    assert.equal(snapshot.heroes[0]?.power, '10.5');
    assert.equal(snapshot.heroes[0]?.ascension, 0);
    assert.equal(snapshot.heroes[0]?.shards, 0);
    assert.equal(snapshot.heroes[0]?.templateId, 'legacy:legacy');
    assert.equal(snapshot.monsterHealth, '75.25');
    assert.equal(snapshot.monsterMaxHealth, '100');
    assert.doesNotMatch(JSON.stringify(snapshot), /Infinity|NaN/);
  });

  it('merges known legacy duplicates without losing team power', () => {
    const snapshot = normalizeGameSnapshot({
      gems: 0,
      gold: 1000,
      heroes: [
        { id: 'copy-a', level: 1, name: 'Void Grunt', power: 5, rarity: 'Common' },
        { id: 'copy-b', level: 2, name: 'Void Grunt', power: 7.5, rarity: 'Common' },
      ],
      monsterHealth: 100,
      monsterMaxHealth: 100,
      stage: 1,
    });

    assert.ok(snapshot);
    assert.equal(snapshot.heroes.length, 1);
    assert.equal(snapshot.heroes[0]?.templateId, 'void-grunt');
    assert.equal(snapshot.heroes[0]?.level, 2);
    assert.equal(snapshot.heroes[0]?.power, '12.5');
    assert.equal(snapshot.heroes[0]?.shards, 1);
    assert.deepEqual(snapshot.activeHeroIds, ['copy-a']);
  });

  it('keeps only unique owned heroes in the four-slot Warband', () => {
    const snapshot = normalizeGameSnapshot({
      activeHeroIds: ['hero-5', 'missing', 'hero-5', 'hero-10', 'hero-15', 'hero-20', 'hero-25'],
      heroes: [5, 10, 15, 20, 25].map(power => ({
        id: `hero-${power}`,
        level: 1,
        name: `Hero ${power}`,
        power,
        rarity: 'Rare',
      })),
      stage: 1,
    });

    assert.ok(snapshot);
    assert.deepEqual(snapshot.activeHeroIds, ['hero-5', 'hero-10', 'hero-15', 'hero-20']);
  });

  it('preserves high-level legacy heroes by deriving the required ascension', () => {
    const snapshot = normalizeGameSnapshot({
      heroes: [{ id: 'veteran', level: 120, name: 'Void Mage', power: '1e20', rarity: 'Rare' }],
      stage: 1,
    });

    assert.ok(snapshot);
    assert.equal(snapshot.heroes[0]?.ascension, 2);
    assert.equal(snapshot.heroes[0]?.templateId, 'void-mage');
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

  it('preserves a valid boss deadline and clears stale non-boss deadlines', () => {
    const bossSnapshot = normalizeGameSnapshot({
      stage: 5,
      bossEncounterEndsAt: '2026-07-09T12:00:35.000Z',
    });
    const normalSnapshot = normalizeGameSnapshot({
      stage: 6,
      bossEncounterEndsAt: '2026-07-09T12:00:35.000Z',
    });

    assert.ok(bossSnapshot);
    assert.ok(normalSnapshot);
    assert.equal(bossSnapshot.bossEncounterEndsAt, '2026-07-09T12:00:35.000Z');
    assert.equal(normalSnapshot.bossEncounterEndsAt, null);
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
      {
        type: 'monster_hit',
        comboCount: 0,
        damage: 15,
        heroContributions: [
          { damage: 5, heroId: 'hero-5' },
          { damage: 10, heroId: 'hero-10' },
        ],
        isCrit: false,
        monsterHealth: 85,
        source: 'passive',
        stage: 1,
      },
      { type: 'monster_defeated', stage: 1, nextStage: 2, goldReward: 50, gemReward: 0 },
      {
        type: 'hero_summoned',
        hero: { id: 'old-copy', level: 1, name: 'Void Grunt', power: 5, rarity: 'Common' },
        costGems: 10,
      },
      {
        type: 'hero_upgraded',
        heroId: 'void-grunt',
        goldCost: 100,
        level: 2,
        power: 7.5,
      },
      {
        type: 'hero_ascended',
        heroId: 'void-grunt',
        ascension: 1,
        levelCap: 100,
        shardsRemaining: 0,
        shardsSpent: 2,
      },
      {
        type: 'boss_enraged',
        attemptEndsAt: '2026-07-09T12:00:35.000Z',
        monsterHealth: 1035,
        stage: 5,
      },
      { type: 'active_warband_updated', heroIds: ['hero-5', 'hero-10', 'hero-5'] },
    ]);

    assert.equal(events[0]?.type, 'monster_hit');
    assert.equal(events[0]?.type === 'monster_hit' ? events[0].damage : null, '1.2');
    assert.deepEqual(events[0]?.type === 'monster_hit' ? events[0].heroContributions : null, []);
    assert.deepEqual(events[1]?.type === 'monster_hit' ? events[1].heroContributions : null, [
      { damage: '5', heroId: 'hero-5' },
      { damage: '10', heroId: 'hero-10' },
    ]);
    assert.equal(events[2]?.type === 'monster_defeated' ? events[2].goldReward : null, '50');
    assert.equal(events[3]?.type === 'hero_summoned' ? events[3].isDuplicate : null, false);
    assert.equal(events[3]?.type === 'hero_summoned' ? events[3].hero.templateId : null, 'void-grunt');
    assert.equal(events[4]?.type === 'hero_upgraded' ? events[4].fromLevel : null, 1);
    assert.equal(events[4]?.type === 'hero_upgraded' ? events[4].levelsGained : null, 1);
    assert.equal(events[5]?.type === 'hero_ascended' ? events[5].levelCap : null, 100);
    assert.equal(events[6]?.type === 'boss_enraged' ? events[6].monsterHealth : null, '1035');
    assert.deepEqual(events[7]?.type === 'active_warband_updated' ? events[7].heroIds : null, ['hero-5', 'hero-10']);
  });
});
