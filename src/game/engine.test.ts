import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BALANCE } from './balance';
import { applyGameAction, claimOfflineRewardsAction } from './engine';
import type { GameSnapshot, Hero } from './types';

const NOW_MS = Date.parse('2026-07-09T12:00:00.000Z');

const hero = (power: number): Hero => ({
  id: `hero-${power}`,
  name: `Hero ${power}`,
  rarity: 'Rare',
  level: 1,
  power,
});

const createSnapshot = (lastSeenAt: string, heroes: Hero[] = []): GameSnapshot => ({
  gold: 1000,
  gems: 50,
  heroes,
  stage: 1,
  monsterMaxHealth: 100,
  monsterHealth: 100,
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
    assert.equal(event.passivePower, 10);
    assert.equal(event.goldReward, 3600);
    assert.equal(result.snapshot.gold, 4600);
    assert.equal(result.snapshot.lastSeenAt, '2026-07-09T12:00:00.000Z');
  });

  it('caps long offline sessions', () => {
    const snapshot = createSnapshot('2026-07-09T00:00:00.000Z', [hero(20)]);
    const result = claimOfflineRewardsAction(snapshot, NOW_MS);
    const event = result.events[0];

    assert.equal(event.type, 'offline_rewards_claimed');
    assert.equal(event.elapsedSeconds, 43200);
    assert.equal(event.cappedSeconds, GAME_BALANCE.offlineRewardMaxSeconds);
    assert.equal(event.goldReward, 28800);
  });

  it('does not reward short sessions or empty rosters', () => {
    const shortSession = claimOfflineRewardsAction(createSnapshot('2026-07-09T11:59:30.000Z', [hero(100)]), NOW_MS);
    const emptyRoster = claimOfflineRewardsAction(createSnapshot('2026-07-09T10:00:00.000Z'), NOW_MS);

    assert.equal(shortSession.events[0].type, 'offline_rewards_claimed');
    assert.equal(shortSession.events[0].goldReward, 0);
    assert.equal(shortSession.snapshot.gold, 1000);

    assert.equal(emptyRoster.events[0].type, 'offline_rewards_claimed');
    assert.equal(emptyRoster.events[0].passivePower, 0);
    assert.equal(emptyRoster.events[0].goldReward, 0);
    assert.equal(emptyRoster.snapshot.gold, 1000);
  });

  it('routes claim action through the game action dispatcher', () => {
    const snapshot = createSnapshot('2026-07-09T10:00:00.000Z', [hero(5)]);
    const result = applyGameAction(snapshot, { type: 'claim_offline_rewards' });

    assert.equal(result.events[0].type, 'offline_rewards_claimed');
  });
});
