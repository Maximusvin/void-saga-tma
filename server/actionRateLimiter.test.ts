import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ActionRateLimiter } from './actionRateLimiter';

describe('game action rate limiter', () => {
  it('allows normal tapping and resets the tap window', () => {
    const limiter = new ActionRateLimiter();
    const tap = { type: 'deal_damage', amount: 1, source: 'tap' } as const;

    for (let index = 0; index < 20; index += 1) {
      assert.equal(limiter.getRejection('player', tap, 1_000), null);
    }
    assert.equal(limiter.getRejection('player', tap, 1_000), 'action_rate_limited');
    assert.equal(limiter.getRejection('player', tap, 2_000), null);
  });

  it('limits passive ticks independently per player', () => {
    const limiter = new ActionRateLimiter();
    const passive = {
      type: 'deal_damage',
      amount: 10,
      source: 'passive',
    } as const;

    assert.equal(limiter.getRejection('player-a', passive, 1_000), null);
    assert.equal(limiter.getRejection('player-a', passive, 1_500), 'action_rate_limited');
    assert.equal(limiter.getRejection('player-b', passive, 1_500), null);
    assert.equal(limiter.getRejection('player-a', passive, 1_900), null);
  });
});
