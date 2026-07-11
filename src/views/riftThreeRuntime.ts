import type { ComponentType } from 'react';
import type { RiftThreeEnemySceneProps } from './RiftThreeEnemyScene';

interface IdleWindow {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

let runtimePromise: Promise<{ RiftThreeEnemyScene: ComponentType<RiftThreeEnemySceneProps> }> | null = null;
const modelPreloads = new Map<string, Promise<void>>();

export const loadRiftThreeEnemyRuntime = () => {
  runtimePromise ??= import('./RiftThreeEnemyScene');
  return runtimePromise;
};

export const scheduleRiftThreePreload = (modelUrl: string) => {
  const idleWindow = window as unknown as IdleWindow;
  let timeoutHandle: number | null = null;
  let idleHandle: number | null = null;
  let started = false;

  const preload = () => {
    started = true;
    void loadRiftThreeEnemyRuntime();
    if (!modelPreloads.has(modelUrl)) {
      const request = fetch(modelUrl, {
        cache: 'force-cache',
        priority: 'low',
      }).then(response => {
        if (!response.ok) {
          throw new Error(`Ironroot preload failed with HTTP ${response.status}.`);
        }
        return response.arrayBuffer();
      }).then(() => undefined).catch(() => {
        modelPreloads.delete(modelUrl);
      });
      modelPreloads.set(modelUrl, request);
    }
  };

  if (idleWindow.requestIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback(preload, { timeout: 400 });
  } else {
    timeoutHandle = window.setTimeout(preload, 50);
  }

  return () => {
    // Once the request starts, let it finish into the immutable HTTP cache. An
    // encounter change is exactly when aborting would make the next mob slow.
    if (!started && idleHandle !== null) {
      idleWindow.cancelIdleCallback?.(idleHandle);
    }
    if (!started && timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  };
};
