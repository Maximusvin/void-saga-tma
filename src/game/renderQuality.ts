export type GameRenderQuality = 'low' | 'balanced' | 'high';

export interface GameRenderProfile {
  ambientSparkCount: number;
  antialias: boolean;
  burstScale: number;
  maxFps: number;
  particleScale: number;
  quality: GameRenderQuality;
  resolutionCap: number;
}

export interface GameRenderCapabilities {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  userAgent: string;
}

const RENDER_PROFILES: Record<GameRenderQuality, GameRenderProfile> = {
  low: {
    ambientSparkCount: 6,
    antialias: false,
    burstScale: 0.46,
    maxFps: 30,
    particleScale: 0.48,
    quality: 'low',
    resolutionCap: 1,
  },
  balanced: {
    ambientSparkCount: 8,
    antialias: false,
    burstScale: 0.65,
    maxFps: 45,
    particleScale: 0.64,
    quality: 'balanced',
    resolutionCap: 1.5,
  },
  high: {
    ambientSparkCount: 18,
    antialias: true,
    burstScale: 1,
    maxFps: 60,
    particleScale: 1,
    quality: 'high',
    resolutionCap: 2,
  },
};

export const getTelegramAndroidPerformanceClass = (userAgent: string) => {
  const match = userAgent.match(/Telegram-Android\/[^()]+\([^;]+;\s*Android[^;]+;\s*SDK[^;]+;\s*(LOW|AVERAGE|HIGH)\)/i);
  return match?.[1]?.toUpperCase() as 'LOW' | 'AVERAGE' | 'HIGH' | undefined;
};

export const selectGameRenderProfile = ({
  deviceMemory,
  hardwareConcurrency,
  userAgent,
}: GameRenderCapabilities): GameRenderProfile => {
  const telegramPerformanceClass = getTelegramAndroidPerformanceClass(userAgent);

  if (telegramPerformanceClass === 'LOW') {
    return RENDER_PROFILES.low;
  }
  if (telegramPerformanceClass === 'AVERAGE') {
    return RENDER_PROFILES.balanced;
  }
  if (telegramPerformanceClass === 'HIGH') {
    return RENDER_PROFILES.high;
  }

  if ((deviceMemory !== undefined && deviceMemory <= 2) || (hardwareConcurrency !== undefined && hardwareConcurrency <= 2)) {
    return RENDER_PROFILES.low;
  }
  if ((deviceMemory !== undefined && deviceMemory <= 4) || (hardwareConcurrency !== undefined && hardwareConcurrency <= 4)) {
    return RENDER_PROFILES.balanced;
  }

  return RENDER_PROFILES.high;
};

export const getDefaultGameRenderProfile = () => RENDER_PROFILES.high;
