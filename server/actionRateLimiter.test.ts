import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ActionRateLimiter } from './actionRateLimiter';

describe('game action rate limiter', () => {
  it('allows normal tapping and resets the tap window', () => {
    const limiter = new ActionRateLimiter();
    const tap = { type: 'combat_batch', tapCount: 1, passiveTicks: 0 } as const;

    for (let index = 0; index < 20; index += 1) {
      assert.equal(limiter.getRejection('player', tap, 1_000), null);
    }
    assert.equal(limiter.getRejection('player', tap, 1_000), 'action_rate_limited');
    assert.equal(limiter.getRejection('player', tap, 2_000), null);
  });

  it('limits passive ticks independently per player', () => {
    const limiter = new ActionRateLimiter();
    const passive = { type: 'combat_batch', tapCount: 0, passiveTicks: 1 } as const;

    assert.equal(limiter.getRejection('player-a', passive, 1_000), null);
    assert.equal(limiter.getRejection('player-a', passive, 1_500), 'action_rate_limited');
    assert.equal(limiter.getRejection('player-b', passive, 1_500), null);
    assert.equal(limiter.getRejection('player-a', passive, 1_900), null);
  });

  it('lets idle ticks ride along with a tap batch inside the passive interval', () => {
    const limiter = new ActionRateLimiter();
    const idleOnly = { type: 'combat_batch', tapCount: 0, passiveTicks: 1 } as const;
    const tapsWithIdle = { type: 'combat_batch', tapCount: 3, passiveTicks: 1 } as const;

    assert.equal(limiter.getRejection('player', idleOnly, 1_000), null);
    // Rejecting this would silently throw away the player's taps.
    assert.equal(limiter.getRejection('player', tapsWithIdle, 1_080), null);
    // A pure idle batch inside the interval is still rate limited.
    assert.equal(limiter.getRejection('player', idleOnly, 1_120), 'action_rate_limited');
  });
});
