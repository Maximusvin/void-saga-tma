import { createPlayerProfile, DEFAULT_PLAYER_PROFILE } from '../shared/playerProfile';

type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type HapticNotificationType = 'error' | 'success' | 'warning';

interface TelegramHapticFeedback {
  impactOccurred?: (style: HapticImpactStyle) => void;
  notificationOccurred?: (type: HapticNotificationType) => void;
}

interface TelegramSafeAreaInset {
  bottom?: number;
  left?: number;
  right?: number;
  top?: number;
}

interface TelegramWebApp {
  HapticFeedback?: TelegramHapticFeedback;
  contentSafeAreaInset?: TelegramSafeAreaInset;
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
  isFullscreen?: boolean;
  onEvent?: (eventType: string, eventHandler: () => void) => void;
  ready?: () => void;
  safeAreaInset?: TelegramSafeAreaInset;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  requestFullscreen?: () => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  setHeaderColor?: (color: string) => void;
  viewportStableHeight?: number;
}

let telegramInitialized = false;

const FULLSCREEN_HOST_CONTROL_CLEARANCE = 48;

const RUNTIME_INSET_PROPERTIES = {
  contentBottom: '--app-runtime-content-safe-area-inset-bottom',
  contentLeft: '--app-runtime-content-safe-area-inset-left',
  contentRight: '--app-runtime-content-safe-area-inset-right',
  contentTop: '--app-runtime-content-safe-area-inset-top',
  safeBottom: '--app-runtime-safe-area-inset-bottom',
  safeLeft: '--app-runtime-safe-area-inset-left',
  safeRight: '--app-runtime-safe-area-inset-right',
  safeTop: '--app-runtime-safe-area-inset-top',
  viewportHeight: '--app-runtime-viewport-stable-height',
} as const;

const toCssPixelValue = (value: number | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0px';
  }

  return `${Math.min(256, Math.max(0, value))}px`;
};

const getFullscreenSafeContentTop = (webApp: TelegramWebApp | undefined) => {
  const safeTop = webApp?.safeAreaInset?.top ?? 0;
  const contentTop = webApp?.contentSafeAreaInset?.top ?? 0;

  if (!webApp?.isFullscreen) {
    return contentTop;
  }

  // Older Android clients can report only the status bar while Telegram's
  // close and menu controls still overlay the top row.
  return Math.max(contentTop, safeTop + FULLSCREEN_HOST_CONTROL_CLEARANCE);
};

const syncTelegramViewportTokens = (webApp: TelegramWebApp | undefined) => {
  if (typeof document === 'undefined') {
    return;
  }

  const rootStyle = document.documentElement.style;
  const safeArea = webApp?.safeAreaInset;
  const contentSafeArea = webApp?.contentSafeAreaInset;

  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.safeTop, toCssPixelValue(safeArea?.top));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.safeRight, toCssPixelValue(safeArea?.right));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.safeBottom, toCssPixelValue(safeArea?.bottom));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.safeLeft, toCssPixelValue(safeArea?.left));
  rootStyle.setProperty(
    RUNTIME_INSET_PROPERTIES.contentTop,
    toCssPixelValue(getFullscreenSafeContentTop(webApp)),
  );
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.contentRight, toCssPixelValue(contentSafeArea?.right));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.contentBottom, toCssPixelValue(contentSafeArea?.bottom));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.contentLeft, toCssPixelValue(contentSafeArea?.left));

  if (typeof webApp?.viewportStableHeight === 'number' && Number.isFinite(webApp.viewportStableHeight)) {
    rootStyle.setProperty(
      RUNTIME_INSET_PROPERTIES.viewportHeight,
      `${Math.max(1, webApp.viewportStableHeight)}px`,
    );
  }
};

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
    syncTelegramViewportTokens(webApp);
    for (const eventType of [
      'safeAreaChanged',
      'contentSafeAreaChanged',
      'fullscreenChanged',
      'viewportChanged',
    ]) {
      webApp?.onEvent?.(eventType, () => syncTelegramViewportTokens(webApp));
    }

    webApp?.ready?.();
    webApp?.expand?.();
    if (webApp?.isVersionAtLeast?.('6.1')) {
      webApp.setHeaderColor?.('#071315');
      webApp.setBackgroundColor?.('#071315');
    }
    if (webApp?.isVersionAtLeast?.('7.10')) {
      webApp.setBottomBarColor?.('#071315');
    }
    if (webApp?.isVersionAtLeast?.('7.7')) {
      webApp.disableVerticalSwipes?.();
    }
    if (webApp?.isVersionAtLeast?.('8.0') && !webApp.isFullscreen) {
      webApp.requestFullscreen?.();
    }
  } catch {
    // Telegram bridge methods can throw in non-Telegram browser previews.
  } finally {
    telegramInitialized = true;
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
