import assert from 'node:assert/strict';
import test from 'node:test';
import { getCrossedProgressionMilestones } from './progression';

test('records only configured milestones crossed by forward progress', () => {
  assert.deepEqual(getCrossedProgressionMilestones(1, 4), []);
  assert.deepEqual(getCrossedProgressionMilestones(4, 25), [5, 10, 25]);
  assert.deepEqual(getCrossedProgressionMilestones(149, 250), [150, 250]);
});

test('does not create milestones for replays or stage regressions', () => {
  assert.deepEqual(getCrossedProgressionMilestones(25, 25), []);
  assert.deepEqual(getCrossedProgressionMilestones(50, 25), []);
});
