import type { ComponentType } from 'react';
import type { RiftThreeEnemySceneProps } from './RiftThreeEnemyScene';

interface IdleWindow {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

let runtimePromise: Promise<{ RiftThreeEnemyScene: ComponentType<RiftThreeEnemySceneProps> }> | null = null;

export const loadRiftThreeEnemyRuntime = () => {
  runtimePromise ??= import('./RiftThreeEnemyScene');
  return runtimePromise;
};

export const scheduleRiftThreePreload = (modelUrl: string) => {
  const idleWindow = window as unknown as IdleWindow;
  const abortController = new AbortController();
  let timeoutHandle: number | null = null;
  let idleHandle: number | null = null;

  const preload = () => {
    void loadRiftThreeEnemyRuntime();
    void fetch(modelUrl, {
      cache: 'force-cache',
      priority: 'low',
      signal: abortController.signal,
    }).then(response => {
      if (!response.ok) {
        throw new Error(`Ironroot preload failed with HTTP ${response.status}.`);
      }
      return response.arrayBuffer();
    }).catch(() => undefined);
  };

  if (idleWindow.requestIdleCallback) {
    idleHandle = idleWindow.requestIdleCallback(preload, { timeout: 1_500 });
  } else {
    timeoutHandle = window.setTimeout(preload, 250);
  }

  return () => {
    abortController.abort();
    if (idleHandle !== null) {
      idleWindow.cancelIdleCallback?.(idleHandle);
    }
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  };
};
