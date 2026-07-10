import type { GameRenderProfile } from './renderQuality';

export interface AngelShowcaseBudget {
  maxFps: number;
  particleCount: number;
  useLowResolutionAssets: boolean;
}

export interface AngelShowcaseFrame {
  bodyLift: number;
  bodyScaleX: number;
  bodyScaleY: number;
  chestExpansion: number;
  coreScale: number;
  eyeOpenness: number;
  hairWind: number;
  haloAlpha: number;
  haloRotation: number;
  headOffsetX: number;
  headOffsetY: number;
  headRotation: number;
  particleSpeed: number;
  wingRotation: number;
  wingScale: number;
}

const BLINK_LOOP_SECONDS = 29;
const BLINK_STARTS_SECONDS = [1.55, 5.4, 10.2, 14.1, 14.55, 20.3, 24.7] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const smoothstep = (from: number, to: number, value: number) => {
  const normalized = clamp01((value - from) / (to - from));
  return normalized * normalized * (3 - 2 * normalized);
};

const getBlinkClosure = (elapsedSeconds: number) => {
  const loopTime = ((elapsedSeconds % BLINK_LOOP_SECONDS) + BLINK_LOOP_SECONDS) % BLINK_LOOP_SECONDS;
  let closure = 0;

  for (const blinkStart of BLINK_STARTS_SECONDS) {
    const blinkTime = loopTime - blinkStart;
    if (blinkTime < 0 || blinkTime > 0.3) {
      continue;
    }

    const blinkClosure = blinkTime < 0.065
      ? smoothstep(0, 0.065, blinkTime)
      : blinkTime < 0.14
        ? 1
        : 1 - smoothstep(0.14, 0.3, blinkTime);
    closure = Math.max(closure, blinkClosure);
  }

  return closure;
};

export const getAngelShowcaseBudget = (
  profile: GameRenderProfile,
  reduceMotion: boolean,
): AngelShowcaseBudget => {
  if (reduceMotion) {
    return {
      maxFps: Math.min(24, profile.maxFps),
      particleCount: profile.quality === 'low' ? 3 : 5,
      useLowResolutionAssets: profile.quality !== 'high',
    };
  }

  return {
    maxFps: profile.maxFps,
    particleCount: profile.quality === 'high' ? 14 : profile.quality === 'balanced' ? 9 : 5,
    useLowResolutionAssets: profile.quality === 'low',
  };
};

export const getAngelShowcaseFrame = (
  elapsedSeconds: number,
  surgeEnergy: number,
  reduceMotion: boolean,
): AngelShowcaseFrame => {
  const boundedSurge = Math.min(1, Math.max(0, surgeEnergy));
  const idle = reduceMotion ? 0 : Math.sin(elapsedSeconds * 1.34);
  const wingCycle = reduceMotion ? 0 : Math.sin(elapsedSeconds * 0.82 + 0.4);
  const inhale = reduceMotion ? 0 : (idle + 1) / 2;
  const headDrift = reduceMotion
    ? 0
    : Math.sin(elapsedSeconds * 0.43 + 0.35) * 0.01
      + Math.sin(elapsedSeconds * 0.17 + 1.1) * 0.004;
  const hairWind = reduceMotion
    ? 0
    : Math.sin(elapsedSeconds * 0.71 + 0.9) * 0.62
      + Math.sin(elapsedSeconds * 1.37 + 2.2) * 0.22;

  return {
    bodyLift: idle * 1.6 - boundedSurge * 15,
    bodyScaleX: 1 - idle * 0.0015 + boundedSurge * 0.014,
    bodyScaleY: 1 + idle * 0.0035 + boundedSurge * 0.02,
    chestExpansion: inhale,
    coreScale: 1 + idle * 0.055 + boundedSurge * 0.72,
    eyeOpenness: reduceMotion ? 1 : 1 - getBlinkClosure(elapsedSeconds),
    hairWind,
    haloAlpha: 0.42 + idle * 0.08 + boundedSurge * 0.38,
    haloRotation: elapsedSeconds * (reduceMotion ? 0.012 : 0.034) + boundedSurge * 0.14,
    headOffsetX: reduceMotion
      ? 0
      : Math.sin(elapsedSeconds * 0.31 + 0.7) * 2.1 + Math.sin(elapsedSeconds * 0.13) * 0.8,
    headOffsetY: reduceMotion ? 0 : -inhale * 1.8 + Math.sin(elapsedSeconds * 0.23 + 1.8) * 0.55,
    headRotation: headDrift,
    particleSpeed: reduceMotion ? 0.28 : 1 + boundedSurge * 2.4,
    wingRotation: wingCycle * 0.022 + boundedSurge * 0.095,
    wingScale: 1 + wingCycle * 0.008 + boundedSurge * 0.045,
  };
};
