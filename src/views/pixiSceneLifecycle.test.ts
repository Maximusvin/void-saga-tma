import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanupOwnedPixiScene } from './pixiSceneLifecycle';

describe('cleanupOwnedPixiScene', () => {
  it('cleans a scene while its Pixi application is still active', () => {
    const calls: string[] = [];
    const animateScene = () => undefined;
    const scene = {
      destroy: () => calls.push('scene.destroy'),
    };
    const application = {
      stage: {
        removeChild: () => calls.push('stage.removeChild'),
      },
      ticker: {
        remove: () => calls.push('ticker.remove'),
      },
    };

    const cleaned = cleanupOwnedPixiScene(application, application, scene, animateScene);

    assert.equal(cleaned, true);
    assert.deepEqual(calls, ['ticker.remove', 'stage.removeChild', 'scene.destroy']);
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
