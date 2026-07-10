import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { openDatabase } from './db';
import { RealmDomainError, RealmRepository } from './realmRepository';

const withRepository = (run: (repository: RealmRepository, database: DatabaseSync) => void) => {
  const tempDir = mkdtempSync(join(tmpdir(), 'void-saga-realms-'));
  const database = openDatabase(join(tempDir, 'game.sqlite'));
  try {
    run(new RealmRepository(database), database);
  } finally {
    database.close();
    rmSync(tempDir, { recursive: true, force: true });
  }
};

describe('logical realm repository', () => {
  it('enforces a single open standard realm at the database boundary', () => {
    withRepository((_realms, database) => {
      assert.throws(() => database.prepare(`
        INSERT INTO realms (
          id, code, kind, status, sequence, opened_at, soft_capacity, hard_capacity,
          created_at, updated_at
        ) VALUES (?, ?, 'standard', 'open', ?, ?, ?, ?, ?, ?)
      `).run(
        'realm:standard:99',
        'S-99',
        99,
        '2026-07-10T00:00:00.000Z',
        5000,
        10000,
        '2026-07-10T00:00:00.000Z',
        '2026-07-10T00:00:00.000Z',
      ));
    });
  });

  it('creates one isolated character per account and origin realm', () => {
    withRepository((realms, database) => {
      const accountId = 'telegram:realm-player';
      const s1 = realms.resolveActiveCharacter(accountId);
      const s2 = realms.createRealm('test', 'manual', '2026-07-10T10:00:00.000Z');
      const secondCharacter = realms.joinRealm(accountId, s2.id, '2026-07-10T10:01:00.000Z');
      const repeatedJoin = realms.joinRealm(accountId, s2.id, '2026-07-10T10:02:00.000Z');

      assert.equal(s1.originRealmCode, 'S-1');
      assert.equal(secondCharacter.originRealmCode, 'S-2');
      assert.notEqual(secondCharacter.characterId, s1.characterId);
      assert.equal(repeatedJoin.characterId, secondCharacter.characterId);
      assert.equal(
        (database.prepare('SELECT COUNT(*) AS count FROM players').get() as { count: number }).count,
        2,
      );
      assert.equal(realms.getDirectory(accountId).activeCharacterId, secondCharacter.characterId);
      assert.throws(
        () => realms.selectCharacter('telegram:another-player', secondCharacter.characterId),
        (error: unknown) => error instanceof RealmDomainError && error.code === 'character_not_owned',
      );
    });
  });

  it('enforces hard capacity while keeping an existing membership idempotent', () => {
    withRepository(realms => {
      realms.updatePolicy({ hardCapacity: 1, softCapacity: 1 });
      realms.resolveActiveCharacter('telegram:first');

      assert.throws(
        () => realms.resolveActiveCharacter('telegram:second'),
        (error: unknown) => error instanceof RealmDomainError && error.code === 'realm_full',
      );
      assert.equal(realms.resolveActiveCharacter('telegram:first').originRealmCode, 'S-1');
    });
  });

  it('launches at most one realm per reconcile evaluation', () => {
    withRepository((realms, database) => {
      database.prepare(
        "UPDATE realms SET opened_at = '2026-07-01T00:00:00.000Z' WHERE code = 'S-1'",
      ).run();
      realms.updatePolicy({
        autoLaunchEnabled: true,
        launchIntervalHours: 24,
        minimumOpenHours: 0,
      });

      const first = realms.reconcile('scheduler', '2026-07-03T00:00:00.000Z');
      const repeated = realms.reconcile('scheduler', '2026-07-03T00:00:00.000Z');

      assert.equal(first.launchReason, 'interval');
      assert.equal(first.launchedRealm?.code, 'S-2');
      assert.equal(repeated.launchReason, null);
      assert.equal(repeated.launchedRealm, null);
      assert.equal(realms.listAdminRealms().filter(realm => realm.status === 'open').length, 1);
    });
  });

  it('launches on soft capacity after the configured minimum age', () => {
    withRepository((realms, database) => {
      realms.updatePolicy({
        autoLaunchEnabled: true,
        launchIntervalHours: 999,
        minimumOpenHours: 2,
        softCapacity: 1,
        hardCapacity: 2,
      });
      database.prepare(
        "UPDATE realms SET opened_at = '2026-07-10T00:00:00.000Z', soft_capacity = 1, hard_capacity = 2 WHERE code = 'S-1'",
      ).run();
      realms.resolveActiveCharacter('telegram:capacity-player');

      assert.equal(realms.reconcile('scheduler', '2026-07-10T01:00:00.000Z').launchReason, null);
      const launched = realms.reconcile('scheduler', '2026-07-10T02:00:00.000Z');
      assert.equal(launched.launchReason, 'soft_capacity');
      assert.equal(launched.launchedRealm?.code, 'S-2');
    });
  });

  it('merges contiguous locked realms without collapsing account characters', () => {
    withRepository(realms => {
      realms.updatePolicy({ mergeBatchSize: 3 });
      const accountId = 'telegram:multi-realm';
      const s1Character = realms.resolveActiveCharacter(accountId);
      const s2 = realms.createRealm('test', 'manual', '2026-07-10T01:00:00.000Z');
      const s2Character = realms.joinRealm(accountId, s2.id, '2026-07-10T01:01:00.000Z');
      const s3 = realms.createRealm('test', 'manual', '2026-07-10T02:00:00.000Z');
      realms.joinRealm('telegram:third-realm-only', s3.id, '2026-07-10T02:01:00.000Z');
      realms.createRealm('test', 'manual', '2026-07-10T03:00:00.000Z');

      const merged = realms.mergeNext('test', '2026-07-10T04:00:00.000Z');
      const firstContext = realms.getOwnedCharacter(accountId, s1Character.characterId);
      const secondContext = realms.getOwnedCharacter(accountId, s2Character.characterId);

      assert.equal(merged?.code, 'M-1');
      assert.equal(firstContext.canonicalRealmCode, 'M-1');
      assert.equal(secondContext.canonicalRealmCode, 'M-1');
      assert.notEqual(firstContext.characterId, secondContext.characterId);
      assert.equal(realms.listAdminRealms().filter(realm => realm.status === 'merged').length, 3);
      assert.equal(realms.listAdminRealms().find(realm => realm.code === 'S-4')?.status, 'open');
    });
  });

  it('keeps realm launch entitlements idempotent by payment event and pack', () => {
    withRepository((realms, database) => {
      const character = realms.resolveActiveCharacter('telegram:buyer');
      const insert = database.prepare(`
        INSERT INTO realm_entitlements (
          character_id, realm_id, sku, provider_event_id, grants_json, granted_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      insert.run(
        character.characterId,
        character.originRealmId,
        'founder_pack_1',
        'payment:event:1',
        '{"gems":100}',
        '2026-07-10T00:00:00.000Z',
      );

      assert.throws(() => insert.run(
        character.characterId,
        character.originRealmId,
        'founder_pack_1',
        'payment:event:2',
        '{"gems":100}',
        '2026-07-10T00:01:00.000Z',
      ));
      assert.throws(() => insert.run(
        character.characterId,
        character.originRealmId,
        'founder_pack_2',
        'payment:event:1',
        '{"gems":200}',
        '2026-07-10T00:02:00.000Z',
      ));
    });
  });
});
