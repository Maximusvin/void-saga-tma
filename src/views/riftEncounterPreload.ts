import type { GameRenderQuality } from '../game/renderQuality';
import { hasSkinnedThreeRig, type RiftEnemyVisualSpec } from '../game/riftVisuals';
import { scheduleRiftThreePreload } from './riftThreeRuntime';

interface IdleWindow {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

const imagePreloads = new Set<string>();

const warmImage = (url: string) => {
  if (imagePreloads.has(url)) {
    return;
  }
  imagePreloads.add(url);
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = 'low';
  image.src = url;
  void image.decode().catch(() => imagePreloads.delete(url));
};

export const scheduleRiftEncounterPreload = (
  visual: RiftEnemyVisualSpec,
  quality: GameRenderQuality,
) => {
  const idleWindow = window as unknown as IdleWindow;
  let idleHandle: number | null = null;
  let timeoutHandle: number | null = null;
  let started = false;
  const cancelThreePreload = hasSkinnedThreeRig(visual)
    ? scheduleRiftThreePreload(quality === 'high' ? visual.rig.high.model : visual.rig.low.model)
    : null;

  const preloadImages = () => {
    started = true;
    warmImage(visual.asset);
    warmImage(visual.backdrop);
  };

  if (idleWindow.requestIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback(preloadImages, { timeout: 400 });
  } else {
    timeoutHandle = window.setTimeout(preloadImages, 50);
  }

  return () => {
    cancelThreePreload?.();
    if (!started && idleHandle !== null) {
      idleWindow.cancelIdleCallback?.(idleHandle);
    }
    if (!started && timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  };
};
