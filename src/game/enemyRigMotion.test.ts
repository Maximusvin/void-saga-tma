import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceEnemyRigMotion,
  applyEnemyCrit,
  applyEnemyImpact,
  beginEnemyDeath,
  createEnemyRigMotionState,
} from './enemyRigMotion';

const stepFor = (seconds: number, state = createEnemyRigMotionState()) => {
  let pose = advanceEnemyRigMotion(state, 0, 0, false);
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 120) {
    pose = advanceEnemyRigMotion(state, elapsed, 1 / 120, false);
  }
  return { pose, state };
};

describe('enemy rig motion', () => {
  it('recoils away from the tapped side', () => {
    const leftHit = createEnemyRigMotionState();
    const rightHit = createEnemyRigMotionState();
    applyEnemyImpact(leftHit, { id: 1, normalizedX: -0.8, normalizedY: 0, source: 'tap' }, false);
    applyEnemyImpact(rightHit, { id: 2, normalizedX: 0.8, normalizedY: 0, source: 'tap' }, false);

    advanceEnemyRigMotion(leftHit, 0.04, 0.04, false);
    advanceEnemyRigMotion(rightHit, 0.04, 0.04, false);

    assert.ok(leftHit.rootX > 0);
    assert.ok(rightHit.rootX < 0);
    assert.ok(leftHit.headRotation > 0);
    assert.ok(rightHit.headRotation < 0);
  });

  it('bounds accumulated rapid-hit impulses', () => {
    const state = createEnemyRigMotionState();
    for (let index = 0; index < 20; index += 1) {
      applyEnemyImpact(state, { id: index, normalizedX: 1, normalizedY: 0.2, source: 'tap' }, false);
    }

    assert.equal(state.rootVelocityX, -350);
    assert.equal(state.hitEnergy, 1.6);
    assert.ok(Math.abs(state.headVelocity) <= 7);
  });

  it('settles close to rest after a single hit', () => {
    const state = createEnemyRigMotionState();
    applyEnemyImpact(state, { id: 1, normalizedX: 0.5, normalizedY: 0, source: 'tap' }, false);
    const { pose } = stepFor(0.7, state);

    assert.ok(Math.abs(pose.rootX - pose.weightShift) < 0.1);
    assert.ok(Math.abs(pose.torsoRotation - pose.weightShift * 0.0015) < 0.002);
    assert.equal(pose.hitEnergy, 0);
  });

  it('clamps long frame deltas and reduces impact amplitude', () => {
    const normal = createEnemyRigMotionState();
    const reduced = createEnemyRigMotionState();
    const impact = { id: 1, normalizedX: 1, normalizedY: 0, source: 'tap' } as const;
    applyEnemyImpact(normal, impact, false);
    applyEnemyImpact(reduced, impact, true);

    const normalPose = advanceEnemyRigMotion(normal, 0.1, 1, false);
    const reducedPose = advanceEnemyRigMotion(reduced, 0.1, 1, true);

    assert.ok(Math.abs(reducedPose.rootX) < Math.abs(normalPose.rootX));
    assert.equal(reducedPose.breathScale, 1);
  });

  it('adds crit light without adding a second physical impulse and completes death', () => {
    const state = createEnemyRigMotionState();
    applyEnemyImpact(state, { id: 1, normalizedX: 0, normalizedY: 0, source: 'tap' }, false);
    const velocityBeforeCrit = state.rootVelocityX;
    applyEnemyCrit(state);
    assert.equal(state.rootVelocityX, velocityBeforeCrit);
    beginEnemyDeath(state);
    const { pose } = stepFor(0.8, state);

    assert.equal(pose.deathProgress, 1);
    assert.ok(pose.rootY >= 118);
  });
});
