import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGameActionRequest } from './validation';

describe('game action request validation', () => {
  it('accepts supported player actions', () => {
    assert.deepEqual(
      parseGameActionRequest({
        playerId: 'dev:test',
        action: { type: 'deal_damage', amount: 2, source: 'tap' },
      }),
      {
        requestedPlayerId: 'dev:test',
        action: { type: 'deal_damage', amount: 2, source: 'tap' },
      },
    );
  });

  it('rejects client-controlled summon randomness and unavailable skills', () => {
    assert.equal(
      parseGameActionRequest({
        action: { type: 'summon', randomValue: 0.999 },
      }),
      null,
    );
    assert.equal(
      parseGameActionRequest({
        action: { type: 'deal_damage', amount: 1, source: 'skill' },
      }),
      null,
    );
  });
});
