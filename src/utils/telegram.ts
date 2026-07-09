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
      id?: number;
    };
  };
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
}

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
  const webApp = getTelegramWebApp();

  try {
    webApp?.ready?.();
    webApp?.expand?.();
    webApp?.disableVerticalSwipes?.();
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

export type { HapticImpactStyle, HapticNotificationType };
