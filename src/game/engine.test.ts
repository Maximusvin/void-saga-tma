import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BALANCE, getBossAttemptDurationMs, getEnemiesInStage } from './balance';
import {
  applyDamageAction,
  applyCombatBatchAction,
  applyGameAction,
  ascendHeroAction,
  claimOfflineRewardsAction,
  setActiveWarbandAction,
  summonHeroAction,
  upgradeHeroAction,
} from './engine';
import { compareGameNumbers, gameNumber } from './gameNumber';
import { GAME_SNAPSHOT_SCHEMA_VERSION, type GameSnapshot, type Hero } from './types';

const NOW_MS = Date.parse('2026-07-09T12:00:00.000Z');

const hero = (power: number): Hero => ({
  ascension: 0,
  id: `hero-${power}`,
  name: `Hero ${power}`,
  rarity: 'Rare',
  level: 1,
  power: gameNumber(power),
  shards: 0,
  templateId: `legacy:hero-${power}`,
});

const createSnapshot = (lastSeenAt: string, heroes: Hero[] = []): GameSnapshot => ({
  schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
  activeHeroIds: heroes.slice(0, 4).map(currentHero => currentHero.id),
  bossEncounterEndsAt: null,
  comboCount: 0,
  comboExpiresAt: null,
  enemyIndex: 0,
  gold: gameNumber(1000),
  gems: GAME_BALANCE.initialGems,
  heroes,
  stage: 1,
  monsterMaxHealth: gameNumber(100),
  monsterHealth: gameNumber(100),
  lastPassiveTickAt: null,
  lastSeenAt,
  summonPity: 0,
  updatedAt: lastSeenAt,
});

const NEVER_CRIT = () => 0.99;

const countPassiveHits = (events: ReturnType<typeof applyCombatBatchAction>['events']) => {
  return events.filter(event => event.type === 'monster_hit' && event.source === 'passive').length;
};

const atOffsetMs = (offsetMs: number) => new Date(NOW_MS + offsetMs).toISOString();

describe('passive tick accrual', () => {
  it('grants one tick per elapsed second and drops the unearned remainder', () => {
    const snapshot = {
      ...createSnapshot(atOffsetMs(-3_000), [hero(10)]),
      lastPassiveTickAt: atOffsetMs(-3_000),
    };

    const result = applyCombatBatchAction(snapshot, 0, 10, { nowMs: NOW_MS, random: NEVER_CRIT });

    assert.equal(countPassiveHits(result.events), 3);
    assert.equal(result.snapshot.lastPassiveTickAt, atOffsetMs(0));
    assert.equal(compareGameNumbers(result.snapshot.monsterHealth, gameNumber(70)), 0);
  });

  it('rejects an idle batch when no whole tick has elapsed', () => {
    const snapshot = {
      ...createSnapshot(atOffsetMs(0), [hero(10)]),
      lastPassiveTickAt: atOffsetMs(-500),
    };

    const result = applyCombatBatchAction(snapshot, 0, 5, { nowMs: NOW_MS, random: NEVER_CRIT });

    assert.equal(result.events[0].type, 'action_rejected');
    assert.equal(result.snapshot, snapshot);
    assert.equal(result.snapshot.lastPassiveTickAt, atOffsetMs(-500));
  });

  it('cannot be outpaced by spamming batches at the same instant', () => {
    let snapshot: GameSnapshot = {
      ...createSnapshot(atOffsetMs(-1_000), [hero(10)]),
      lastPassiveTickAt: atOffsetMs(-1_000),
    };
    let totalPassiveHits = 0;

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const result = applyCombatBatchAction(snapshot, 0, 10, { nowMs: NOW_MS, random: NEVER_CRIT });
      totalPassiveHits += countPassiveHits(result.events);
      snapshot = result.snapshot;
    }

    // One second of wall clock had elapsed, so exactly one second may be paid.
    assert.equal(totalPassiveHits, 1);
  });

  it('does not back-pay a long absence beyond the catch-up window', () => {
    const snapshot = {
      ...createSnapshot(atOffsetMs(-3_600_000), [hero(10)]),
      lastPassiveTickAt: atOffsetMs(-3_600_000),
    };

    const result = applyCombatBatchAction(snapshot, 0, GAME_BALANCE.maxPassiveTicksPerBatch, {
      nowMs: NOW_MS,
      random: NEVER_CRIT,
    });

    assert.equal(countPassiveHits(result.events), GAME_BALANCE.maxPassiveTicksPerBatch);
    // The watermark restarts inside the catch-up window, never an hour back.
    assert.equal(
      result.snapshot.lastPassiveTickAt,
      atOffsetMs(-GAME_BALANCE.passiveTickCatchUpMs + GAME_BALANCE.maxPassiveTicksPerBatch * GAME_BALANCE.passiveTickMs),
    );
  });

  it('still applies taps when the idle ticks riding along are unearned', () => {
    const snapshot = {
      ...createSnapshot(atOffsetMs(0), [hero(10)]),
      lastPassiveTickAt: atOffsetMs(0),
    };

    const result = applyCombatBatchAction(snapshot, 2, 5, { nowMs: NOW_MS, random: NEVER_CRIT });

    assert.equal(countPassiveHits(result.events), 0);
    assert.equal(result.events.filter(event => event.type === 'monster_hit').length, 2);
    assert.equal(result.snapshot.lastPassiveTickAt, atOffsetMs(0));
  });
});

describe('offline rewards', () => {
  it('claims gold from hero passive power and elapsed offline time', () => {
    const snapshot = createSnapshot('2026-07-09T10:00:00.000Z', [hero(10)]);
    const result = claimOfflineRewardsAction(snapshot, NOW_MS);
    const event = result.events[0];

    assert.equal(event.type, 'offline_rewards_claimed');
    assert.equal(event.elapsedSeconds, 7200);
    assert.equal(event.cappedSeconds, 7200);
    assert.equal(event.passivePower, '10');
    assert.equal(event.goldReward, '1800');
    assert.equal(result.snapshot.gold, '2800');
    assert.equal(result.snapshot.lastSeenAt, '2026-07-09T12:00:00.000Z');
  });

  it('caps long offline sessions', () => {
    const snapshot = createSnapshot('2026-07-09T00:00:00.000Z', [hero(20)]);
    const result = claimOfflineRewardsAction(snapshot, NOW_MS);
    const event = result.events[0];

    assert.equal(event.type, 'offline_rewards_claimed');
    assert.equal(event.elapsedSeconds, 43200);
    assert.equal(event.cappedSeconds, GAME_BALANCE.offlineRewardMaxSeconds);
    assert.equal(event.goldReward, '14400');
  });

  it('does not reward short sessions or empty rosters', () => {
    const shortSession = claimOfflineRewardsAction(createSnapshot('2026-07-09T11:59:30.000Z', [hero(100)]), NOW_MS);
    const emptyRoster = claimOfflineRewardsAction(createSnapshot('2026-07-09T10:00:00.000Z'), NOW_MS);

    assert.equal(shortSession.events[0].type, 'offline_rewards_claimed');
    assert.equal(shortSession.events[0].goldReward, '0');
    assert.equal(shortSession.snapshot.gold, '1000');

    assert.equal(emptyRoster.events[0].type, 'offline_rewards_claimed');
    assert.equal(emptyRoster.events[0].passivePower, '0');
    assert.equal(emptyRoster.events[0].goldReward, '0');
    assert.equal(emptyRoster.snapshot.gold, '1000');
  });

  it('routes claim action through the game action dispatcher', () => {
    const snapshot = createSnapshot('2026-07-09T10:00:00.000Z', [hero(5)]);
    const result = applyGameAction(snapshot, { type: 'claim_offline_rewards' });

    assert.equal(result.events[0].type, 'offline_rewards_claimed');
  });
});

describe('hero upgrades', () => {
  it('charges the rarity cost and preserves fractional power growth', () => {
    const commonHero = { ...hero(5), id: 'common', rarity: 'Common' as const };
    const result = upgradeHeroAction(
      createSnapshot('2026-07-09T11:59:00.000Z', [commonHero]),
      commonHero.id,
    );
    const event = result.events[0];

    assert.equal(event.type, 'hero_upgraded');
    assert.equal(event.fromLevel, 1);
    assert.equal(event.goldCost, '100');
    assert.equal(event.level, 2);
    assert.equal(event.levelsGained, 1);
    assert.equal(event.power, '7.5');
    assert.equal(result.snapshot.gold, '900');
    assert.equal(result.snapshot.heroes[0]?.power, '7.5');
  });

  it('buys as many of ten requested levels as current gold allows', () => {
    const rareHero = hero(5);
    const result = upgradeHeroAction(
      createSnapshot('2026-07-09T11:59:00.000Z', [rareHero]),
      rareHero.id,
      10,
    );
    const event = result.events[0];

    assert.equal(event.type, 'hero_upgraded');
    assert.equal(event.fromLevel, 1);
    assert.equal(event.levelsGained, 3);
    assert.equal(event.level, 4);
    assert.equal(event.goldCost, '855');
    assert.equal(event.power, '16.875');
    assert.equal(result.snapshot.gold, '145');
  });

  it('rejects upgrades at the ascension level cap', () => {
    const cappedHero = { ...hero(100), level: 50 };
    const snapshot = createSnapshot('2026-07-09T11:59:00.000Z', [cappedHero]);
    const result = upgradeHeroAction(snapshot, cappedHero.id);

    assert.deepEqual(result.events, [{ type: 'action_rejected', reason: 'level_cap_reached' }]);
    assert.equal(result.snapshot, snapshot);
  });

  it('spends shards to ascend and unlock the next level band', () => {
    const cappedHero = { ...hero(100), level: 50, shards: 2 };
    const ascended = ascendHeroAction(
      createSnapshot('2026-07-09T11:59:00.000Z', [cappedHero]),
      cappedHero.id,
    );
    const event = ascended.events[0];

    assert.equal(event.type, 'hero_ascended');
    assert.equal(event.ascension, 1);
    assert.equal(event.levelCap, 100);
    assert.equal(event.shardsSpent, 2);
    assert.equal(ascended.snapshot.heroes[0]?.shards, 0);
    const fundedSnapshot = { ...ascended.snapshot, gold: gameNumber('1e20') };
    assert.equal(upgradeHeroAction(fundedSnapshot, cappedHero.id).events[0]?.type, 'hero_upgraded');
  });

  it('rejects premature or underfunded ascension attempts', () => {
    const prematureHero = { ...hero(100), level: 49, shards: 2 };
    const underfundedHero = { ...hero(100), level: 50, shards: 1 };

    assert.deepEqual(
      ascendHeroAction(
        createSnapshot('2026-07-09T11:59:00.000Z', [prematureHero]),
        prematureHero.id,
      ).events,
      [{ type: 'action_rejected', reason: 'level_cap_not_reached' }],
    );
    assert.deepEqual(
      ascendHeroAction(
        createSnapshot('2026-07-09T11:59:00.000Z', [underfundedHero]),
        underfundedHero.id,
      ).events,
      [{ type: 'action_rejected', reason: 'not_enough_shards' }],
    );
  });
});

describe('hero summons', () => {
  it('unlocks one hero per template and converts duplicates into shards', () => {
    const initial = createSnapshot('2026-07-09T11:59:00.000Z');
    const unlocked = summonHeroAction(initial, 0);
    const duplicate = summonHeroAction(unlocked.snapshot, 0);
    const unlockEvent = unlocked.events[0];
    const duplicateEvent = duplicate.events[0];

    assert.equal(unlockEvent.type, 'hero_summoned');
    assert.equal(unlockEvent.isDuplicate, false);
    assert.equal(unlocked.snapshot.heroes[0]?.templateId, 'void-grunt');
    assert.deepEqual(unlocked.snapshot.activeHeroIds, ['void-grunt']);
    assert.equal(duplicateEvent.type, 'hero_summoned');
    assert.equal(duplicateEvent.isDuplicate, true);
    assert.equal(duplicateEvent.shardsGranted, 2);
    assert.equal(duplicate.snapshot.heroes.length, 1);
    assert.equal(duplicate.snapshot.heroes[0]?.shards, 2);
    assert.equal(duplicate.snapshot.gems, 10);
    assert.equal(duplicate.snapshot.summonPity, 2);
    assert.equal(duplicateEvent.summonsUntilLegendaryPity, 78);
  });

  it('compensates a newly unlocked template for rarity-pool dilution', () => {
    const ownedCommon = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      heroes: [{
        ...hero(5),
        id: 'rift-scavenger',
        name: 'Rift Scavenger',
        rarity: 'Common' as const,
        templateId: 'rift-scavenger',
      }],
    };
    const result = summonHeroAction(ownedCommon, 0);
    const event = result.events[0];

    assert.equal(event.type, 'hero_summoned');
    assert.equal(event.isDuplicate, false);
    assert.equal(event.hero.templateId, 'void-grunt');
    assert.equal(event.shardsGranted, 1);
    assert.equal(result.snapshot.heroes.find(hero => hero.templateId === 'void-grunt')?.shards, 1);
  });

  it('forces a server-authoritative Legendary on the eightieth summon', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      gems: GAME_BALANCE.summonCostGems,
      summonPity: GAME_BALANCE.legendaryPityPulls - 1,
    };
    const result = summonHeroAction(snapshot, 0);
    const event = result.events[0];

    assert.equal(event.type, 'hero_summoned');
    assert.equal(event.hero.rarity, 'Legendary');
    assert.equal(event.legendaryPityTriggered, true);
    assert.equal(event.summonsUntilLegendaryPity, GAME_BALANCE.legendaryPityPulls);
    assert.equal(result.snapshot.summonPity, 0);
  });
});

describe('active Warband', () => {
  it('persists an ordered owned formation and rejects invalid members', () => {
    const heroes = [hero(5), hero(10), hero(15), hero(20), hero(25)];
    const snapshot = createSnapshot('2026-07-09T11:59:00.000Z', heroes);
    const updated = setActiveWarbandAction(snapshot, ['hero-25', 'hero-10']);

    assert.deepEqual(updated.snapshot.activeHeroIds, ['hero-25', 'hero-10']);
    assert.deepEqual(updated.events, [{
      type: 'active_warband_updated',
      heroIds: ['hero-25', 'hero-10'],
    }]);
    assert.deepEqual(
      setActiveWarbandAction(snapshot, ['hero-5', 'hero-5']).events,
      [{ type: 'action_rejected', reason: 'invalid_warband' }],
    );
    assert.deepEqual(
      setActiveWarbandAction(snapshot, ['not-owned']).events,
      [{ type: 'action_rejected', reason: 'hero_not_owned' }],
    );
  });

  it('uses only the active formation for tap and passive power', () => {
    const heroes = [hero(10), hero(25), hero(50)];
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z', heroes),
      activeHeroIds: ['hero-10', 'hero-50'],
      monsterHealth: gameNumber(1_000),
      monsterMaxHealth: gameNumber(1_000),
    };
    const tap = applyCombatBatchAction(snapshot, 1, 0, { nowMs: NOW_MS, random: () => 0.5 });
    const passive = applyCombatBatchAction(snapshot, 0, 1, { nowMs: NOW_MS, random: () => 0.5 });

    assert.equal(tap.events[0]?.type === 'monster_hit' ? tap.events[0].damage : null, '7');
    assert.equal(passive.events[0]?.type === 'monster_hit' ? passive.events[0].damage : null, '60');
    assert.deepEqual(passive.events[0]?.type === 'monster_hit' ? passive.events[0].heroContributions : null, [
      { damage: '10', heroId: 'hero-10' },
      { damage: '50', heroId: 'hero-50' },
    ]);
  });
});

describe('server-authoritative combat batches', () => {
  it('stops a tap batch at the first defeated encounter', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      monsterHealth: gameNumber(2),
    };
    const result = applyCombatBatchAction(snapshot, 3, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });

    assert.deepEqual(result.events.map(event => event.type), [
      'monster_hit',
      'monster_hit',
      'monster_defeated',
    ]);
    assert.equal(result.snapshot.stage, 1);
    assert.equal(result.snapshot.enemyIndex, 1);
    const defeat = result.events.find(event => event.type === 'monster_defeated');
    assert.equal(defeat?.type === 'monster_defeated' ? defeat.stageCleared : null, false);
    assert.equal(result.snapshot.comboCount, 2);
    assert.equal(result.snapshot.comboExpiresAt, '2026-07-09T12:00:01.500Z');
    assert.equal(result.snapshot.monsterHealth, result.snapshot.monsterMaxHealth);
  });

  it('stops passive ticks after a kill and preserves the unspent watermark', () => {
    const snapshot = {
      ...createSnapshot(atOffsetMs(-3_000), [hero(200)]),
      lastPassiveTickAt: atOffsetMs(-3_000),
    };

    const result = applyCombatBatchAction(snapshot, 0, 3, { nowMs: NOW_MS, random: NEVER_CRIT });

    assert.deepEqual(result.events.map(event => event.type), ['monster_hit', 'monster_defeated']);
    assert.equal(countPassiveHits(result.events), 1);
    assert.equal(result.snapshot.monsterHealth, result.snapshot.monsterMaxHealth);
    assert.equal(result.snapshot.lastPassiveTickAt, atOffsetMs(-2_000));
  });

  it('advances the stage only after the final normal encounter', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      enemyIndex: getEnemiesInStage(1) - 1,
      monsterHealth: gameNumber(1),
      monsterMaxHealth: gameNumber(1),
    };
    const result = applyCombatBatchAction(snapshot, 1, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });
    const defeat = result.events.find(event => event.type === 'monster_defeated');

    assert.equal(result.snapshot.stage, 2);
    assert.equal(result.snapshot.enemyIndex, 0);
    assert.equal(defeat?.type === 'monster_defeated' ? defeat.stageCleared : null, true);
    assert.equal(defeat?.type === 'monster_defeated' ? defeat.nextStage : null, 2);
  });

  it('never mints tap gold from overkill damage', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      monsterHealth: gameNumber(2),
      monsterMaxHealth: gameNumber(100),
    };
    const result = applyDamageAction(snapshot, gameNumber(100), 'tap', { now: atOffsetMs(0) });
    const hit = result.events[0];

    assert.equal(hit.type, 'monster_hit');
    assert.equal(hit.damage, '2');
    assert.equal(result.snapshot.gold, '1018.2');
    assert.equal(result.snapshot.enemyIndex, 1);
  });

  it('rolls critical damage inside the engine instead of accepting client damage', () => {
    const result = applyCombatBatchAction(
      createSnapshot('2026-07-09T11:59:00.000Z', [hero(10)]),
      1,
      0,
      { nowMs: NOW_MS, random: () => 0 },
    );
    const hit = result.events[0];

    assert.equal(hit.type, 'monster_hit');
    assert.equal(hit.isCrit, true);
    assert.equal(hit.damage, '4');
    assert.equal(hit.comboCount, 1);
    assert.deepEqual(hit.heroContributions, []);
  });

  it('keeps one passive hit while exposing each hero contribution', () => {
    const result = applyCombatBatchAction(
      createSnapshot('2026-07-09T11:59:00.000Z', [hero(10), hero(25)]),
      0,
      1,
      { nowMs: NOW_MS, random: () => 0.5 },
    );
    const hit = result.events[0];

    assert.deepEqual(result.events.map(event => event.type), ['monster_hit']);
    assert.equal(hit.type, 'monster_hit');
    assert.equal(hit.source, 'passive');
    assert.equal(hit.damage, '35');
    assert.deepEqual(hit.heroContributions, [
      { damage: '10', heroId: 'hero-10' },
      { damage: '25', heroId: 'hero-25' },
    ]);
    assert.equal(result.snapshot.monsterHealth, '65');
  });

  it('resets an expired combo before resolving the next batch', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      comboCount: 100,
      comboExpiresAt: '2026-07-09T11:59:59.000Z',
    };
    const result = applyCombatBatchAction(snapshot, 1, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });
    const hit = result.events[0];

    assert.equal(hit.type, 'monster_hit');
    assert.equal(hit.damage, '1');
    assert.equal(result.snapshot.comboCount, 1);
  });

  it('starts a timed attempt when stage progression enters a boss', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      stage: 4,
      enemyIndex: getEnemiesInStage(4) - 1,
      monsterMaxHealth: gameNumber(1),
      monsterHealth: gameNumber(1),
    };
    const result = applyCombatBatchAction(snapshot, 1, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });

    assert.equal(result.snapshot.stage, 5);
    assert.equal(
      result.snapshot.bossEncounterEndsAt,
      new Date(NOW_MS + getBossAttemptDurationMs(5)).toISOString(),
    );
  });

  it('resets boss health and combo before applying a hit after enrage', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      stage: 5,
      bossEncounterEndsAt: '2026-07-09T11:59:59.000Z',
      comboCount: 100,
      comboExpiresAt: '2026-07-09T12:00:01.000Z',
      monsterMaxHealth: gameNumber(1000),
      monsterHealth: gameNumber(100),
    };
    const result = applyCombatBatchAction(snapshot, 1, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });

    assert.deepEqual(result.events.map(event => event.type), ['boss_enraged', 'monster_hit']);
    assert.equal(result.events[0]?.type === 'boss_enraged' ? result.events[0].monsterHealth : null, '1000');
    assert.equal(result.snapshot.monsterHealth, '999');
    assert.equal(result.snapshot.comboCount, 1);
    assert.equal(
      result.snapshot.bossEncounterEndsAt,
      new Date(NOW_MS + getBossAttemptDurationMs(5)).toISOString(),
    );
  });

  it('preserves boss progress while an attempt is active', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      stage: 5,
      bossEncounterEndsAt: '2026-07-09T12:00:10.000Z',
      monsterMaxHealth: gameNumber(1000),
      monsterHealth: gameNumber(100),
    };
    const result = applyCombatBatchAction(snapshot, 1, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });

    assert.equal(result.events.some(event => event.type === 'boss_enraged'), false);
    assert.equal(result.snapshot.monsterHealth, '99');
    assert.equal(result.snapshot.bossEncounterEndsAt, snapshot.bossEncounterEndsAt);
  });

  it('opens a fresh attempt without a false enrage when boss health is full', () => {
    const snapshot = {
      ...createSnapshot('2026-07-09T11:59:00.000Z'),
      stage: 5,
      bossEncounterEndsAt: '2026-07-09T11:59:59.000Z',
      monsterMaxHealth: gameNumber(1035),
      monsterHealth: gameNumber(1035),
    };
    const result = applyCombatBatchAction(snapshot, 1, 0, {
      nowMs: NOW_MS,
      random: () => 0.5,
    });

    assert.deepEqual(result.events.map(event => event.type), ['monster_hit']);
    assert.equal(result.snapshot.monsterHealth, '1034');
    assert.equal(
      result.snapshot.bossEncounterEndsAt,
      new Date(NOW_MS + getBossAttemptDurationMs(5)).toISOString(),
    );
  });
});
