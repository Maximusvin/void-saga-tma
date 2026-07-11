import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gameNumber } from './gameNumber';
import { formatAwayDuration, summarizeOfflineReward } from './offlineReward';
import type { GameEvent } from './types';

const MODAL_MIN_SECONDS = 5 * 60;

const offlineEvent = (overrides: {
  cappedSeconds: number;
  elapsedSeconds?: number;
  goldReward?: number;
  passivePower?: number;
}): GameEvent => ({
  type: 'offline_rewards_claimed',
  cappedSeconds: overrides.cappedSeconds,
  elapsedSeconds: overrides.elapsedSeconds ?? overrides.cappedSeconds,
  goldReward: gameNumber(overrides.goldReward ?? 5000),
  passivePower: gameNumber(overrides.passivePower ?? 12),
});

describe('summarizeOfflineReward', () => {
  it('returns null when the batch carries no offline reward event', () => {
    const events: GameEvent[] = [{ type: 'action_rejected', reason: 'anything' }];
    assert.equal(summarizeOfflineReward(events, MODAL_MIN_SECONDS), null);
  });

  it('returns null for an absence shorter than the modal threshold', () => {
    const events = [offlineEvent({ cappedSeconds: MODAL_MIN_SECONDS - 1 })];
    assert.equal(summarizeOfflineReward(events, MODAL_MIN_SECONDS), null);
  });

  it('returns null when nothing was earned even over a long absence', () => {
    const events = [offlineEvent({ cappedSeconds: 3600, goldReward: 0 })];
    assert.equal(summarizeOfflineReward(events, MODAL_MIN_SECONDS), null);
  });

  it('summarizes a rewarded absence at or above the threshold', () => {
    const events = [offlineEvent({ cappedSeconds: 3600, goldReward: 5000, passivePower: 12 })];
    const summary = summarizeOfflineReward(events, MODAL_MIN_SECONDS);

    assert.deepEqual(summary, {
      goldReward: gameNumber(5000),
      awaySeconds: 3600,
      awayLabel: '1h',
      passivePower: gameNumber(12),
      cappedAt: false,
    });
  });

  it('flags an absence that hit the 8h earning ceiling', () => {
    const events = [offlineEvent({ cappedSeconds: 8 * 3600, elapsedSeconds: 40_000 })];
    const summary = summarizeOfflineReward(events, MODAL_MIN_SECONDS);

    assert.ok(summary);
    assert.equal(summary.cappedAt, true);
    assert.equal(summary.awayLabel, '8h');
  });

  it('finds the offline event among other events', () => {
    const events: GameEvent[] = [
      { type: 'action_rejected', reason: 'noise' },
      offlineEvent({ cappedSeconds: 1800, goldReward: 900 }),
    ];
    const summary = summarizeOfflineReward(events, MODAL_MIN_SECONDS);
    assert.equal(summary?.awayLabel, '30m');
  });
});

describe('formatAwayDuration', () => {
  it('formats whole-minute absences', () => {
    assert.equal(formatAwayDuration(45 * 60), '45m');
  });

  it('formats a round hour without trailing minutes', () => {
    assert.equal(formatAwayDuration(3600), '1h');
  });

  it('formats hours with remaining minutes', () => {
    assert.equal(formatAwayDuration(2 * 3600 + 14 * 60), '2h 14m');
  });

  it('formats the 8h ceiling', () => {
    assert.equal(formatAwayDuration(8 * 3600), '8h');
  });
});
