// Helper to safely call Telegram WebApp haptic feedback
export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
  try {
    // @ts-ignore
    if (window.Telegram?.WebApp?.HapticFeedback) {
      // @ts-ignore
      window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    }
  } catch (e) {
    // ignore
  }
};

export const triggerHapticNotification = (type: 'error' | 'success' | 'warning') => {
  try {
    // @ts-ignore
    if (window.Telegram?.WebApp?.HapticFeedback) {
      // @ts-ignore
      window.Telegram.WebApp.HapticFeedback.notificationOccurred(type);
    }
  } catch (e) {
    // ignore
  }
};
