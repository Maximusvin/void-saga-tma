import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeRealmContext, normalizeRealmDirectory } from './realm';

describe('realm API contract', () => {
  it('accepts a bounded realm directory and rejects malformed ownership data', () => {
    const realm = {
      canonicalRealmCode: 'S-1',
      canonicalRealmId: 'realm:standard:1',
      characterId: 'character:test-0001',
      originRealmCode: 'S-1',
      originRealmId: 'realm:standard:1',
    };
    assert.deepEqual(normalizeRealmContext(realm), realm);
    assert.equal(normalizeRealmContext({ ...realm, characterId: '' }), null);

    const directory = {
      activeCharacterId: realm.characterId,
      recommendedRealmId: realm.originRealmId,
      realms: [{
        canonicalRealmCode: realm.canonicalRealmCode,
        canonicalRealmId: realm.canonicalRealmId,
        characterId: realm.characterId,
        code: 'S-1',
        hardCapacity: 10000,
        id: realm.originRealmId,
        isRecommended: true,
        kind: 'standard',
        openedAt: '2026-07-10T00:00:00.000Z',
        population: 42,
        softCapacity: 5000,
        status: 'open',
      }],
    };
    assert.deepEqual(normalizeRealmDirectory(directory), directory);
    assert.equal(normalizeRealmDirectory({ ...directory, realms: [{ ...directory.realms[0], status: 'seasonal' }] }), null);
    assert.equal(normalizeRealmDirectory({ ...directory, realms: [{ ...directory.realms[0], population: -1 }] }), null);
    assert.equal(normalizeRealmDirectory({ ...directory, realms: [{ ...directory.realms[0], hardCapacity: 100 }] }), null);
  });
});
