import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GAME_SNAPSHOT_SCHEMA_VERSION, type GameEvent, type GameSnapshot } from '../src/game/types';
import { gameNumber, subtractGameNumbers } from '../src/game/gameNumber';
import type { PlayerProfile } from '../src/shared/playerProfile';
import type { RealmContext, RealmDirectory } from '../src/shared/realm';
import { createGameRequestHandler } from './app';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';
import { RealmRepository } from './realmRepository';

interface PlayerStateResponse {
  characterId: string;
  playerId: string;
  playerProfile: PlayerProfile;
  realm: RealmContext;
  snapshot: GameSnapshot;
}

interface GameActionResponse extends PlayerStateResponse {
  events: GameEvent[];
  replayed: boolean;
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
    const server = createServer(createGameRequestHandler(repository, new RealmRepository(database)));
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
      assert.deepEqual(initialState.body.playerProfile, {
        displayName: 'Riftwalker',
        photoUrl: null,
        source: 'local',
        username: null,
      });
      assert.equal(initialState.body.snapshot.schemaVersion, GAME_SNAPSHOT_SCHEMA_VERSION);
      assert.equal(typeof initialState.body.snapshot.gold, 'string');
      assert.equal(typeof initialState.body.snapshot.monsterHealth, 'string');

      const actionResult = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-0001',
          action: {
            type: 'combat_batch',
            tapCount: 1,
            passiveTicks: 0,
          },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      assert.equal(actionResult.response.status, 200);
      assert.equal(actionResult.body.events[0]?.type, 'monster_hit');
      assert.deepEqual(actionResult.body.playerProfile, initialState.body.playerProfile);
      const hitEvent = actionResult.body.events[0];
      assert.equal(hitEvent.type, 'monster_hit');
      assert.equal(
        actionResult.body.snapshot.monsterHealth,
        subtractGameNumbers(initialState.body.snapshot.monsterHealth, hitEvent.damage),
      );
      assert.equal(actionResult.body.replayed, false);

      const replayedAction = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-0001',
          action: {
            type: 'combat_batch',
            tapCount: 1,
            passiveTicks: 0,
          },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      assert.equal(replayedAction.response.status, 200);
      assert.equal(replayedAction.body.replayed, true);
      assert.deepEqual(replayedAction.body.snapshot, actionResult.body.snapshot);
      assert.deepEqual(replayedAction.body.events, actionResult.body.events);

      const restoredState = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}`,
      );

      assert.equal(restoredState.response.status, 200);
      assert.deepEqual(restoredState.body.snapshot, actionResult.body.snapshot);

      const rejectedDamage = await requestJson<{ error: string }>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-0002',
          action: { type: 'deal_damage', amount: 1_000_000, source: 'tap' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      assert.equal(rejectedDamage.response.status, 400);
      assert.equal(rejectedDamage.body.error, 'invalid_action_request');

      const invalidJson = await requestJson<{ error: string }>(`${baseUrl}/api/game/action`, {
        body: '{broken',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(invalidJson.response.status, 400);
      assert.equal(invalidJson.body.error, 'invalid_json');

      const oversizedPayload = await requestJson<{ error: string }>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({ padding: 'x'.repeat(17_000) }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(oversizedPayload.response.status, 413);
      assert.equal(oversizedPayload.body.error, 'payload_too_large');
    } finally {
      if (serverStarted) {
        await closeServer(server);
      }
      database.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists ascension and replays a bulk upgrade without charging twice', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-api-ascension-'));
    const database = openDatabase(join(tempDir, 'game.sqlite'));
    const repository = new GameRepository(database);
    const realmRepository = new RealmRepository(database);
    const server = createServer(createGameRequestHandler(repository, realmRepository));
    const playerId = 'dev:http-ascension-player';
    let serverStarted = false;

    try {
      const realm = realmRepository.resolveActiveCharacter(playerId);
      const player = repository.getOrCreatePlayer(realm.characterId);
      repository.savePlayer(realm.characterId, {
        ...player.snapshot,
        activeHeroIds: ['void-grunt'],
        gold: gameNumber('1e30'),
        heroes: [{
          ascension: 0,
          id: 'void-grunt',
          level: 50,
          name: 'Void Grunt',
          power: gameNumber('2.12540502289226873016357e+9'),
          rarity: 'Common',
          shards: 3,
          templateId: 'void-grunt',
        }],
      });

      await listen(server);
      serverStarted = true;
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;
      const result = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-ascend-0001',
          action: { type: 'ascend_hero', heroId: 'void-grunt' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      assert.equal(result.response.status, 200);
      assert.equal(result.body.replayed, false);
      assert.equal(result.body.events[0]?.type, 'hero_ascended');
      assert.equal(result.body.snapshot.heroes[0]?.ascension, 1);
      assert.equal(result.body.snapshot.heroes[0]?.shards, 0);

      const bulkUpgrade = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-bulk-0001',
          action: { type: 'upgrade_hero', heroId: 'void-grunt', amount: 'max' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const upgradeEvent = bulkUpgrade.body.events[0];

      assert.equal(bulkUpgrade.response.status, 200);
      assert.equal(bulkUpgrade.body.replayed, false);
      assert.equal(upgradeEvent.type, 'hero_upgraded');
      assert.equal(upgradeEvent.fromLevel, 50);
      assert.equal(upgradeEvent.levelsGained, 50);
      assert.equal(upgradeEvent.level, 100);

      const replay = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-bulk-0001',
          action: { type: 'upgrade_hero', heroId: 'void-grunt', amount: 'max' },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(replay.body.replayed, true);
      assert.deepEqual(replay.body.snapshot, bulkUpgrade.body.snapshot);
      assert.deepEqual(replay.body.events, bulkUpgrade.body.events);

      const warbandUpdate = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          playerId,
          commandId: 'cmd:http-warband-0001',
          action: { type: 'set_active_warband', heroIds: [] },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(warbandUpdate.response.status, 200);
      assert.deepEqual(warbandUpdate.body.snapshot.activeHeroIds, []);
      assert.deepEqual(warbandUpdate.body.events, [{ type: 'active_warband_updated', heroIds: [] }]);

      const restored = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}`,
      );
      assert.equal(restored.body.snapshot.heroes[0]?.ascension, 1);
      assert.equal(restored.body.snapshot.heroes[0]?.shards, 0);
      assert.equal(restored.body.snapshot.heroes[0]?.level, 100);
      assert.deepEqual(restored.body.snapshot.activeHeroIds, []);
    } finally {
      if (serverStarted) {
        await closeServer(server);
      }
      database.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps progression isolated across realm characters and enforces ownership', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-api-realms-'));
    const database = openDatabase(join(tempDir, 'game.sqlite'));
    const repository = new GameRepository(database);
    const realmRepository = new RealmRepository(database);
    const server = createServer(createGameRequestHandler(repository, realmRepository));
    let serverStarted = false;

    try {
      await listen(server);
      serverStarted = true;
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;
      const playerId = 'dev:http-realm-player';
      const initial = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}`,
      );
      const s1CharacterId = initial.body.characterId;
      const initialHealth = initial.body.snapshot.monsterHealth;
      const s2 = realmRepository.createRealm('test', 'manual', '2026-07-10T12:00:00.000Z');

      const directory = await requestJson<RealmDirectory>(
        `${baseUrl}/api/game/realms?playerId=${encodeURIComponent(playerId)}`,
      );
      assert.equal(directory.body.recommendedRealmId, s2.id);
      assert.equal(directory.body.realms.find(realm => realm.code === 'S-1')?.characterId, s1CharacterId);
      assert.equal(directory.body.realms.find(realm => realm.code === 'S-2')?.status, 'open');

      const joined = await requestJson<{ realm: RealmContext }>(`${baseUrl}/api/game/realms/join`, {
        body: JSON.stringify({ playerId, realmId: s2.id }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(joined.response.status, 200);
      assert.equal(joined.body.realm.originRealmCode, 'S-2');
      assert.notEqual(joined.body.realm.characterId, s1CharacterId);

      const s2Action = await requestJson<GameActionResponse>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          characterId: joined.body.realm.characterId,
          playerId,
          commandId: 'cmd:realm-s2-0001',
          action: { type: 'combat_batch', tapCount: 1, passiveTicks: 0 },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(s2Action.response.status, 200);
      assert.notEqual(s2Action.body.snapshot.monsterHealth, initialHealth);

      const restoredS1 = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}&characterId=${encodeURIComponent(s1CharacterId)}`,
      );
      assert.equal(restoredS1.body.snapshot.monsterHealth, initialHealth);

      const forbidden = await requestJson<{ error: string }>(`${baseUrl}/api/game/action`, {
        body: JSON.stringify({
          characterId: s1CharacterId,
          playerId: 'dev:another-account',
          commandId: 'cmd:realm-forbidden-0001',
          action: { type: 'combat_batch', tapCount: 1, passiveTicks: 0 },
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(forbidden.response.status, 403);
      assert.equal(forbidden.body.error, 'character_not_owned');

      const selected = await requestJson<{ realm: RealmContext }>(`${baseUrl}/api/game/realms/select`, {
        body: JSON.stringify({ characterId: s1CharacterId, playerId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(selected.body.realm.characterId, s1CharacterId);
      const active = await requestJson<PlayerStateResponse>(
        `${baseUrl}/api/game/state?playerId=${encodeURIComponent(playerId)}`,
      );
      assert.equal(active.body.characterId, s1CharacterId);

      const lockedJoin = await requestJson<{ error: string }>(`${baseUrl}/api/game/realms/join`, {
        body: JSON.stringify({ playerId: 'dev:new-account', realmId: initial.body.realm.originRealmId }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      assert.equal(lockedJoin.response.status, 409);
      assert.equal(lockedJoin.body.error, 'realm_not_open');
    } finally {
      if (serverStarted) {
        await closeServer(server);
      }
      database.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
