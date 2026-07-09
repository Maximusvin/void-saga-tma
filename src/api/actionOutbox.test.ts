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

  it('restores valid progression commands and drops invalid bulk amounts', () => {
    const playerId = 'test:outbox-progression';
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });

    try {
      storage.set(`void_saga_action_outbox:${playerId}`, JSON.stringify([
        {
          commandId: 'cmd:outbox-bulk-001',
          action: { type: 'upgrade_hero', heroId: 'void-grunt', amount: 'max' },
        },
        {
          commandId: 'cmd:outbox-ascend-1',
          action: { type: 'ascend_hero', heroId: 'void-grunt' },
        },
        {
          commandId: 'cmd:outbox-invalid1',
          action: { type: 'upgrade_hero', heroId: 'void-grunt', amount: 50 },
        },
      ]));

      assert.deepEqual(loadActionOutbox(playerId), [
        {
          commandId: 'cmd:outbox-bulk-001',
          action: { type: 'upgrade_hero', heroId: 'void-grunt', amount: 'max' },
        },
        {
          commandId: 'cmd:outbox-ascend-1',
          action: { type: 'ascend_hero', heroId: 'void-grunt' },
        },
      ]);
    } finally {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
});
