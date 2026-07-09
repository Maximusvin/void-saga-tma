import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { applyGameAction } from '../src/game/engine';
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
      const killResult = applyGameAction(initialState.snapshot, {
        type: 'deal_damage',
        amount: initialState.snapshot.monsterMaxHealth,
        source: 'tap',
      });

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
});
