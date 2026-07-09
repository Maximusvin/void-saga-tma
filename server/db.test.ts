import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { openDatabase } from './db';
import { GAME_MIGRATIONS } from './migrations';

describe('game database migrations', () => {
  it('applies every migration once on a fresh database', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-migrations-'));
    const databasePath = join(tempDir, 'game.sqlite');
    let database: DatabaseSync | null = null;
    let reopened: DatabaseSync | null = null;

    try {
      database = openDatabase(databasePath);
      const applied = database
        .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
        .all() as Array<{ version: number; name: string }>;

      assert.deepEqual(
        applied.map(({ version, name }) => ({ version, name })),
        GAME_MIGRATIONS.map(({ version, name }) => ({ version, name })),
      );
      assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'players'").get());
      assert.ok(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_commands'").get());
      database.close();
      database = null;

      reopened = openDatabase(databasePath);
      const migrationCount = reopened.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number };
      assert.equal(migrationCount.count, GAME_MIGRATIONS.length);
      reopened.close();
      reopened = null;
    } finally {
      database?.close();
      reopened?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('adopts a legacy players table without losing data', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-legacy-db-'));
    const databasePath = join(tempDir, 'game.sqlite');

    try {
      const legacyDatabase = new DatabaseSync(databasePath);
      legacyDatabase.exec(`
        CREATE TABLE players (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          snapshot_json TEXT NOT NULL
        );
        INSERT INTO players VALUES ('legacy-player', 'created', 'updated', '{}');
      `);
      legacyDatabase.close();

      const migrated = openDatabase(databasePath);
      const player = migrated.prepare('SELECT id FROM players WHERE id = ?').get('legacy-player') as { id: string };
      assert.equal(player.id, 'legacy-player');
      assert.equal(
        (migrated.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }).count,
        GAME_MIGRATIONS.length,
      );
      migrated.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
