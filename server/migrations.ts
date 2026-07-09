import type { DatabaseSync } from 'node:sqlite';

interface Migration {
  name: string;
  sql: string;
  version: number;
}

export const GAME_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'create_players',
    sql: `
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        snapshot_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'create_game_commands',
    sql: `
      CREATE TABLE IF NOT EXISTS game_commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        events_json TEXT NOT NULL,
        UNIQUE (player_id, command_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS game_commands_player_id_idx
        ON game_commands(player_id, id DESC);
    `,
  },
];

export const applyGameMigrations = (database: DatabaseSync) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedVersions = new Set(
    (database.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>)
      .map(row => row.version),
  );
  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  for (const migration of GAME_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    database.exec('BEGIN IMMEDIATE');
    try {
      database.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
};
