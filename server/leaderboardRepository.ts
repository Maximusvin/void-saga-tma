import type { DatabaseSync } from 'node:sqlite';
import { getPassivePower } from '../src/game/balance';
import { getActiveWarbandHeroes } from '../src/game/warband';
import {
  getLeagueDivision,
  type RealmLeaderboard,
  type RealmLeaderboardEntry,
} from '../src/shared/leaderboard';
import type { PlayerProfile } from '../src/shared/playerProfile';
import { parseStoredSnapshot } from './gameRepository';

const LEADERBOARD_LIMIT = 50;

interface LeaderboardRow {
  display_name: string | null;
  enemy_index: number;
  id: string;
  photo_url: string | null;
  progress_updated_at: string;
  snapshot_json: string;
  stage: number;
}

const REALM_SCOPE_CTE = `
  WITH RECURSIVE realm_scope(id) AS (
    SELECT id FROM realms WHERE id = ?
    UNION ALL
    SELECT realms.id
    FROM realms
    JOIN realm_scope ON realms.merged_into_realm_id = realm_scope.id
  )
`;

export class LeaderboardRepository {
  constructor(private readonly database: DatabaseSync) {}

  upsertProfile(accountId: string, profile: PlayerProfile, now = new Date().toISOString()) {
    this.database.prepare(`
      INSERT INTO account_profiles (account_id, display_name, photo_url, source, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        display_name = excluded.display_name,
        photo_url = excluded.photo_url,
        source = excluded.source,
        updated_at = excluded.updated_at
      WHERE account_profiles.display_name IS NOT excluded.display_name
         OR account_profiles.photo_url IS NOT excluded.photo_url
         OR account_profiles.source IS NOT excluded.source
    `).run(accountId, profile.displayName, profile.photoUrl, profile.source, now);
  }

  private getRealmCode(canonicalRealmId: string) {
    const realm = this.database.prepare(
      'SELECT code FROM realms WHERE id = ?',
    ).get(canonicalRealmId) as { code: string } | undefined;
    if (!realm) {
      throw new Error('Leaderboard realm not found: ' + canonicalRealmId);
    }
    return realm.code;
  }

  private getRows(canonicalRealmId: string) {
    return this.database.prepare(`
      ${REALM_SCOPE_CTE}
      SELECT players.id, players.stage,
             players.enemy_index, players.progress_updated_at,
             players.snapshot_json, account_profiles.display_name,
             account_profiles.photo_url
      FROM players
      JOIN realm_characters ON realm_characters.id = players.id
      JOIN realm_scope ON realm_scope.id = realm_characters.origin_realm_id
      LEFT JOIN account_profiles
        ON account_profiles.account_id = realm_characters.account_id
      ORDER BY players.stage DESC, players.enemy_index DESC,
               players.progress_updated_at ASC, players.id ASC
      LIMIT ?
    `).all(canonicalRealmId, LEADERBOARD_LIMIT) as unknown as LeaderboardRow[];
  }

  private getCurrentRow(canonicalRealmId: string, characterId: string) {
    return this.database.prepare(`
      ${REALM_SCOPE_CTE}
      SELECT players.id, players.stage,
             players.enemy_index, players.progress_updated_at,
             players.snapshot_json, account_profiles.display_name,
             account_profiles.photo_url
      FROM players
      JOIN realm_characters ON realm_characters.id = players.id
      JOIN realm_scope ON realm_scope.id = realm_characters.origin_realm_id
      LEFT JOIN account_profiles
        ON account_profiles.account_id = realm_characters.account_id
      WHERE players.id = ?
    `).get(canonicalRealmId, characterId) as LeaderboardRow | undefined;
  }

  private getTotalPlayers(canonicalRealmId: string) {
    const row = this.database.prepare(`
      ${REALM_SCOPE_CTE}
      SELECT COUNT(*) AS count
      FROM realm_characters
      JOIN realm_scope ON realm_scope.id = realm_characters.origin_realm_id
    `).get(canonicalRealmId) as { count: number };
    return row.count;
  }

  private getRank(canonicalRealmId: string, current: LeaderboardRow) {
    const row = this.database.prepare(`
      ${REALM_SCOPE_CTE}
      SELECT COUNT(*) + 1 AS rank
      FROM players
      JOIN realm_characters ON realm_characters.id = players.id
      JOIN realm_scope ON realm_scope.id = realm_characters.origin_realm_id
      WHERE players.stage > ?
         OR (players.stage = ? AND players.enemy_index > ?)
         OR (
           players.stage = ? AND players.enemy_index = ?
           AND players.progress_updated_at < ?
         )
         OR (
           players.stage = ? AND players.enemy_index = ?
           AND players.progress_updated_at = ? AND players.id < ?
         )
    `).get(
      canonicalRealmId,
      current.stage,
      current.stage,
      current.enemy_index,
      current.stage,
      current.enemy_index,
      current.progress_updated_at,
      current.stage,
      current.enemy_index,
      current.progress_updated_at,
      current.id,
    ) as { rank: number };
    return row.rank;
  }

  private toEntry(row: LeaderboardRow, rank: number, currentCharacterId: string): RealmLeaderboardEntry {
    const snapshot = parseStoredSnapshot(row.snapshot_json);
    return {
      displayName: row.display_name ?? 'Riftwalker',
      division: getLeagueDivision(row.stage),
      enemyIndex: row.enemy_index,
      isCurrentPlayer: row.id === currentCharacterId,
      passivePower: getPassivePower(getActiveWarbandHeroes(snapshot)),
      photoUrl: row.photo_url,
      rank,
      stage: row.stage,
    };
  }

  getRealmLeaderboard(
    canonicalRealmId: string,
    currentCharacterId: string,
    now = new Date().toISOString(),
  ): RealmLeaderboard {
    const current = this.getCurrentRow(canonicalRealmId, currentCharacterId);
    if (!current) {
      throw new Error('Current character is outside the requested leaderboard realm');
    }
    const topRows = this.getRows(canonicalRealmId);
    const currentRank = this.getRank(canonicalRealmId, current);

    return {
      currentPlayer: this.toEntry(current, currentRank, currentCharacterId),
      generatedAt: now,
      realmCode: this.getRealmCode(canonicalRealmId),
      top: topRows.map((row, index) => this.toEntry(row, index + 1, currentCharacterId)),
      totalPlayers: this.getTotalPlayers(canonicalRealmId),
    };
  }
}
