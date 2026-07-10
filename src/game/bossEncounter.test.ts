import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBossClockSync, getBossClockRemainingMs } from './bossEncounter';

describe('boss encounter clock', () => {
  it('uses the server snapshot delta instead of the client wall clock', () => {
    const clientNowMs = Date.parse('2030-01-01T00:00:00.000Z');
    const clock = createBossClockSync(
      '2026-07-09T12:00:35.000Z',
      '2026-07-09T12:00:05.000Z',
      clientNowMs,
      35_000,
    );

    assert.equal(getBossClockRemainingMs(clock, clientNowMs), 30_000);
    assert.equal(getBossClockRemainingMs(clock, clientNowMs + 1_250), 28_750);
  });

  it('clamps invalid, expired, and implausibly long deadlines', () => {
    const clientNowMs = 1_000;
    const invalid = createBossClockSync(null, 'invalid', clientNowMs, 35_000);
    const expired = createBossClockSync(
      '2026-07-09T12:00:00.000Z',
      '2026-07-09T12:00:05.000Z',
      clientNowMs,
      35_000,
    );
    const tooLong = createBossClockSync(
      '2026-07-09T12:02:00.000Z',
      '2026-07-09T12:00:00.000Z',
      clientNowMs,
      35_000,
    );

    assert.equal(getBossClockRemainingMs(invalid, clientNowMs), 0);
    assert.equal(getBossClockRemainingMs(expired, clientNowMs), 0);
    assert.equal(getBossClockRemainingMs(tooLong, clientNowMs), 35_000);
  });
});
