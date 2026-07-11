import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getLeagueDivision, getLeagueProgress, normalizeRealmLeaderboard } from './leaderboard';

const entry = {
  displayName: 'Maksym Kozlov',
  division: 'gold',
  enemyIndex: 2,
  isCurrentPlayer: true,
  passivePower: '1250',
  photoUrl: 'https://example.com/avatar.jpg',
  rank: 4,
  stage: 240,
};
const topEntry = { ...entry, isCurrentPlayer: false, rank: 1 };

describe('realm leaderboard contract', () => {
  it('maps campaign milestones to stable divisions', () => {
    assert.equal(getLeagueDivision(1), 'bronze');
    assert.equal(getLeagueDivision(50), 'silver');
    assert.equal(getLeagueDivision(200), 'gold');
    assert.equal(getLeagueDivision(1_000), 'mythic');
  });

  it('projects exact progress to the next campaign division', () => {
    assert.deepEqual(getLeagueProgress(1), {
      division: 'bronze',
      nextDivision: 'silver',
      nextStage: 50,
      progressPercent: 0,
      stagesRemaining: 49,
    });
    assert.equal(getLeagueProgress(49).stagesRemaining, 1);
    assert.equal(getLeagueProgress(50).division, 'silver');
    assert.equal(getLeagueProgress(199).stagesRemaining, 1);
    assert.deepEqual(getLeagueProgress(1_000), {
      division: 'mythic',
      nextDivision: null,
      nextStage: null,
      progressPercent: 100,
      stagesRemaining: 0,
    });
  });

  it('accepts a bounded privacy-safe leaderboard', () => {
    const leaderboard = normalizeRealmLeaderboard({
      currentPlayer: entry,
      generatedAt: '2026-07-10T20:00:00.000Z',
      realmCode: 'S-1',
      top: [topEntry],
      totalPlayers: 8,
    });

    assert.ok(leaderboard);
    assert.equal(leaderboard.currentPlayer.passivePower, '1250');
    assert.equal(leaderboard.top[0]?.displayName, 'Maksym Kozlov');
  });

  it('rejects forged divisions, unsafe photos, and oversized lists', () => {
    assert.equal(normalizeRealmLeaderboard({
      currentPlayer: { ...entry, division: 'mythic' },
      generatedAt: '2026-07-10T20:00:00.000Z',
      realmCode: 'S-1',
      top: [topEntry],
      totalPlayers: 8,
    }), null);
    assert.equal(normalizeRealmLeaderboard({
      currentPlayer: { ...entry, photoUrl: 'http://example.com/avatar.jpg' },
      generatedAt: '2026-07-10T20:00:00.000Z',
      realmCode: 'S-1',
      top: [topEntry],
      totalPlayers: 8,
    }), null);
    assert.equal(normalizeRealmLeaderboard({
      currentPlayer: entry,
      generatedAt: '2026-07-10T20:00:00.000Z',
      realmCode: 'S-1',
      top: Array.from({ length: 51 }, () => entry),
      totalPlayers: 80,
    }), null);
    assert.equal(normalizeRealmLeaderboard({
      currentPlayer: entry,
      generatedAt: '2026-07-10T20:00:00.000Z',
      realmCode: 'S-1',
      top: [{ ...entry, rank: 2 }],
      totalPlayers: 8,
    }), null);
  });
});
