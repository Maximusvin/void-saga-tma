import { getTelegramWebApp } from './telegram';
import type { HapticImpactStyle, HapticNotificationType } from './telegram';

export const triggerHaptic = (style: HapticImpactStyle) => {
  try {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  } catch {
    // Haptics are optional outside Telegram.
  }
};

export const triggerHapticNotification = (type: HapticNotificationType) => {
  try {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  } catch {
    // Haptics are optional outside Telegram.
  }
};
