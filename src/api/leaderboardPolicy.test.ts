import assert from 'node:assert/strict';
import test from 'node:test';
import { getLeaderboardStatusWhenBackendIsBlocked } from './leaderboardPolicy';

test('surfaces an unavailable leaderboard when backend bootstrap failed', () => {
  assert.equal(getLeaderboardStatusWhenBackendIsBlocked('idle', 'error'), 'error');
  assert.equal(getLeaderboardStatusWhenBackendIsBlocked('loading', 'error'), 'error');
});

test('keeps already loaded standings visible through a later backend failure', () => {
  assert.equal(getLeaderboardStatusWhenBackendIsBlocked('ready', 'error'), 'ready');
});

test('does not invent a leaderboard failure while backend bootstrap is pending', () => {
  assert.equal(getLeaderboardStatusWhenBackendIsBlocked('idle', 'loading'), 'idle');
});
