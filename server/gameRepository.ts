import type { DatabaseSync } from 'node:sqlite';
import { createInitialGameSnapshot } from '../src/game/engine';
import type { GameActionResult, GameEvent, GameSnapshot } from '../src/game/types';

const COMMAND_RETENTION_PER_PLAYER = 128;

interface PlayerRow {
  id: string;
  created_at: string;
  updated_at: string;
  snapshot_json: string;
}

interface CommandRow {
  events_json: string;
}

export interface PlayerState {
  playerId: string;
  snapshot: GameSnapshot;
}

export interface GameCommandResult extends PlayerState {
  events: GameEvent[];
}

const parseSnapshot = (snapshotJson: string): GameSnapshot => {
  const snapshot = JSON.parse(snapshotJson) as GameSnapshot;
  const fallbackTimestamp = typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : new Date().toISOString();

  return {
    ...snapshot,
    comboCount: Number.isFinite(snapshot.comboCount) ? Math.max(0, Math.floor(snapshot.comboCount)) : 0,
    comboExpiresAt: typeof snapshot.comboExpiresAt === 'string' ? snapshot.comboExpiresAt : null,
    lastSeenAt: typeof snapshot.lastSeenAt === 'string' ? snapshot.lastSeenAt : fallbackTimestamp,
    updatedAt: fallbackTimestamp,
  };
};

export class GameRepository {
  constructor(private readonly database: DatabaseSync) {}

  getOrCreatePlayer(playerId: string): PlayerState {
    const existing = this.database
      .prepare('SELECT id, created_at, updated_at, snapshot_json FROM players WHERE id = ?')
      .get(playerId) as PlayerRow | undefined;

    if (existing) {
      return {
        playerId: existing.id,
        snapshot: parseSnapshot(existing.snapshot_json),
      };
    }

    const snapshot = createInitialGameSnapshot();
    const now = new Date().toISOString();

    this.database
      .prepare('INSERT INTO players (id, created_at, updated_at, snapshot_json) VALUES (?, ?, ?, ?)')
      .run(playerId, now, now, JSON.stringify(snapshot));

    return { playerId, snapshot };
  }

  savePlayer(playerId: string, snapshot: GameSnapshot) {
    this.database
      .prepare('UPDATE players SET updated_at = ?, snapshot_json = ? WHERE id = ?')
      .run(new Date().toISOString(), JSON.stringify(snapshot), playerId);

    return { playerId, snapshot };
  }

  runIdempotentCommand(
    playerId: string,
    commandId: string,
    mutation: (snapshot: GameSnapshot) => GameActionResult,
  ): { replayed: boolean; result: GameCommandResult } {
    this.database.exec('BEGIN IMMEDIATE');

    try {
      const existing = this.database
        .prepare('SELECT events_json FROM game_commands WHERE player_id = ? AND command_id = ?')
        .get(playerId, commandId) as CommandRow | undefined;

      if (existing) {
        const playerState = this.getOrCreatePlayer(playerId);
        const result: GameCommandResult = {
          ...playerState,
          events: JSON.parse(existing.events_json) as GameEvent[],
        };
        this.database.exec('COMMIT');
        return { replayed: true, result };
      }

      const playerState = this.getOrCreatePlayer(playerId);
      const actionResult = mutation(playerState.snapshot);
      const savedState = this.savePlayer(playerId, actionResult.snapshot);
      const result: GameCommandResult = {
        ...savedState,
        events: actionResult.events,
      };
      const now = new Date().toISOString();

      this.database
        .prepare('INSERT INTO game_commands (player_id, command_id, created_at, events_json) VALUES (?, ?, ?, ?)')
        .run(playerId, commandId, now, JSON.stringify(result.events));
      this.database
        .prepare(`
          DELETE FROM game_commands
          WHERE player_id = ?
            AND command_id NOT IN (
              SELECT command_id
              FROM game_commands
              WHERE player_id = ?
              ORDER BY id DESC
              LIMIT ?
            )
        `)
        .run(playerId, playerId, COMMAND_RETENTION_PER_PLAYER);

      this.database.exec('COMMIT');
      return { replayed: false, result };
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
