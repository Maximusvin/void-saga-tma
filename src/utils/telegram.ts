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

const FULLSCREEN_CONTROL_FALLBACK_TOP = 48;

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

/**
 * Telegram's content inset is relative to the device safe area, and CSS adds the
 * two together. Returning `safeTop + clearance` here would count the status bar
 * twice, so this only guards the case where a fullscreen client draws its close
 * and menu controls without reporting any content inset for them.
 */
const getContentSafeAreaTop = (webApp: TelegramWebApp | undefined) => {
  const contentTop = webApp?.contentSafeAreaInset?.top ?? 0;

  if (webApp?.isFullscreen && contentTop <= 0) {
    return FULLSCREEN_CONTROL_FALLBACK_TOP;
  }

  return contentTop;
};

/**
 * Telegram can report a zero stable height before the viewport is known, and
 * `viewportChanged` is the only signal that would repair it. Prefer the stable
 * height, fall back to the live window height, and give up rather than write a
 * value that cannot be a real viewport.
 */
const getStableViewportHeight = (webApp: TelegramWebApp | undefined) => {
  const reported = webApp?.viewportStableHeight;
  if (typeof reported === 'number' && Number.isFinite(reported) && reported > 0) {
    return reported;
  }

  if (typeof window !== 'undefined' && window.innerHeight > 0) {
    return window.innerHeight;
  }

  return null;
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
    toCssPixelValue(getContentSafeAreaTop(webApp)),
  );
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.contentRight, toCssPixelValue(contentSafeArea?.right));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.contentBottom, toCssPixelValue(contentSafeArea?.bottom));
  rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.contentLeft, toCssPixelValue(contentSafeArea?.left));

  const stableViewportHeight = getStableViewportHeight(webApp);
  if (stableViewportHeight === null) {
    // Clamping a bogus 0 to 1px would collapse the whole shell; leaving the
    // property unset lets CSS fall back to 100dvh instead.
    rootStyle.removeProperty(RUNTIME_INSET_PROPERTIES.viewportHeight);
  } else {
    rootStyle.setProperty(RUNTIME_INSET_PROPERTIES.viewportHeight, `${stableViewportHeight}px`);
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

    // Telegram's events are the primary signal, but they never fire outside a
    // Telegram client and can be missed on rotation, so resync on the DOM ones.
    if (typeof window !== 'undefined') {
      const resync = () => syncTelegramViewportTokens(getTelegramWebApp());
      window.addEventListener('resize', resync, { passive: true });
      window.addEventListener('orientationchange', resync, { passive: true });
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
