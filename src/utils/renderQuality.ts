import {
  getDefaultGameRenderProfile,
  selectGameRenderProfile,
  type GameRenderProfile,
} from '../game/renderQuality';

let cachedRenderProfile: GameRenderProfile | null = null;

export const getGameRenderProfile = () => {
  if (cachedRenderProfile) {
    return cachedRenderProfile;
  }

  if (typeof navigator === 'undefined') {
    return getDefaultGameRenderProfile();
  }

  const deviceNavigator = navigator as Navigator & { deviceMemory?: number };
  cachedRenderProfile = selectGameRenderProfile({
    deviceMemory: deviceNavigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    userAgent: navigator.userAgent,
  });
  return cachedRenderProfile;
};

export const initializeGameRenderQuality = () => {
  const profile = getGameRenderProfile();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.renderQuality = profile.quality;
  }
  return profile;
};
