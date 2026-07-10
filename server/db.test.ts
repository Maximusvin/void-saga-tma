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
      for (const table of [
        'realms',
        'realm_characters',
        'account_realm_state',
        'realm_policy',
        'realm_merge_sources',
        'realm_operations',
        'realm_entitlements',
        'account_profiles',
      ]) {
        assert.ok(database.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        ).get(table));
      }
      const playerColumns = database.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
      assert.deepEqual(
        ['stage', 'enemy_index', 'progress_updated_at'].every(column => (
          playerColumns.some(({ name }) => name === column)
        )),
        true,
      );
      assert.ok(database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'players_progress_idx'",
      ).get());
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
    let migrated: DatabaseSync | null = null;

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

      migrated = openDatabase(databasePath);
      const player = migrated.prepare('SELECT id FROM players WHERE id = ?').get('legacy-player') as { id: string };
      assert.equal(player.id, 'legacy-player');
      const character = migrated.prepare(`
        SELECT id, account_id, origin_realm_id
        FROM realm_characters
        WHERE id = ?
      `).get('legacy-player') as { account_id: string; id: string; origin_realm_id: string };
      assert.equal(character.account_id, 'legacy-player');
      assert.equal(character.id, 'legacy-player');
      assert.equal(character.origin_realm_id, 'realm:standard:1');
      assert.equal(
        (migrated.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get() as { count: number }).count,
        GAME_MIGRATIONS.length,
      );
      migrated.close();
      migrated = null;
    } finally {
      migrated?.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
