import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendActionOutbox, loadActionOutbox, removeActionOutbox } from './actionOutbox';

describe('game action outbox', () => {
  it('keeps pending commands ordered and removes only confirmed commands', () => {
    const playerId = 'test:outbox-order';
    const first = {
      commandId: 'cmd:outbox-0001',
      action: { type: 'combat_batch', tapCount: 5, passiveTicks: 0 } as const,
    };
    const second = {
      commandId: 'cmd:outbox-0002',
      action: { type: 'claim_offline_rewards' } as const,
    };

    appendActionOutbox(playerId, first);
    appendActionOutbox(playerId, second);
    appendActionOutbox(playerId, first);
    assert.deepEqual(loadActionOutbox(playerId), [first, second]);

    removeActionOutbox(playerId, first.commandId);
    assert.deepEqual(loadActionOutbox(playerId), [second]);
    removeActionOutbox(playerId, second.commandId);
    assert.deepEqual(loadActionOutbox(playerId), []);
  });
});
