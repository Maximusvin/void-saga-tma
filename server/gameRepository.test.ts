import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { applyCombatBatchAction, applyDamageAction } from '../src/game/engine';
import { openDatabase } from './db';
import { GameRepository } from './gameRepository';

describe('game repository persistence', () => {
  it('keeps a saved player snapshot after reopening the SQLite database', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-db-'));
    const databasePath = join(tempDir, 'game.sqlite');
    let firstDatabase: DatabaseSync | null = null;
    let secondDatabase: DatabaseSync | null = null;

    try {
      firstDatabase = openDatabase(databasePath);
      const firstRepository = new GameRepository(firstDatabase);
      const initialState = firstRepository.getOrCreatePlayer('dev:persistent-player');
      const killResult = applyDamageAction(
        initialState.snapshot,
        initialState.snapshot.monsterMaxHealth,
        'tap',
      );

      firstRepository.savePlayer('dev:persistent-player', killResult.snapshot);
      firstDatabase.close();
      firstDatabase = null;

      secondDatabase = openDatabase(databasePath);
      const secondRepository = new GameRepository(secondDatabase);
      const restoredState = secondRepository.getOrCreatePlayer('dev:persistent-player');
      secondDatabase.close();
      secondDatabase = null;

      assert.equal(restoredState.playerId, 'dev:persistent-player');
      assert.equal(restoredState.snapshot.stage, killResult.snapshot.stage);
      assert.equal(restoredState.snapshot.gold, killResult.snapshot.gold);
      assert.equal(restoredState.snapshot.monsterHealth, killResult.snapshot.monsterHealth);
    } finally {
      firstDatabase?.close();
      secondDatabase?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('replays a persisted command result without applying its mutation twice', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-command-'));
    const databasePath = join(tempDir, 'game.sqlite');
    let firstDatabase: DatabaseSync | null = null;
    let secondDatabase: DatabaseSync | null = null;
    let mutationCount = 0;

    try {
      firstDatabase = openDatabase(databasePath);
      const firstRepository = new GameRepository(firstDatabase);
      const applyMutation = (snapshot: ReturnType<GameRepository['getOrCreatePlayer']>['snapshot']) => {
        mutationCount += 1;
        return applyCombatBatchAction(snapshot, 3, 0, { random: () => 0.5 });
      };

      const first = firstRepository.runIdempotentCommand('dev:command-player', 'cmd:test-0001', applyMutation);
      const replay = firstRepository.runIdempotentCommand('dev:command-player', 'cmd:test-0001', applyMutation);

      assert.equal(first.replayed, false);
      assert.equal(replay.replayed, true);
      assert.equal(mutationCount, 1);
      assert.deepEqual(replay.result, first.result);
      firstDatabase.close();
      firstDatabase = null;

      secondDatabase = openDatabase(databasePath);
      const secondRepository = new GameRepository(secondDatabase);
      const replayAfterRestart = secondRepository.runIdempotentCommand(
        'dev:command-player',
        'cmd:test-0001',
        applyMutation,
      );

      assert.equal(replayAfterRestart.replayed, true);
      assert.equal(mutationCount, 1);
      assert.deepEqual(replayAfterRestart.result, first.result);
    } finally {
      firstDatabase?.close();
      secondDatabase?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('migrates legacy numeric snapshots and command events during reads', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-legacy-numbers-'));
    const databasePath = join(tempDir, 'game.sqlite');
    let database: DatabaseSync | null = null;

    try {
      database = openDatabase(databasePath);
      const timestamp = '2026-07-09T12:00:00.000Z';
      const legacySnapshot = {
        comboCount: 0,
        comboExpiresAt: null,
        gems: 50,
        gold: 1002.5999999999999,
        heroes: [{ id: 'legacy', level: 1, name: 'Legacy', power: 10, rarity: 'Rare' }],
        lastSeenAt: timestamp,
        monsterHealth: 98.8,
        monsterMaxHealth: 100,
        stage: 1,
        updatedAt: timestamp,
      };
      database.prepare(
        'INSERT INTO players (id, created_at, updated_at, snapshot_json) VALUES (?, ?, ?, ?)',
      ).run('dev:legacy-numbers', timestamp, timestamp, JSON.stringify(legacySnapshot));
      database.prepare(
        'INSERT INTO game_commands (player_id, command_id, created_at, events_json) VALUES (?, ?, ?, ?)',
      ).run(
        'dev:legacy-numbers',
        'cmd:legacy-0001',
        timestamp,
        JSON.stringify([{
          type: 'monster_hit',
          comboCount: 1,
          damage: 1.2000000000000002,
          isCrit: false,
          monsterHealth: 98.8,
          source: 'tap',
          stage: 1,
        }]),
      );

      const repository = new GameRepository(database);
      const migrated = repository.getOrCreatePlayer('dev:legacy-numbers');
      const replay = repository.runIdempotentCommand(
        'dev:legacy-numbers',
        'cmd:legacy-0001',
        snapshot => ({ snapshot, events: [] }),
      );
      const storedSnapshot = JSON.parse((database.prepare(
        'SELECT snapshot_json FROM players WHERE id = ?',
      ).get('dev:legacy-numbers') as { snapshot_json: string }).snapshot_json) as Record<string, unknown>;

      assert.equal(migrated.snapshot.schemaVersion, 2);
      assert.equal(migrated.snapshot.gold, '1002.6');
      assert.equal(migrated.snapshot.heroes[0]?.power, '10');
      assert.equal(storedSnapshot.schemaVersion, 2);
      assert.equal(storedSnapshot.gold, '1002.6');
      assert.equal(replay.replayed, true);
      assert.equal(replay.result.events[0]?.type, 'monster_hit');
      assert.equal(
        replay.result.events[0]?.type === 'monster_hit' ? replay.result.events[0].damage : null,
        '1.2',
      );
    } finally {
      database?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('bounds the idempotency ledger per player', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-command-retention-'));
    const databasePath = join(tempDir, 'game.sqlite');
    let database: DatabaseSync | null = null;

    try {
      database = openDatabase(databasePath);
      const repository = new GameRepository(database);

      for (let index = 0; index < 130; index += 1) {
        repository.runIdempotentCommand(
          'dev:retention-player',
          `cmd:retention-${String(index).padStart(4, '0')}`,
          snapshot => ({ snapshot, events: [] }),
        );
      }

      const commandCount = database
        .prepare('SELECT COUNT(*) AS count FROM game_commands WHERE player_id = ?')
        .get('dev:retention-player') as { count: number };
      assert.equal(commandCount.count, 128);
      assert.equal(
        database.prepare(
          'SELECT 1 FROM game_commands WHERE player_id = ? AND command_id = ?',
        ).get('dev:retention-player', 'cmd:retention-0129') !== undefined,
        true,
      );
    } finally {
      database?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
