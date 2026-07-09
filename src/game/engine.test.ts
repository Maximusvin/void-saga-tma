import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BALANCE } from './balance';
import { applyCombatBatchAction, applyGameAction, claimOfflineRewardsAction } from './engine';
import { compareGameNumbers, gameNumber } from './gameNumber';
import { GAME_SNAPSHOT_SCHEMA_VERSION, type GameSnapshot, type Hero } from './types';

const NOW_MS = Date.parse('2026-07-09T12:00:00.000Z');

const hero = (power: number): Hero => ({
  id: `hero-${power}`,
  name: `Hero ${power}`,
  rarity: 'Rare',
  level: 1,
  power: gameNumber(power),
});

const createSnapshot = (lastSeenAt: string, heroes: Hero[] = []): GameSnapshot => ({
  schemaVersion: GAME_SNAPSHOT_SCHEMA_VERSION,
  comboCount: 0,
  comboExpiresAt: null,
  gold: gameNumber(1000),
  gems: 50,
  heroes,
  stage: 1,
  monsterMaxHealth: gameNumber(100),
  monsterHealth: gameNumber(100),
  lastSeenAt,
  updatedAt: lastSeenAt,
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
    assert.equal(event.goldReward, '3600');
    assert.equal(result.snapshot.gold, '4600');
    assert.equal(result.snapshot.lastSeenAt, '2026-07-09T12:00:00.000Z');
  });

  it('caps long offline sessions', () => {
    const snapshot = createSnapshot('2026-07-09T00:00:00.000Z', [hero(20)]);
    const result = claimOfflineRewardsAction(snapshot, NOW_MS);
    const event = result.events[0];

    assert.equal(event.type, 'offline_rewards_claimed');
    assert.equal(event.elapsedSeconds, 43200);
    assert.equal(event.cappedSeconds, GAME_BALANCE.offlineRewardMaxSeconds);
    assert.equal(event.goldReward, '28800');
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

describe('server-authoritative combat batches', () => {
  it('keeps hit and defeat events ordered while a batch crosses a stage', () => {
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
      'monster_hit',
    ]);
    assert.equal(result.snapshot.stage, 2);
    assert.equal(result.snapshot.comboCount, 3);
    assert.equal(result.snapshot.comboExpiresAt, '2026-07-09T12:00:01.500Z');
    assert.ok(compareGameNumbers(result.snapshot.monsterHealth, result.snapshot.monsterMaxHealth) < 0);
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
});
