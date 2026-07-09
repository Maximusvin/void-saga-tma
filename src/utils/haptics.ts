import { getTelegramWebApp } from './telegram';
import type { HapticImpactStyle, HapticNotificationType } from './telegram';

export const triggerHaptic = (style: HapticImpactStyle) => {
  try {
    const webApp = getTelegramWebApp();
    if (webApp?.isVersionAtLeast?.('6.1')) {
      webApp.HapticFeedback?.impactOccurred?.(style);
    }
  } catch {
    // Haptics are optional outside Telegram.
  }
};

export const triggerHapticNotification = (type: HapticNotificationType) => {
  try {
    const webApp = getTelegramWebApp();
    if (webApp?.isVersionAtLeast?.('6.1')) {
      webApp.HapticFeedback?.notificationOccurred?.(type);
    }
  } catch {
    // Haptics are optional outside Telegram.
  }
};
