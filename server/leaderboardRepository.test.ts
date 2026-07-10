import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { gameNumber } from '../src/game/gameNumber';
import type { PlayerProfile } from '../src/shared/playerProfile';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';
import { LeaderboardRepository } from './leaderboardRepository';
import { RealmRepository } from './realmRepository';

const profile = (displayName: string): PlayerProfile => ({
  displayName,
  photoUrl: null,
  source: 'telegram',
  username: null,
});

const setProgress = (
  repository: GameRepository,
  characterId: string,
  stage: number,
  enemyIndex: number,
) => {
  const state = repository.getOrCreatePlayer(characterId);
  repository.savePlayer(characterId, {
    ...state.snapshot,
    activeHeroIds: ['void-mage'],
    enemyIndex,
    heroes: [{
      ascension: 0,
      id: 'void-mage',
      level: 1,
      name: 'Void Mage',
      power: gameNumber(stage * 10),
      rarity: 'Rare',
      shards: 0,
      templateId: 'void-mage',
    }],
    stage,
  });
};

describe('realm leaderboard repository', () => {
  it('orders authoritative progress and returns the current rank', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-leaderboard-'));
    let database: DatabaseSync | null = null;
    try {
      database = openDatabase(join(tempDir, 'game.sqlite'));
      const games = new GameRepository(database);
      const realms = new RealmRepository(database);
      const leaderboard = new LeaderboardRepository(database);
      const first = realms.resolveActiveCharacter('telegram:1');
      const second = realms.resolveActiveCharacter('telegram:2');
      const third = realms.resolveActiveCharacter('telegram:3');

      setProgress(games, first.characterId, 240, 1);
      setProgress(games, second.characterId, 240, 2);
      setProgress(games, third.characterId, 90, 0);
      leaderboard.upsertProfile('telegram:1', profile('First'));
      leaderboard.upsertProfile('telegram:2', profile('Second'));
      leaderboard.upsertProfile('telegram:3', profile('Third'));

      const result = leaderboard.getRealmLeaderboard(
        first.canonicalRealmId,
        first.characterId,
        '2026-07-10T20:00:00.000Z',
      );

      assert.equal(result.totalPlayers, 3);
      assert.deepEqual(result.top.map(entry => entry.displayName), ['Second', 'First', 'Third']);
      assert.equal(result.currentPlayer.rank, 2);
      assert.equal(result.currentPlayer.division, 'gold');
      assert.equal(result.top[0]?.passivePower, '2400');
    } finally {
      database?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('combines only source realms that belong to the same canonical merge', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-merged-leaderboard-'));
    let database: DatabaseSync | null = null;
    try {
      database = openDatabase(join(tempDir, 'game.sqlite'));
      const games = new GameRepository(database);
      const realms = new RealmRepository(database);
      const leaderboard = new LeaderboardRepository(database);
      realms.updatePolicy({ mergeBatchSize: 2 });

      const first = realms.resolveActiveCharacter('telegram:11');
      realms.createRealm('test', 'open-s2', '2026-07-10T01:00:00.000Z');
      const second = realms.resolveActiveCharacter('telegram:12');
      realms.createRealm('test', 'open-s3', '2026-07-10T02:00:00.000Z');
      const third = realms.resolveActiveCharacter('telegram:13');
      const merged = realms.mergeNext('test', '2026-07-10T03:00:00.000Z');
      assert.ok(merged);

      setProgress(games, first.characterId, 100, 0);
      setProgress(games, second.characterId, 200, 0);
      setProgress(games, third.characterId, 999, 0);
      leaderboard.upsertProfile('telegram:11', profile('S1 Player'));
      leaderboard.upsertProfile('telegram:12', profile('S2 Player'));
      leaderboard.upsertProfile('telegram:13', profile('S3 Player'));

      const result = leaderboard.getRealmLeaderboard(
        merged.id,
        first.characterId,
        '2026-07-10T20:00:00.000Z',
      );

      assert.equal(result.realmCode, 'M-1');
      assert.equal(result.totalPlayers, 2);
      assert.deepEqual(result.top.map(entry => entry.displayName), ['S2 Player', 'S1 Player']);
    } finally {
      database?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
