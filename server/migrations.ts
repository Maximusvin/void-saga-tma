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
  {
    version: 3,
    name: 'create_logical_realms',
    sql: `
      CREATE TABLE realms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('standard', 'consolidated')),
        status TEXT NOT NULL CHECK (status IN ('open', 'locked', 'merged')),
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        opened_at TEXT NOT NULL,
        locked_at TEXT,
        merged_at TEXT,
        merged_into_realm_id TEXT,
        soft_capacity INTEGER NOT NULL CHECK (soft_capacity > 0),
        hard_capacity INTEGER NOT NULL CHECK (hard_capacity >= soft_capacity),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (kind, sequence),
        FOREIGN KEY (merged_into_realm_id) REFERENCES realms(id)
      );

      CREATE UNIQUE INDEX realms_single_open_standard_idx
        ON realms(kind)
        WHERE kind = 'standard' AND status = 'open';

      INSERT INTO realms (
        id, code, kind, status, sequence, opened_at,
        soft_capacity, hard_capacity, created_at, updated_at
      ) VALUES (
        'realm:standard:1', 'S-1', 'standard', 'open', 1,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 5000, 10000,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );

      CREATE TABLE realm_characters (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        origin_realm_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_played_at TEXT NOT NULL,
        UNIQUE (account_id, origin_realm_id),
        FOREIGN KEY (id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (origin_realm_id) REFERENCES realms(id)
      );

      CREATE INDEX realm_characters_account_idx
        ON realm_characters(account_id, last_played_at DESC);
      CREATE INDEX realm_characters_origin_realm_idx
        ON realm_characters(origin_realm_id, id);

      INSERT INTO realm_characters (id, account_id, origin_realm_id, created_at, last_played_at)
      SELECT id, id, 'realm:standard:1', created_at, updated_at
      FROM players;

      CREATE TABLE account_realm_state (
        account_id TEXT PRIMARY KEY,
        active_character_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (active_character_id) REFERENCES realm_characters(id) ON DELETE CASCADE
      );

      INSERT INTO account_realm_state (account_id, active_character_id, created_at, updated_at)
      SELECT account_id, id, created_at, last_played_at
      FROM realm_characters;

      CREATE TABLE realm_policy (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        auto_launch_enabled INTEGER NOT NULL CHECK (auto_launch_enabled IN (0, 1)),
        auto_merge_enabled INTEGER NOT NULL CHECK (auto_merge_enabled IN (0, 1)),
        launch_interval_hours INTEGER NOT NULL CHECK (launch_interval_hours > 0),
        minimum_open_hours INTEGER NOT NULL CHECK (minimum_open_hours >= 0),
        soft_capacity INTEGER NOT NULL CHECK (soft_capacity > 0),
        hard_capacity INTEGER NOT NULL CHECK (hard_capacity >= soft_capacity),
        merge_batch_size INTEGER NOT NULL CHECK (merge_batch_size >= 2),
        updated_at TEXT NOT NULL
      );

      INSERT INTO realm_policy VALUES (
        1, 0, 0, 168, 24, 5000, 10000, 10,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      );

      CREATE TABLE realm_merge_sources (
        target_realm_id TEXT NOT NULL,
        source_realm_id TEXT NOT NULL UNIQUE,
        ordinal INTEGER NOT NULL,
        PRIMARY KEY (target_realm_id, source_realm_id),
        FOREIGN KEY (target_realm_id) REFERENCES realms(id),
        FOREIGN KEY (source_realm_id) REFERENCES realms(id)
      );

      CREATE TABLE realm_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        realm_id TEXT,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (realm_id) REFERENCES realms(id)
      );

      CREATE INDEX realm_operations_created_at_idx
        ON realm_operations(created_at DESC, id DESC);

      CREATE TABLE realm_entitlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id TEXT NOT NULL,
        realm_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        provider_event_id TEXT NOT NULL UNIQUE,
        grants_json TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        expires_at TEXT,
        UNIQUE (character_id, realm_id, sku),
        FOREIGN KEY (character_id) REFERENCES realm_characters(id) ON DELETE CASCADE,
        FOREIGN KEY (realm_id) REFERENCES realms(id)
      );
    `,
  },
  {
    version: 4,
    name: 'create_realm_leaderboards',
    sql: `
      ALTER TABLE players
        ADD COLUMN stage INTEGER NOT NULL DEFAULT 1 CHECK (stage >= 1);
      ALTER TABLE players
        ADD COLUMN enemy_index INTEGER NOT NULL DEFAULT 0 CHECK (enemy_index >= 0);
      ALTER TABLE players
        ADD COLUMN progress_updated_at TEXT NOT NULL DEFAULT '';

      UPDATE players
      SET stage = MAX(
            1,
            COALESCE(CAST(json_extract(snapshot_json, '$.stage') AS INTEGER), 1)
          ),
          enemy_index = MAX(
            0,
            COALESCE(CAST(json_extract(snapshot_json, '$.enemyIndex') AS INTEGER), 0)
          ),
          progress_updated_at = updated_at;

      CREATE INDEX players_progress_idx
        ON players(stage DESC, enemy_index DESC, progress_updated_at ASC, id ASC);

      CREATE TABLE account_profiles (
        account_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        photo_url TEXT,
        source TEXT NOT NULL CHECK (source IN ('local', 'telegram')),
        updated_at TEXT NOT NULL
      );
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
