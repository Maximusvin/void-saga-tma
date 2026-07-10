export interface EnemyImpactSignal {
  id: number;
  normalizedX: number;
  normalizedY: number;
  source: 'passive' | 'tap';
}

export interface EnemyCritSignal {
  id: number;
  impactId: number;
}

export interface EnemyRigMotionState {
  critEnergy: number;
  deathProgress: number;
  headRotation: number;
  headVelocity: number;
  hitEnergy: number;
  kneeCompression: number;
  kneeVelocity: number;
  rootX: number;
  rootVelocityX: number;
  secondaryRotation: number;
  secondaryVelocity: number;
  torsoRotation: number;
  torsoVelocity: number;
}

export interface EnemyRigPose {
  armLag: number;
  breathScale: number;
  critEnergy: number;
  deathProgress: number;
  headRotation: number;
  hitEnergy: number;
  kneeCompression: number;
  rootX: number;
  rootY: number;
  secondaryRotation: number;
  torsoRotation: number;
  weightShift: number;
}

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

const advanceSpring = (
  value: number,
  velocity: number,
  stiffness: number,
  damping: number,
  deltaSeconds: number,
) => {
  const acceleration = -stiffness * value - damping * velocity;
  const nextVelocity = velocity + acceleration * deltaSeconds;
  return {
    value: value + nextVelocity * deltaSeconds,
    velocity: nextVelocity,
  };
};

export const createEnemyRigMotionState = (): EnemyRigMotionState => ({
  critEnergy: 0,
  deathProgress: 0,
  headRotation: 0,
  headVelocity: 0,
  hitEnergy: 0,
  kneeCompression: 0,
  kneeVelocity: 0,
  rootX: 0,
  rootVelocityX: 0,
  secondaryRotation: 0,
  secondaryVelocity: 0,
  torsoRotation: 0,
  torsoVelocity: 0,
});

export const applyEnemyImpact = (
  state: EnemyRigMotionState,
  impact: EnemyImpactSignal,
  reduceMotion: boolean,
) => {
  const side = impact.normalizedX >= 0 ? -1 : 1;
  const verticalBias = clamp(impact.normalizedY, -1, 1);
  const strength = reduceMotion ? 0.38 : impact.source === 'passive' ? 0.82 : 1;

  state.rootVelocityX = clamp(state.rootVelocityX + side * 270 * strength, -350, 350);
  state.torsoVelocity = clamp(state.torsoVelocity + side * 2.15 * strength, -3.1, 3.1);
  state.headVelocity = clamp(state.headVelocity + side * (4.8 - verticalBias * 0.55) * strength, -7, 7);
  state.secondaryVelocity = clamp(state.secondaryVelocity + side * 6.4 * strength, -9, 9);
  state.kneeVelocity = clamp(state.kneeVelocity + (165 + verticalBias * 22) * strength, 0, 220);
  state.hitEnergy = clamp(state.hitEnergy + 0.88 * strength, 0, 1.6);
};

export const applyEnemyCrit = (state: EnemyRigMotionState) => {
  state.critEnergy = 1;
};

export const beginEnemyDeath = (state: EnemyRigMotionState) => {
  state.deathProgress = Math.max(state.deathProgress, 0.001);
};

export const advanceEnemyRigMotion = (
  state: EnemyRigMotionState,
  elapsedSeconds: number,
  deltaSeconds: number,
  reduceMotion: boolean,
): EnemyRigPose => {
  const delta = clamp(deltaSeconds, 0, 0.05);
  const stepCount = Math.max(1, Math.ceil(delta / (1 / 120)));
  const stepDelta = delta / stepCount;
  for (let index = 0; index < stepCount; index += 1) {
    const root = advanceSpring(state.rootX, state.rootVelocityX, 160, 25.4, stepDelta);
    const torso = advanceSpring(state.torsoRotation, state.torsoVelocity, 185, 27.2, stepDelta);
    const head = advanceSpring(state.headRotation, state.headVelocity, 250, 29, stepDelta);
    const secondary = advanceSpring(state.secondaryRotation, state.secondaryVelocity, 105, 16.8, stepDelta);
    const knee = advanceSpring(state.kneeCompression, state.kneeVelocity, 260, 31, stepDelta);

    state.rootX = root.value;
    state.rootVelocityX = root.velocity;
    state.torsoRotation = torso.value;
    state.torsoVelocity = torso.velocity;
    state.headRotation = head.value;
    state.headVelocity = head.velocity;
    state.secondaryRotation = secondary.value;
    state.secondaryVelocity = secondary.velocity;
    state.kneeCompression = clamp(knee.value, 0, 8);
    state.kneeVelocity = knee.velocity;
  }
  state.hitEnergy = Math.max(0, state.hitEnergy - delta / 0.34);
  state.critEnergy = Math.max(0, state.critEnergy - delta / 0.22);

  if (state.deathProgress > 0) {
    state.deathProgress = Math.min(1, state.deathProgress + delta / 0.7);
  }

  const idleBreath = reduceMotion
    ? 0
    : Math.sin(elapsedSeconds * 1.08) * 0.0048
      + Math.sin(elapsedSeconds * 0.47 + 1.1) * 0.0018;
  const idleWeight = reduceMotion
    ? 0
    : Math.sin(elapsedSeconds * 0.61 + 0.4) * 2.2
      + Math.sin(elapsedSeconds * 0.23 + 2.3) * 0.7;
  const idleHead = reduceMotion
    ? 0
    : Math.sin(elapsedSeconds * 0.38 + 0.8) * 0.011
      + Math.sin(elapsedSeconds * 0.17 + 1.7) * 0.004;
  const deathEase = state.deathProgress * state.deathProgress * (3 - 2 * state.deathProgress);

  return {
    armLag: state.secondaryRotation * 0.64,
    breathScale: 1 + idleBreath,
    critEnergy: state.critEnergy,
    deathProgress: deathEase,
    headRotation: state.headRotation + idleHead - deathEase * 0.08,
    hitEnergy: state.hitEnergy,
    kneeCompression: state.kneeCompression + deathEase * 42,
    rootX: state.rootX + idleWeight - deathEase * 42,
    rootY: deathEase * 118,
    secondaryRotation: state.secondaryRotation + Math.sin(elapsedSeconds * 0.73 + 0.2) * (reduceMotion ? 0 : 0.018),
    torsoRotation: state.torsoRotation + idleWeight * 0.0015 - deathEase * 0.17,
    weightShift: idleWeight,
  };
};
