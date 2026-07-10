import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { createInitialGameSnapshot } from '../src/game/engine';
import type { RealmContext, RealmDirectory, RealmKind, RealmStatus, RealmSummary } from '../src/shared/realm';

export type RealmErrorCode =
  | 'character_not_found'
  | 'character_not_owned'
  | 'realm_full'
  | 'realm_not_found'
  | 'realm_not_open';

export class RealmDomainError extends Error {
  constructor(readonly code: RealmErrorCode) {
    super(code);
  }
}

interface RealmRow {
  code: string;
  hard_capacity: number;
  id: string;
  kind: RealmKind;
  merged_into_realm_id: string | null;
  opened_at: string;
  sequence: number;
  soft_capacity: number;
  status: RealmStatus;
}

interface CharacterRow {
  account_id: string;
  id: string;
  origin_realm_id: string;
}

interface RealmPolicyRow {
  auto_launch_enabled: number;
  auto_merge_enabled: number;
  hard_capacity: number;
  launch_interval_hours: number;
  merge_batch_size: number;
  minimum_open_hours: number;
  soft_capacity: number;
}

export interface RealmPolicy {
  autoLaunchEnabled: boolean;
  autoMergeEnabled: boolean;
  hardCapacity: number;
  launchIntervalHours: number;
  mergeBatchSize: number;
  minimumOpenHours: number;
  softCapacity: number;
}

export interface RealmPolicyPatch {
  autoLaunchEnabled?: boolean;
  autoMergeEnabled?: boolean;
  hardCapacity?: number;
  launchIntervalHours?: number;
  mergeBatchSize?: number;
  minimumOpenHours?: number;
  softCapacity?: number;
}

export interface ReconcileResult {
  launchReason: 'hard_capacity' | 'interval' | 'soft_capacity' | null;
  launchedRealm: RealmSummary | null;
  mergedRealm: RealmSummary | null;
}

const parseTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid realm timestamp: ${value}`);
  }

  return timestamp;
};

const assertPositiveInteger = (value: number, field: string, minimum = 1) => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer >= ${minimum}`);
  }
};

export class RealmRepository {
  constructor(private readonly database: DatabaseSync) {}

  private transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  private getRealmRow(realmId: string) {
    return this.database.prepare(`
      SELECT id, code, kind, status, sequence, opened_at, merged_into_realm_id,
             soft_capacity, hard_capacity
      FROM realms
      WHERE id = ?
    `).get(realmId) as RealmRow | undefined;
  }

  private resolveCanonicalRealm(originRealm: RealmRow) {
    let current = originRealm;
    const visited = new Set<string>();

    while (current.merged_into_realm_id) {
      if (visited.has(current.id) || visited.size >= 32) {
        throw new Error('Realm merge chain is cyclic or too deep');
      }
      visited.add(current.id);
      const next = this.getRealmRow(current.merged_into_realm_id);
      if (!next) {
        throw new Error(`Missing canonical realm: ${current.merged_into_realm_id}`);
      }
      current = next;
    }

    return current;
  }

  private getCharacterRow(characterId: string) {
    return this.database.prepare(`
      SELECT id, account_id, origin_realm_id
      FROM realm_characters
      WHERE id = ?
    `).get(characterId) as CharacterRow | undefined;
  }

  private toContext(character: CharacterRow): RealmContext {
    const originRealm = this.getRealmRow(character.origin_realm_id);
    if (!originRealm) {
      throw new Error(`Missing origin realm: ${character.origin_realm_id}`);
    }
    const canonicalRealm = this.resolveCanonicalRealm(originRealm);

    return {
      canonicalRealmCode: canonicalRealm.code,
      canonicalRealmId: canonicalRealm.id,
      characterId: character.id,
      originRealmCode: originRealm.code,
      originRealmId: originRealm.id,
    };
  }

  private setActiveCharacter(accountId: string, characterId: string, now: string) {
    this.database.prepare(`
      INSERT INTO account_realm_state (account_id, active_character_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        active_character_id = excluded.active_character_id,
        updated_at = excluded.updated_at
    `).run(accountId, characterId, now, now);
    this.database.prepare(
      'UPDATE realm_characters SET last_played_at = ? WHERE id = ?',
    ).run(now, characterId);
  }

  getPolicy(): RealmPolicy {
    const row = this.database.prepare(`
      SELECT auto_launch_enabled, auto_merge_enabled, launch_interval_hours,
             minimum_open_hours, soft_capacity, hard_capacity, merge_batch_size
      FROM realm_policy
      WHERE id = 1
    `).get() as unknown as RealmPolicyRow;

    return {
      autoLaunchEnabled: row.auto_launch_enabled === 1,
      autoMergeEnabled: row.auto_merge_enabled === 1,
      hardCapacity: row.hard_capacity,
      launchIntervalHours: row.launch_interval_hours,
      mergeBatchSize: row.merge_batch_size,
      minimumOpenHours: row.minimum_open_hours,
      softCapacity: row.soft_capacity,
    };
  }

  updatePolicy(patch: RealmPolicyPatch, now = new Date().toISOString(), actor = 'manual_cli') {
    const current = this.getPolicy();
    const next: RealmPolicy = { ...current, ...patch };
    assertPositiveInteger(next.launchIntervalHours, 'launchIntervalHours');
    assertPositiveInteger(next.minimumOpenHours, 'minimumOpenHours', 0);
    assertPositiveInteger(next.softCapacity, 'softCapacity');
    assertPositiveInteger(next.hardCapacity, 'hardCapacity');
    assertPositiveInteger(next.mergeBatchSize, 'mergeBatchSize', 2);
    if (next.hardCapacity < next.softCapacity) {
      throw new Error('hardCapacity must be >= softCapacity');
    }

    this.transaction(() => {
      this.database.prepare(`
        UPDATE realm_policy
        SET auto_launch_enabled = ?, auto_merge_enabled = ?, launch_interval_hours = ?,
            minimum_open_hours = ?, soft_capacity = ?, hard_capacity = ?,
            merge_batch_size = ?, updated_at = ?
        WHERE id = 1
      `).run(
        Number(next.autoLaunchEnabled),
        Number(next.autoMergeEnabled),
        next.launchIntervalHours,
        next.minimumOpenHours,
        next.softCapacity,
        next.hardCapacity,
        next.mergeBatchSize,
        now,
      );
      this.database.prepare(`
        UPDATE realms
        SET soft_capacity = ?, hard_capacity = ?, updated_at = ?
        WHERE kind = 'standard' AND status = 'open'
      `).run(next.softCapacity, next.hardCapacity, now);
      this.insertOperation('realm_policy_updated', actor, null, next, now);
    });

    return next;
  }

  private getPopulation(realmId: string) {
    const row = this.database.prepare(
      'SELECT COUNT(*) AS count FROM realm_characters WHERE origin_realm_id = ?',
    ).get(realmId) as { count: number };
    return row.count;
  }

  private toSummary(realm: RealmRow, accountId: string | null, recommendedRealmId: string | null): RealmSummary {
    const canonicalRealm = this.resolveCanonicalRealm(realm);
    const character = accountId
      ? this.database.prepare(`
          SELECT id FROM realm_characters
          WHERE account_id = ? AND origin_realm_id = ?
        `).get(accountId, realm.id) as { id: string } | undefined
      : undefined;

    return {
      canonicalRealmCode: canonicalRealm.code,
      canonicalRealmId: canonicalRealm.id,
      characterId: character?.id ?? null,
      code: realm.code,
      hardCapacity: realm.hard_capacity,
      id: realm.id,
      isRecommended: realm.id === recommendedRealmId,
      kind: realm.kind,
      openedAt: realm.opened_at,
      population: this.getPopulation(realm.id),
      softCapacity: realm.soft_capacity,
      status: realm.status,
    };
  }

  getDirectory(accountId: string): RealmDirectory {
    const realms = this.database.prepare(`
      SELECT id, code, kind, status, sequence, opened_at, merged_into_realm_id,
             soft_capacity, hard_capacity
      FROM realms
      ORDER BY kind ASC, sequence DESC
    `).all() as unknown as RealmRow[];
    const recommendedRealmId = realms.find(realm => realm.kind === 'standard' && realm.status === 'open')?.id ?? null;
    const accountState = this.database.prepare(
      'SELECT active_character_id FROM account_realm_state WHERE account_id = ?',
    ).get(accountId) as { active_character_id: string } | undefined;

    return {
      activeCharacterId: accountState?.active_character_id ?? null,
      realms: realms.map(realm => this.toSummary(realm, accountId, recommendedRealmId)),
      recommendedRealmId,
    };
  }

  getOwnedCharacter(accountId: string, characterId: string) {
    const character = this.getCharacterRow(characterId);
    if (!character) {
      throw new RealmDomainError('character_not_found');
    }
    if (character.account_id !== accountId) {
      throw new RealmDomainError('character_not_owned');
    }

    return this.toContext(character);
  }

  selectCharacter(accountId: string, characterId: string, now = new Date().toISOString()) {
    return this.transaction(() => {
      const context = this.getOwnedCharacter(accountId, characterId);
      this.setActiveCharacter(accountId, characterId, now);
      return context;
    });
  }

  joinRealm(accountId: string, realmId: string, now = new Date().toISOString()) {
    return this.transaction(() => {
      const existing = this.database.prepare(`
        SELECT id, account_id, origin_realm_id
        FROM realm_characters
        WHERE account_id = ? AND origin_realm_id = ?
      `).get(accountId, realmId) as CharacterRow | undefined;
      if (existing) {
        this.setActiveCharacter(accountId, existing.id, now);
        return this.toContext(existing);
      }

      const realm = this.getRealmRow(realmId);
      if (!realm) {
        throw new RealmDomainError('realm_not_found');
      }
      if (realm.kind !== 'standard' || realm.status !== 'open') {
        throw new RealmDomainError('realm_not_open');
      }
      if (this.getPopulation(realm.id) >= realm.hard_capacity) {
        throw new RealmDomainError('realm_full');
      }

      const characterId = `character:${randomUUID()}`;
      const initialSnapshot = createInitialGameSnapshot();
      this.database.prepare(`
        INSERT INTO players (
          id, created_at, updated_at, snapshot_json, stage, enemy_index, progress_updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        characterId,
        now,
        now,
        JSON.stringify(initialSnapshot),
        initialSnapshot.stage,
        initialSnapshot.enemyIndex,
        now,
      );
      this.database.prepare(`
        INSERT INTO realm_characters (id, account_id, origin_realm_id, created_at, last_played_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(characterId, accountId, realm.id, now, now);
      this.setActiveCharacter(accountId, characterId, now);

      return this.toContext({ account_id: accountId, id: characterId, origin_realm_id: realm.id });
    });
  }

  resolveActiveCharacter(accountId: string) {
    const accountState = this.database.prepare(
      'SELECT active_character_id FROM account_realm_state WHERE account_id = ?',
    ).get(accountId) as { active_character_id: string } | undefined;
    if (accountState) {
      return this.getOwnedCharacter(accountId, accountState.active_character_id);
    }

    const recommendedRealm = this.database.prepare(`
      SELECT id FROM realms
      WHERE kind = 'standard' AND status = 'open'
      ORDER BY sequence DESC
      LIMIT 1
    `).get() as { id: string } | undefined;
    if (!recommendedRealm) {
      throw new RealmDomainError('realm_not_open');
    }

    return this.joinRealm(accountId, recommendedRealm.id);
  }

  private insertOperation(operationType: string, actor: string, realmId: string | null, payload: unknown, now: string) {
    this.database.prepare(`
      INSERT INTO realm_operations (operation_type, actor, realm_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(operationType, actor, realmId, JSON.stringify(payload), now);
  }

  private createRealmWithinTransaction(actor: string, reason: string, now: string) {
    const policy = this.getPolicy();
    this.database.prepare(`
      UPDATE realms
      SET status = 'locked', locked_at = ?, updated_at = ?
      WHERE kind = 'standard' AND status = 'open'
    `).run(now, now);
    const sequenceRow = this.database.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM realms
      WHERE kind = 'standard'
    `).get() as { sequence: number };
    const sequence = sequenceRow.sequence;
    const realmId = `realm:standard:${sequence}`;
    const code = `S-${sequence}`;
    this.database.prepare(`
      INSERT INTO realms (
        id, code, kind, status, sequence, opened_at, soft_capacity, hard_capacity,
        created_at, updated_at
      ) VALUES (?, ?, 'standard', 'open', ?, ?, ?, ?, ?, ?)
    `).run(realmId, code, sequence, now, policy.softCapacity, policy.hardCapacity, now, now);
    this.insertOperation('realm_created', actor, realmId, { reason }, now);

    const realm = this.getRealmRow(realmId);
    if (!realm) {
      throw new Error('Created realm cannot be read');
    }
    return this.toSummary(realm, null, realmId);
  }

  createRealm(actor: string, reason = 'manual', now = new Date().toISOString()) {
    return this.transaction(() => this.createRealmWithinTransaction(actor, reason, now));
  }

  private mergeNextWithinTransaction(actor: string, now: string) {
    const policy = this.getPolicy();
    const sources = this.database.prepare(`
      SELECT id, code, kind, status, sequence, opened_at, merged_into_realm_id,
             soft_capacity, hard_capacity
      FROM realms
      WHERE kind = 'standard' AND status = 'locked' AND merged_into_realm_id IS NULL
      ORDER BY sequence ASC
      LIMIT ?
    `).all(policy.mergeBatchSize) as unknown as RealmRow[];
    if (sources.length < policy.mergeBatchSize) {
      return null;
    }
    for (let index = 1; index < sources.length; index += 1) {
      if (sources[index]!.sequence !== sources[index - 1]!.sequence + 1) {
        return null;
      }
    }

    const sequenceRow = this.database.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM realms
      WHERE kind = 'consolidated'
    `).get() as { sequence: number };
    const sequence = sequenceRow.sequence;
    const realmId = `realm:consolidated:${sequence}`;
    const code = `M-${sequence}`;
    const softCapacity = sources.reduce((sum, source) => sum + source.soft_capacity, 0);
    const hardCapacity = sources.reduce((sum, source) => sum + source.hard_capacity, 0);
    this.database.prepare(`
      INSERT INTO realms (
        id, code, kind, status, sequence, opened_at, locked_at,
        soft_capacity, hard_capacity, created_at, updated_at
      ) VALUES (?, ?, 'consolidated', 'locked', ?, ?, ?, ?, ?, ?, ?)
    `).run(realmId, code, sequence, now, now, softCapacity, hardCapacity, now, now);

    const updateSource = this.database.prepare(`
      UPDATE realms
      SET status = 'merged', merged_at = ?, merged_into_realm_id = ?, updated_at = ?
      WHERE id = ? AND status = 'locked' AND merged_into_realm_id IS NULL
    `);
    const insertSource = this.database.prepare(`
      INSERT INTO realm_merge_sources (target_realm_id, source_realm_id, ordinal)
      VALUES (?, ?, ?)
    `);
    sources.forEach((source, index) => {
      const updated = updateSource.run(now, realmId, now, source.id);
      if (updated.changes !== 1) {
        throw new Error(`Realm merge race for ${source.id}`);
      }
      insertSource.run(realmId, source.id, index + 1);
    });
    this.insertOperation('realms_merged', actor, realmId, {
      sourceRealmIds: sources.map(source => source.id),
    }, now);

    const target = this.getRealmRow(realmId);
    if (!target) {
      throw new Error('Merged realm cannot be read');
    }
    return this.toSummary(target, null, null);
  }

  mergeNext(actor: string, now = new Date().toISOString()) {
    return this.transaction(() => this.mergeNextWithinTransaction(actor, now));
  }

  reconcile(actor = 'scheduler', now = new Date().toISOString()): ReconcileResult {
    return this.transaction(() => {
      const policy = this.getPolicy();
      const openRealm = this.database.prepare(`
        SELECT id, code, kind, status, sequence, opened_at, merged_into_realm_id,
               soft_capacity, hard_capacity
        FROM realms
        WHERE kind = 'standard' AND status = 'open'
        ORDER BY sequence DESC
        LIMIT 1
      `).get() as RealmRow | undefined;
      let launchReason: ReconcileResult['launchReason'] = null;

      if (policy.autoLaunchEnabled && openRealm) {
        const population = this.getPopulation(openRealm.id);
        const ageHours = (parseTimestamp(now) - parseTimestamp(openRealm.opened_at)) / 3_600_000;
        if (population >= openRealm.hard_capacity) {
          launchReason = 'hard_capacity';
        } else if (population >= openRealm.soft_capacity && ageHours >= policy.minimumOpenHours) {
          launchReason = 'soft_capacity';
        } else if (ageHours >= policy.launchIntervalHours) {
          launchReason = 'interval';
        }
      } else if (policy.autoLaunchEnabled && !openRealm) {
        launchReason = 'interval';
      }

      const launchedRealm = launchReason
        ? this.createRealmWithinTransaction(actor, launchReason, now)
        : null;
      const mergedRealm = policy.autoMergeEnabled
        ? this.mergeNextWithinTransaction(actor, now)
        : null;

      return { launchReason, launchedRealm, mergedRealm };
    });
  }

  listAdminRealms() {
    return this.getDirectory('__admin__').realms;
  }
}
