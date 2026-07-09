import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createInitialGameSnapshot } from './engine';
import { getServerActionRejection } from './actionPolicy';
import type { Hero } from './types';

const hero: Hero = {
  id: 'policy-hero',
  name: 'Policy Hero',
  rarity: 'Rare',
  level: 1,
  power: 10,
};

describe('server game action policy', () => {
  it('bounds tap damage by owned hero power, max combo and crit multiplier', () => {
    const snapshot = { ...createInitialGameSnapshot(), heroes: [hero] };

    assert.equal(
      getServerActionRejection(snapshot, {
        type: 'deal_damage',
        amount: 12,
        source: 'tap',
      }),
      null,
    );
    assert.equal(
      getServerActionRejection(snapshot, {
        type: 'deal_damage',
        amount: 13,
        source: 'tap',
      }),
      'damage_exceeds_allowed_power',
    );
  });

  it('does not allow passive damage without heroes or unavailable skills', () => {
    const snapshot = createInitialGameSnapshot();

    assert.equal(
      getServerActionRejection(snapshot, {
        type: 'deal_damage',
        amount: 1,
        source: 'passive',
      }),
      'damage_exceeds_allowed_power',
    );
    assert.equal(
      getServerActionRejection(snapshot, {
        type: 'deal_damage',
        amount: 1,
        source: 'skill',
      }),
      'skill_not_available',
    );
  });
});
