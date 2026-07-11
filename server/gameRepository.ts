import type { DatabaseSync } from 'node:sqlite';
import { createInitialGameSnapshot } from '../src/game/engine';
import { normalizeGameSnapshot, normalizeStoredGameEvents } from '../src/game/snapshot';
import { getCrossedProgressionMilestones } from '../src/game/progression';
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

export const parseStoredSnapshot = (snapshotJson: string): GameSnapshot => {
  const snapshot = normalizeGameSnapshot(JSON.parse(snapshotJson) as unknown);
  if (!snapshot) {
    throw new Error('Stored game snapshot is invalid');
  }

  return snapshot;
};

export class GameRepository {
  constructor(private readonly database: DatabaseSync) {}

  getOrCreatePlayer(playerId: string): PlayerState {
    const existing = this.database
      .prepare('SELECT id, created_at, updated_at, snapshot_json FROM players WHERE id = ?')
      .get(playerId) as PlayerRow | undefined;

    if (existing) {
      const snapshot = parseStoredSnapshot(existing.snapshot_json);
      const normalizedSnapshotJson = JSON.stringify(snapshot);
      if (normalizedSnapshotJson !== existing.snapshot_json) {
        this.database
          .prepare(`
            UPDATE players
            SET snapshot_json = ?, stage = ?, enemy_index = ?
            WHERE id = ?
          `)
          .run(normalizedSnapshotJson, snapshot.stage, snapshot.enemyIndex, existing.id);
      }

      return {
        playerId: existing.id,
        snapshot,
      };
    }

    const snapshot = createInitialGameSnapshot();
    const now = new Date().toISOString();

    this.database
      .prepare(`
        INSERT INTO players (
          id, created_at, updated_at, snapshot_json, stage, enemy_index, progress_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(playerId, now, now, JSON.stringify(snapshot), snapshot.stage, snapshot.enemyIndex, now);

    return { playerId, snapshot };
  }

  savePlayer(playerId: string, snapshot: GameSnapshot, previousStage?: number) {
    const now = new Date().toISOString();
    this.database
      .prepare(`
        UPDATE players
        SET updated_at = ?,
            snapshot_json = ?,
            progress_updated_at = CASE
              WHEN stage <> ? OR enemy_index <> ? THEN ?
              ELSE progress_updated_at
            END,
            stage = ?,
            enemy_index = ?
        WHERE id = ?
      `)
      .run(
        now,
        JSON.stringify(snapshot),
        snapshot.stage,
        snapshot.enemyIndex,
        now,
        snapshot.stage,
        snapshot.enemyIndex,
        playerId,
      );

    if (previousStage !== undefined) {
      const insertMilestone = this.database.prepare(`
        INSERT OR IGNORE INTO progression_milestones (player_id, stage, reached_at)
        VALUES (?, ?, ?)
      `);
      for (const stage of getCrossedProgressionMilestones(previousStage, snapshot.stage)) {
        insertMilestone.run(playerId, stage, now);
      }
    }

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
          events: normalizeStoredGameEvents(JSON.parse(existing.events_json) as unknown),
        };
        this.database.exec('COMMIT');
        return { replayed: true, result };
      }

      const playerState = this.getOrCreatePlayer(playerId);
      const actionResult = mutation(playerState.snapshot);
      const savedState = this.savePlayer(
        playerId,
        actionResult.snapshot,
        playerState.snapshot.stage,
      );
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
