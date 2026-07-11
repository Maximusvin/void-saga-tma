import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanupOwnedPixiScene,
  OWNED_PIXI_SCENE_DESTROY_OPTIONS,
} from './pixiSceneLifecycle';

describe('cleanupOwnedPixiScene', () => {
  it('cleans a scene while its Pixi application is still active', () => {
    const calls: string[] = [];
    const animateScene = () => undefined;
    let destroyOptions: unknown;
    const scene = {
      destroy: (options: unknown) => {
        destroyOptions = options;
        calls.push('scene.destroy');
      },
    };
    const application = {
      stage: {
        removeChild: () => calls.push('stage.removeChild'),
      },
      ticker: {
        remove: () => calls.push('ticker.remove'),
      },
    };

    const cleaned = cleanupOwnedPixiScene(
      application,
      application,
      scene,
      animateScene,
      () => calls.push('prepareForDestroy'),
    );

    assert.equal(cleaned, true);
    assert.deepEqual(calls, [
      'ticker.remove',
      'stage.removeChild',
      'prepareForDestroy',
      'scene.destroy',
    ]);
    assert.deepEqual(destroyOptions, OWNED_PIXI_SCENE_DESTROY_OPTIONS);
  });

  it('skips scene cleanup after the owning application was destroyed', () => {
    const calls: string[] = [];
    const application = {
      stage: {
        removeChild: () => calls.push('stage.removeChild'),
      },
      ticker: {
        remove: () => calls.push('ticker.remove'),
      },
    };
    const scene = {
      destroy: () => calls.push('scene.destroy'),
    };

    const cleaned = cleanupOwnedPixiScene(null, application, scene, () => undefined);

    assert.equal(cleaned, false);
    assert.deepEqual(calls, []);
  });
});
