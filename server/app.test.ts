import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { GameEvent, GameSnapshot } from '../src/game/types';
import { createGameRequestHandler } from './app';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';

interface PlayerStateResponse {
  playerId: string;
  snapshot: GameSnapshot;
}

interface GameActionResponse extends PlayerStateResponse {
  events: GameEvent[];
}

const listen = async (server: Server) => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
};

const closeServer = async (server: Server) => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
};

const requestJson = async <TResponse>(url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');

  return {
    response,
    body: await response.json() as TResponse,
  };
};

describe('game API persistence', () => {
  it('persists an action result and returns the stored snapshot on the next state request', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-api-'));
    const database = openDatabase(join(tempDir, 'game.sqlite'));
    const repository = new GameRepository(database);
    const server = createServer(createGameRequestHandler(repository));
    let serverStarted = false;

    try {
      await listen(server);
      serverStarted = true;

      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;
      const playerId = 'dev:http-persistent-player';
      const initialState = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}`,
      );

      assert.equal(initialState.response.status, 200);
      assert.equal(initialState.body.playerId, playerId);

      const actionResult = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          action: {
            type: 'deal_damage',
            amount: initialState.body.snapshot.monsterMaxHealth,
            source: 'tap',
          },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      assert.equal(actionResult.response.status, 200);
      assert.equal(actionResult.body.snapshot.stage, initialState.body.snapshot.stage + 1);
      assert.equal(actionResult.body.events[0]?.type, 'monster_defeated');

      const restoredState = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}`,
      );

      assert.equal(restoredState.response.status, 200);
      assert.deepEqual(restoredState.body.snapshot, actionResult.body.snapshot);
    } finally {
      if (serverStarted) {
        await closeServer(server);
      }
      database.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
