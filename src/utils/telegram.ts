import { createPlayerProfile, DEFAULT_PLAYER_PROFILE } from '../shared/playerProfile';

type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotificationType = 'error' | 'success' | 'warning';

interface TelegramHapticFeedback {
  impactOccurred?: (style: HapticImpactStyle) => void;
  notificationOccurred?: (type: HapticNotificationType) => void;
}

interface TelegramWebApp {
  HapticFeedback?: TelegramHapticFeedback;
  initData?: string;
  initDataUnsafe?: {
    user?: {
      first_name?: string;
      id?: number;
      last_name?: string;
      photo_url?: string;
      username?: string;
    };
  };
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
}

let telegramInitialized = false;

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export const getTelegramWebApp = () => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.Telegram?.WebApp;
};

export const initializeTelegramApp = () => {
  if (telegramInitialized) {
    return;
  }

  const webApp = getTelegramWebApp();

  try {
    webApp?.ready?.();
    webApp?.expand?.();
    if (webApp?.isVersionAtLeast?.('7.7')) {
      webApp.disableVerticalSwipes?.();
    }
    telegramInitialized = true;
  } catch {
    // Telegram bridge methods can throw in non-Telegram browser previews.
  }
};

export const getTelegramPlayerId = () => {
  const userId = getTelegramWebApp()?.initDataUnsafe?.user?.id;
  return typeof userId === 'number' ? `telegram:${userId}` : null;
};

export const getTelegramInitData = () => {
  const initData = getTelegramWebApp()?.initData;
  return typeof initData === 'string' && initData.length > 0 ? initData : null;
};

export const getLocalPlayerProfilePreview = () => {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  if (!user) {
    return DEFAULT_PLAYER_PROFILE;
  }

  return createPlayerProfile({
    firstName: user.first_name,
    lastName: user.last_name,
    photoUrl: user.photo_url,
    source: 'telegram',
    username: user.username,
  }) ?? DEFAULT_PLAYER_PROFILE;
};

export type { HapticImpactStyle, HapticNotificationType };
