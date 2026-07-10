import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { createGameRequestHandler } from './app';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';
import { LeaderboardRepository } from './leaderboardRepository';
import { RealmRepository } from './realmRepository';

describe('realm leaderboard API', () => {
  it('returns an authenticated no-store response without internal ids', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-leaderboard-api-'));
    const database = openDatabase(join(tempDir, 'game.sqlite'));
    const games = new GameRepository(database);
    const realms = new RealmRepository(database);
    const leaderboards = new LeaderboardRepository(database);
    const server = createServer(createGameRequestHandler(games, realms, leaderboards));

    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
      });
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const playerId = 'dev:leaderboard-api-player';
      const stateResponse = await fetch(
        `http://127.0.0.1:${address.port}/api/game/state?playerId=${playerId}`,
      );
      const state = await stateResponse.json() as { characterId: string };
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/game/leaderboard?playerId=${playerId}&characterId=${encodeURIComponent(state.characterId)}`,
      );
      const rawBody = await response.text();
      const body = JSON.parse(rawBody) as {
        currentPlayer: { displayName: string; rank: number };
        totalPlayers: number;
      };

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(body.totalPlayers, 1);
      assert.equal(body.currentPlayer.rank, 1);
      assert.equal(body.currentPlayer.displayName, 'Riftwalker');
      assert.equal(rawBody.includes(playerId), false);
      assert.equal(rawBody.includes(state.characterId), false);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      database.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
