import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStaleChunkRecoveryHandler } from './staleChunkRecovery';

const createEvent = () => {
  let prevented = false;
  return {
    event: { preventDefault: () => { prevented = true; } },
    wasPrevented: () => prevented,
  };
};

describe('stale chunk recovery', () => {
  it('stores the attempt and reloads on the first preload error', () => {
    const reloads: number[] = [];
    const writes: number[] = [];
    const preloadError = createEvent();
    const handler = createStaleChunkRecoveryHandler({
      now: () => 100_000,
      readLastAttempt: () => null,
      reload: () => reloads.push(1),
      writeLastAttempt: attemptedAt => writes.push(attemptedAt),
    });

    assert.equal(handler(preloadError.event), true);
    assert.equal(preloadError.wasPrevented(), true);
    assert.deepEqual(writes, [100_000]);
    assert.equal(reloads.length, 1);
  });

  it('does not create a reload loop inside the cooldown window', () => {
    const preloadError = createEvent();
    let reloads = 0;
    const handler = createStaleChunkRecoveryHandler({
      now: () => 159_999,
      readLastAttempt: () => 100_000,
      reload: () => { reloads += 1; },
      writeLastAttempt: () => assert.fail('must not overwrite a recent attempt'),
    });

    assert.equal(handler(preloadError.event), false);
    assert.equal(preloadError.wasPrevented(), false);
    assert.equal(reloads, 0);
  });

  it('allows recovery again after the cooldown expires', () => {
    const preloadError = createEvent();
    let reloads = 0;
    const handler = createStaleChunkRecoveryHandler({
      now: () => 160_000,
      readLastAttempt: () => 100_000,
      reload: () => { reloads += 1; },
      writeLastAttempt: () => undefined,
    });

    assert.equal(handler(preloadError.event), true);
    assert.equal(preloadError.wasPrevented(), true);
    assert.equal(reloads, 1);
  });

  it('falls through to normal error handling when storage cannot be read', () => {
    const preloadError = createEvent();
    let reloads = 0;
    const handler = createStaleChunkRecoveryHandler({
      now: () => 100_000,
      readLastAttempt: () => { throw new Error('storage denied'); },
      reload: () => { reloads += 1; },
      writeLastAttempt: () => undefined,
    });

    assert.equal(handler(preloadError.event), false);
    assert.equal(preloadError.wasPrevented(), false);
    assert.equal(reloads, 0);
  });

  it('does not reload when the loop guard cannot be persisted', () => {
    const preloadError = createEvent();
    let reloads = 0;
    const handler = createStaleChunkRecoveryHandler({
      now: () => 100_000,
      readLastAttempt: () => null,
      reload: () => { reloads += 1; },
      writeLastAttempt: () => { throw new Error('storage denied'); },
    });

    assert.equal(handler(preloadError.event), false);
    assert.equal(preloadError.wasPrevented(), false);
    assert.equal(reloads, 0);
  });
});
