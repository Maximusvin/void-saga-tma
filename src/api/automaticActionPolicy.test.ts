import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canDispatchAutomaticGameActions,
  type AutomaticActionBackendStatus,
} from './automaticActionPolicy';

describe('automatic game action policy', () => {
  it('keeps local mode active without a backend connection', () => {
    const statuses: AutomaticActionBackendStatus[] = ['local', 'loading', 'synced', 'error'];

    for (const status of statuses) {
      assert.equal(canDispatchAutomaticGameActions(false, status), true);
    }
  });

  it('allows API-backed timers only after synchronization', () => {
    assert.equal(canDispatchAutomaticGameActions(true, 'loading'), false);
    assert.equal(canDispatchAutomaticGameActions(true, 'error'), false);
    assert.equal(canDispatchAutomaticGameActions(true, 'local'), false);
    assert.equal(canDispatchAutomaticGameActions(true, 'synced'), true);
  });
});
