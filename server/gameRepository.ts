import type { DatabaseSync } from 'node:sqlite';
import { createInitialGameSnapshot } from '../src/game/engine';
import type { GameSnapshot } from '../src/game/types';

interface PlayerRow {
  id: string;
  created_at: string;
  updated_at: string;
  snapshot_json: string;
}

export interface PlayerState {
  playerId: string;
  snapshot: GameSnapshot;
}

const parseSnapshot = (snapshotJson: string): GameSnapshot => {
  const snapshot = JSON.parse(snapshotJson) as GameSnapshot;
  const fallbackTimestamp = typeof snapshot.updatedAt === 'string' ? snapshot.updatedAt : new Date().toISOString();

  return {
    ...snapshot,
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
}
