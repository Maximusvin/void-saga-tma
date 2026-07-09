import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGameActionRequest } from './validation';

describe('game action request validation', () => {
  it('accepts supported player actions', () => {
    assert.deepEqual(
      parseGameActionRequest({
        commandId: 'cmd:test-0001',
        playerId: 'dev:test',
        action: { type: 'combat_batch', tapCount: 12, passiveTicks: 0 },
      }),
      {
        commandId: 'cmd:test-0001',
        requestedPlayerId: 'dev:test',
        action: { type: 'combat_batch', tapCount: 12, passiveTicks: 0 },
      },
    );
  });

  it('rejects client-controlled summon randomness and unavailable skills', () => {
    assert.equal(
      parseGameActionRequest({
        commandId: 'cmd:test-0002',
        action: { type: 'summon', randomValue: 0.999 },
      }),
      null,
    );
    assert.equal(
      parseGameActionRequest({
        commandId: 'cmd:test-0003',
        action: { type: 'deal_damage', amount: 1, source: 'tap' },
      }),
      null,
    );
  });

  it('requires a bounded non-empty batch and a valid command id', () => {
    assert.equal(parseGameActionRequest({
      commandId: 'short',
      action: { type: 'combat_batch', tapCount: 1, passiveTicks: 0 },
    }), null);
    assert.equal(parseGameActionRequest({
      commandId: 'cmd:test-0004',
      action: { type: 'combat_batch', tapCount: 21, passiveTicks: 0 },
    }), null);
    assert.equal(parseGameActionRequest({
      commandId: 'cmd:test-0005',
      action: { type: 'combat_batch', tapCount: 0, passiveTicks: 0 },
    }), null);
  });
});
