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
  coreScale: number;
  haloAlpha: number;
  haloRotation: number;
  particleSpeed: number;
  wingRotation: number;
  wingScale: number;
}

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
  const idle = reduceMotion ? 0 : Math.sin(elapsedSeconds * 1.55);
  const wingCycle = reduceMotion ? 0 : Math.sin(elapsedSeconds * 0.82 + 0.4);

  return {
    bodyLift: idle * 2.2 - boundedSurge * 15,
    bodyScaleX: 1 - idle * 0.002 + boundedSurge * 0.014,
    bodyScaleY: 1 + idle * 0.006 + boundedSurge * 0.02,
    coreScale: 1 + idle * 0.055 + boundedSurge * 0.72,
    haloAlpha: 0.42 + idle * 0.08 + boundedSurge * 0.38,
    haloRotation: elapsedSeconds * (reduceMotion ? 0.012 : 0.034) + boundedSurge * 0.14,
    particleSpeed: reduceMotion ? 0.28 : 1 + boundedSurge * 2.4,
    wingRotation: wingCycle * 0.022 + boundedSurge * 0.095,
    wingScale: 1 + wingCycle * 0.008 + boundedSurge * 0.045,
  };
};
